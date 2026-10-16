import { CapacitorCameraService } from "../capacitorCamera";
import { useLocationsStore } from "../../stores/locations";
import { useMapStore } from "../../stores/map";
import { usePersonsStore } from "../../stores/persons";
import type { PersonData } from "../../stores/persons";
import { usePowerSyncStore } from "../../stores/powersync";
import type { PlotRecord } from "../../powersync-schema";
import { headstoneAnalysisService } from "../../utils/headstoneAnalysisService";
import { rewritePublicStorageUrl } from "../../utils/storageUrl";
import { createFieldTools } from "./fieldTools";
import type { PersonSummary, PlotSummary } from "./fieldTools";
import type { AgentTool } from "./types";

function asPlot(row: PlotRecord | null | undefined): PlotSummary | null {
  if (!row?.id) return null;
  return {
    id: row.id,
    location_id: row.location_id,
    section: row.section,
    row: row.row,
    number: row.number,
    status: row.status,
    notes: row.notes,
    monument_material: row.monument_material,
    monument_form: row.monument_form,
    monument_condition: row.monument_condition,
    monument_detail: row.monument_detail,
    geometry: row.geometry,
    temp_plot_id: row.temp_plot_id,
  };
}

function asPerson(person: PersonData): PersonSummary {
  return {
    id: person.id,
    plot_id: person.plot_id,
    full_name: person.full_name,
    forename: person.forename,
    surname: person.surname,
    date_of_birth: person.date_of_birth,
    date_of_death: person.date_of_death,
  };
}

async function loadPlot(plotId: string): Promise<PlotSummary | null> {
  const db = usePowerSyncStore().powerSync;
  if (!db) throw new Error("The cemetery database is not ready.");
  try {
    const row = (await db.get("SELECT * FROM plots WHERE id = ?", [
      plotId,
    ])) as PlotRecord | null;
    return asPlot(row);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Result set is empty")
    ) {
      return null;
    }
    throw error;
  }
}

function dataUrlToFile(dataUrl: string, fileName: string, format: string): File {
  const trimmed = dataUrl.trim();
  const payload = trimmed.startsWith("data:")
    ? trimmed
    : `data:${format || "image/jpeg"};base64,${trimmed}`;
  const [header, body] = payload.split(",");
  const mime =
    header.match(/data:(.*?);/)?.[1] || format || "image/jpeg";
  const binary = atob(body || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], fileName, { type: mime });
}

async function latestPlotPhoto(plotId: string): Promise<File | null> {
  const db = usePowerSyncStore().powerSync;
  if (!db) return null;
  const rows = await db.getAll(
    "SELECT data, cloud_url, file_name, format FROM plot_images WHERE plot_id = ? ORDER BY date_created DESC LIMIT 1",
    [plotId],
  );
  const image = rows[0] as
    | {
        data?: string;
        cloud_url?: string;
        file_name?: string;
        format?: string;
      }
    | undefined;
  if (!image) return null;
  const fileName = image.file_name || "headstone.jpg";
  const format = image.format || "image/jpeg";
  if (image.data && String(image.data).trim().length > 32) {
    return dataUrlToFile(String(image.data), fileName, format);
  }
  if (
    image.cloud_url &&
    !String(image.cloud_url).includes("mock-storage.dev")
  ) {
    const response = await fetch(rewritePublicStorageUrl(image.cloud_url));
    if (!response.ok) return null;
    const blob = await response.blob();
    return new File([blob], fileName, { type: blob.type || format });
  }
  return null;
}

async function ensureTempPlotId(plot: PlotSummary): Promise<string> {
  if (plot.temp_plot_id) return plot.temp_plot_id;
  const db = usePowerSyncStore().powerSync;
  if (!db) throw new Error("The cemetery database is not ready.");
  const tempId = `agent_${plot.id}`;
  await db.execute("UPDATE plots SET temp_plot_id = ? WHERE id = ?", [
    tempId,
    plot.id,
  ]);
  return tempId;
}

export function createLiveFieldTools(): AgentTool[] {
  return createFieldTools({
    getSelectedCemetery() {
      const location = useLocationsStore().selectedLocation;
      if (!location) return null;
      return { id: location.id, name: location.name };
    },
    async listPlots(locationId) {
      const rows = await usePowerSyncStore().getPlotsByLocation(locationId);
      return rows.map((row) => asPlot(row)).filter((row): row is PlotSummary => !!row);
    },
    getPlot: loadPlot,
    async getPeopleOnPlot(plotId) {
      const persons = usePersonsStore();
      await persons.loadPersons();
      return persons.getPersonsByPlot(plotId).map(asPerson);
    },
    async searchPeople(query) {
      const persons = usePersonsStore();
      const locations = useLocationsStore();
      await persons.loadPersons();
      const cemeteryId = locations.selectedLocation?.id;
      const plotIds = new Set(
        cemeteryId
          ? (await usePowerSyncStore().getPlotsByLocation(cemeteryId)).map(
              (plot) => plot.id,
            )
          : [],
      );
      return persons
        .searchPersons(query)
        .filter((person) => plotIds.has(person.plot_id))
        .map(asPerson);
    },
    async focusCemetery() {
      const mapStore = useMapStore();
      if (!mapStore.map) {
        return { ok: false, error: "The map is not open." };
      }
      if (!mapStore.currentLocation) {
        return { ok: false, error: "No GPS fix yet." };
      }
      mapStore.centerOnLocation();
      return { ok: true };
    },
    async focusPlot(plot) {
      const mapStore = useMapStore();
      if (!mapStore.map) {
        return { ok: false, error: "The map is not open." };
      }
      if (!plot.geometry) {
        return { ok: false, error: "That plot has no outline to zoom to." };
      }
      await mapStore.zoomToPlot(plot);
      return { ok: true, plot_id: plot.id };
    },
    async updatePlot(plotId, patch) {
      const updated = await usePowerSyncStore().updateExistingPlot(plotId, patch);
      const plot = asPlot(updated);
      if (!plot) throw new Error("Plot update did not return a row.");
      return plot;
    },
    async addPerson(input) {
      const created = await usePersonsStore().createPerson({
        plot_id: String(input.plot_id),
        title: typeof input.title === "string" ? input.title : "",
        forename: typeof input.forename === "string" ? input.forename : "",
        middle_name:
          typeof input.middle_name === "string" ? input.middle_name : "",
        surname: typeof input.surname === "string" ? input.surname : "",
        date_of_birth:
          typeof input.date_of_birth === "string" ? input.date_of_birth : "",
        date_of_death:
          typeof input.date_of_death === "string" ? input.date_of_death : "",
        deceased: true,
      });
      if (!created) throw new Error("The person could not be saved.");
      return asPerson(created);
    },
    async getGps() {
      try {
        const fix = await useMapStore().getCurrentLocation();
        if (!Number.isFinite(fix.latitude) || !Number.isFinite(fix.longitude)) {
          return null;
        }
        return { latitude: fix.latitude, longitude: fix.longitude };
      } catch {
        return null;
      }
    },
    nextPlotNumber() {
      return usePowerSyncStore().generateNextPlotNumber();
    },
    async createPlot(input) {
      const created = await usePowerSyncStore().createNewPlot({
        geometry: input.geometry,
        section: input.section,
        row: input.row,
        number: input.number,
        status: input.status,
        location_id: input.location_id,
        notes: input.notes,
        temp_plot_id: null,
        date_created: "",
        date_modified: "",
        created_by: "",
        modified_by: "",
        monument_material: null,
        monument_form: null,
        monument_condition: null,
        monument_detail: null,
      });
      return {
        id: created.id,
        number: created.number,
        section: created.section,
        row: created.row,
        geometry: created.geometry,
      };
    },
    async beginDrawing() {
      const mapStore = useMapStore();
      if (!mapStore.map) {
        return { ok: false, error: "The map is not open." };
      }
      if (!mapStore.drawingMode) mapStore.toggleDrawingMode();
      return { ok: true, drawing: true };
    },
    async readHeadstone(plot) {
      let file = await latestPlotPhoto(plot.id);
      if (!file) {
        try {
          const photo =
            await CapacitorCameraService.getInstance().takeGravePhoto();
          if (!photo.dataUrl) {
            throw new Error("Camera did not return a photo.");
          }
          file = dataUrlToFile(photo.dataUrl, "headstone.jpg", "image/jpeg");
        } catch (error) {
          const detail = error instanceof Error ? error.message : "";
          throw new Error(
            detail
              ? `Could not open the camera (${detail}). Ask the person to take the photo in the plot wizard.`
              : "Could not open the camera. Ask the person to take the photo in the plot wizard.",
          );
        }
      }
      const tempId = await ensureTempPlotId(plot);
      const reading = await headstoneAnalysisService.analyzeHeadstoneImage(
        file,
        tempId,
      );
      return {
        transcription: reading.full_text_transcription,
        persons: (reading.persons ?? []).map(asPerson),
      };
    },
  });
}
