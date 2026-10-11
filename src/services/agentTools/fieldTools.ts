import { lifeAge } from "../agentReply";
import { graveFootprint, type GraveSize } from "./graveFootprint";
import type { AgentTool, AgentToolResult } from "./types";

const PLOT_CAP = 25;
const PEOPLE_CAP = 20;

export interface CemeterySummary {
  id: string;
  name: string;
}

export interface PlotSummary {
  id: string;
  location_id?: string | null;
  section?: string | null;
  row?: string | null;
  number?: string | null;
  status?: string | null;
  notes?: string | null;
  monument_material?: string | null;
  monument_form?: string | null;
  monument_condition?: string | null;
  monument_detail?: string | null;
  geometry?: string | null;
  temp_plot_id?: string | null;
}

export interface PersonSummary {
  id: string;
  plot_id: string;
  full_name: string;
  forename?: string;
  surname?: string;
  date_of_birth?: string;
  date_of_death?: string;
}

export interface GpsFix {
  latitude: number;
  longitude: number;
}

export interface CreatedPlot {
  id: string;
  number?: string | null;
  section?: string | null;
  row?: string | null;
  geometry?: string | null;
}

export interface HeadstoneReading {
  persons: PersonSummary[];
  transcription?: string;
}

export interface FieldToolDeps {
  getSelectedCemetery: () => CemeterySummary | null;
  listPlots: (locationId: string) => Promise<PlotSummary[]>;
  getPlot: (plotId: string) => Promise<PlotSummary | null>;
  getPeopleOnPlot: (plotId: string) => Promise<PersonSummary[]>;
  searchPeople: (query: string) => Promise<PersonSummary[]>;
  focusCemetery: () => Promise<AgentToolResult>;
  focusPlot: (plot: PlotSummary) => Promise<AgentToolResult>;
  updatePlot: (
    plotId: string,
    patch: Record<string, string>,
  ) => Promise<PlotSummary>;
  addPerson: (input: Record<string, unknown>) => Promise<PersonSummary>;
  getGps: () => Promise<GpsFix | null>;
  nextPlotNumber: () => Promise<string>;
  createPlot: (input: {
    geometry: string;
    section: string;
    row: string;
    number: string;
    status: string;
    location_id: string;
    notes: string;
  }) => Promise<CreatedPlot>;
  beginDrawing: () => Promise<AgentToolResult>;
  readHeadstone: (plot: PlotSummary) => Promise<HeadstoneReading>;
}

const PLOT_PATCH_FIELDS = [
  "notes",
  "section",
  "row",
  "number",
  "status",
  "monument_material",
  "monument_form",
  "monument_condition",
  "monument_detail",
] as const;

function cemeteryRequired(
  deps: FieldToolDeps,
): CemeterySummary | AgentToolResult {
  const cemetery = deps.getSelectedCemetery();
  if (!cemetery) {
    return { ok: false, error: "Choose a cemetery first." };
  }
  return cemetery;
}

function plotInCemetery(
  plot: PlotSummary,
  cemetery: CemeterySummary,
): AgentToolResult | null {
  if (plot.location_id && plot.location_id !== cemetery.id) {
    return { ok: false, error: "That plot is not in the open cemetery." };
  }
  return null;
}

function publicPlot(plot: PlotSummary) {
  return {
    id: plot.id,
    section: plot.section ?? "",
    row: plot.row ?? "",
    number: plot.number ?? "",
    status: plot.status ?? "",
    notes: plot.notes ?? "",
    monument_material: plot.monument_material ?? "",
    monument_form: plot.monument_form ?? "",
    monument_condition: plot.monument_condition ?? "",
    monument_detail: plot.monument_detail ?? "",
    hasGeometry: Boolean(plot.geometry),
  };
}

function yearInput(value: unknown): string {
  return typeof value === "string" && /^\d{4}$/.test(value.trim()) ? value.trim() : "";
}

function yearMatches(value: string | undefined, year: string): boolean {
  if (!value) return false;
  return (
    value.startsWith(year) ||
    value.endsWith(year) ||
    value.includes(`-${year}`) ||
    value.includes(`/${year}`)
  );
}

type AgeOp = "gt" | "gte" | "lt" | "lte" | "eq";

function ageYearsInput(value: unknown): number | null {
  const years =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isInteger(years) || years < 0 || years > 130) return null;
  return years;
}

function ageOpInput(value: unknown): AgeOp {
  if (value === "gt" || value === "gte" || value === "lt" || value === "lte" || value === "eq") {
    return value;
  }
  return "eq";
}

function dateParts(
  value: string | undefined,
): { year: number; month?: number; day?: number } | null {
  if (!value) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return { year };
    return { year, month, day };
  }
  const yearOnly = /\b(1[5-9]\d{2}|20\d{2})\b/.exec(value);
  if (!yearOnly) return null;
  return { year: Number(yearOnly[1]) };
}

function ageAtDeath(birth: string | undefined, death: string | undefined): number | null {
  const born = dateParts(birth);
  const died = dateParts(death);
  if (!born || !died) return null;
  let age = died.year - born.year;
  if (
    born.month != null &&
    born.day != null &&
    died.month != null &&
    died.day != null &&
    (died.month < born.month || (died.month === born.month && died.day < born.day))
  ) {
    age -= 1;
  }
  if (age < 0 || age > 130) return null;
  return age;
}

function ageMatches(age: number, years: number, op: AgeOp): boolean {
  if (op === "gt") return age > years;
  if (op === "gte") return age >= years;
  if (op === "lt") return age < years;
  if (op === "lte") return age <= years;
  return age === years;
}

function publicPerson(person: PersonSummary) {
  return {
    id: person.id,
    plot_id: person.plot_id,
    full_name: person.full_name,
    forename: person.forename ?? "",
    surname: person.surname ?? "",
    date_of_birth: person.date_of_birth ?? "",
    date_of_death: person.date_of_death ?? "",
  };
}

export function createFieldTools(deps: FieldToolDeps): AgentTool[] {
  return [
    {
      name: "get_selected_cemetery",
      description:
        "Read the cemetery the user currently has open, including its name and id.",
      readOnly: true,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      async execute() {
        const cemetery = cemeteryRequired(deps);
        if ("ok" in cemetery) return cemetery;
        return { ok: true, cemetery };
      },
    },
    {
      name: "list_plots",
      description:
        "List plots in the open cemetery. Optionally filter by section and number. Results are capped.",
      readOnly: true,
      inputSchema: {
        type: "object",
        properties: {
          section: { type: "string", description: "Section label, such as A." },
          number: { type: "string", description: "Plot number." },
        },
        additionalProperties: false,
      },
      async execute(input) {
        const cemetery = cemeteryRequired(deps);
        if ("ok" in cemetery) return cemetery;
        const section =
          typeof input.section === "string" ? input.section.trim() : "";
        const number =
          typeof input.number === "string" ? input.number.trim() : "";
        const plots = await deps.listPlots(cemetery.id);
        const matched = plots.filter((plot) => {
          if (
            section &&
            String(plot.section ?? "").toLowerCase() !== section.toLowerCase()
          ) {
            return false;
          }
          if (
            number &&
            String(plot.number ?? "").toLowerCase() !== number.toLowerCase()
          ) {
            return false;
          }
          return true;
        });
        return {
          ok: true,
          total: matched.length,
          plots: matched.slice(0, PLOT_CAP).map(publicPlot),
          truncated: matched.length > PLOT_CAP,
        };
      },
    },
    {
      name: "get_plot",
      description:
        "Read one plot in the open cemetery, including the people recorded on it.",
      readOnly: true,
      inputSchema: {
        type: "object",
        properties: {
          plot_id: { type: "string", description: "Plot id." },
        },
        required: ["plot_id"],
        additionalProperties: false,
      },
      async execute(input) {
        const cemetery = cemeteryRequired(deps);
        if ("ok" in cemetery) return cemetery;
        const plot = await deps.getPlot(String(input.plot_id));
        if (!plot) return { ok: false, error: "Plot not found." };
        const wrong = plotInCemetery(plot, cemetery);
        if (wrong) return wrong;
        const people = await deps.getPeopleOnPlot(plot.id);
        return {
          ok: true,
          plot: publicPlot(plot),
          people: people.map(publicPerson),
        };
      },
    },
    {
      name: "search_people",
      description:
        "Find people in the open cemetery by name, by the year they were born or died, or by age at death.",
      readOnly: true,
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Name or part of a name." },
          died_year: { type: "string", description: "Year of death, such as 1948." },
          born_year: { type: "string", description: "Year of birth, such as 1901." },
          died_age: {
            type: "number",
            description: "Age at death to compare, such as 80.",
          },
          died_age_op: {
            type: "string",
            enum: ["gt", "gte", "lt", "lte", "eq"],
            description: "How died_age compares. gt means older than that age.",
          },
        },
        additionalProperties: false,
      },
      async execute(input) {
        const cemetery = cemeteryRequired(deps);
        if ("ok" in cemetery) return cemetery;
        let query = typeof input.query === "string" ? input.query.trim() : "";
        const diedYear = yearInput(input.died_year);
        const bornYear = yearInput(input.born_year);
        const phrased = query ? lifeAge(query) : {};
        const diedAge = ageYearsInput(input.died_age) ?? phrased.died_age ?? null;
        const diedAgeOp = ageOpInput(input.died_age_op ?? phrased.died_age_op);
        if (phrased.died_age != null) query = "";
        if (!query && !diedYear && !bornYear && diedAge == null) {
          return { ok: false, error: "Provide a name query or a year." };
        }
        let people = await deps.searchPeople(query);
        if (diedYear) {
          people = people.filter((person) => yearMatches(person.date_of_death, diedYear));
        }
        if (bornYear) {
          people = people.filter((person) => yearMatches(person.date_of_birth, bornYear));
        }
        let undated = 0;
        let dated = 0;
        const listed =
          diedAge == null
            ? people.map(publicPerson)
            : people.flatMap((person) => {
                const age = ageAtDeath(person.date_of_birth, person.date_of_death);
                if (age == null) {
                  undated += 1;
                  return [];
                }
                dated += 1;
                if (!ageMatches(age, diedAge, diedAgeOp)) return [];
                return [{ ...publicPerson(person), age }];
              });
        return {
          ok: true,
          total: listed.length,
          people: listed.slice(0, PEOPLE_CAP),
          truncated: listed.length > PEOPLE_CAP,
          ...(diedYear ? { died_year: diedYear } : {}),
          ...(bornYear ? { born_year: bornYear } : {}),
          ...(diedAge != null
            ? { died_age: diedAge, died_age_op: diedAgeOp, undated, dated }
            : {}),
        };
      },
    },
    {
      name: "focus_cemetery",
      description:
        "Move the map to the device GPS position. The map must already be open.",
      readOnly: false,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      async execute() {
        const cemetery = cemeteryRequired(deps);
        if ("ok" in cemetery) return cemetery;
        return deps.focusCemetery();
      },
    },
    {
      name: "focus_plot",
      description: "Zoom the map to a plot and select it.",
      readOnly: false,
      inputSchema: {
        type: "object",
        properties: {
          plot_id: { type: "string", description: "Plot id." },
        },
        required: ["plot_id"],
        additionalProperties: false,
      },
      async execute(input) {
        const cemetery = cemeteryRequired(deps);
        if ("ok" in cemetery) return cemetery;
        const plot = await deps.getPlot(String(input.plot_id));
        if (!plot) return { ok: false, error: "Plot not found." };
        const wrong = plotInCemetery(plot, cemetery);
        if (wrong) return wrong;
        return deps.focusPlot(plot);
      },
    },
    {
      name: "update_plot",
      description:
        "Update a plot's notes, section, row, number, status, or monument fields. Geometry cannot be changed.",
      readOnly: false,
      inputSchema: {
        type: "object",
        properties: {
          plot_id: { type: "string", description: "Plot id." },
          notes: { type: "string" },
          section: { type: "string" },
          row: { type: "string" },
          number: { type: "string" },
          status: { type: "string" },
          monument_material: { type: "string" },
          monument_form: { type: "string" },
          monument_condition: { type: "string" },
          monument_detail: { type: "string" },
        },
        required: ["plot_id"],
        additionalProperties: false,
      },
      async execute(input) {
        const cemetery = cemeteryRequired(deps);
        if ("ok" in cemetery) return cemetery;
        const plot = await deps.getPlot(String(input.plot_id));
        if (!plot) return { ok: false, error: "Plot not found." };
        const wrong = plotInCemetery(plot, cemetery);
        if (wrong) return wrong;
        const patch: Record<string, string> = {};
        for (const field of PLOT_PATCH_FIELDS) {
          if (typeof input[field] === "string") patch[field] = input[field];
        }
        if (Object.keys(patch).length === 0) {
          return {
            ok: false,
            error: "Provide at least one field to update.",
          };
        }
        const updated = await deps.updatePlot(plot.id, patch);
        return { ok: true, plot: publicPlot(updated) };
      },
    },
    {
      name: "add_person",
      description:
        "Add a person to a plot in the open cemetery. Provide a plot id and at least one name field.",
      readOnly: false,
      inputSchema: {
        type: "object",
        properties: {
          plot_id: { type: "string", description: "Plot id." },
          title: { type: "string" },
          forename: { type: "string" },
          middle_name: { type: "string" },
          surname: { type: "string" },
          date_of_birth: { type: "string", description: "ISO date if known." },
          date_of_death: { type: "string", description: "ISO date if known." },
        },
        required: ["plot_id"],
        additionalProperties: false,
      },
      async execute(input) {
        const cemetery = cemeteryRequired(deps);
        if ("ok" in cemetery) return cemetery;
        const plot = await deps.getPlot(String(input.plot_id));
        if (!plot) return { ok: false, error: "Plot not found." };
        const wrong = plotInCemetery(plot, cemetery);
        if (wrong) return wrong;
        const nameFields = ["title", "forename", "middle_name", "surname"] as const;
        const hasName = nameFields.some(
          (field) => typeof input[field] === "string" && input[field].trim(),
        );
        if (!hasName) {
          return { ok: false, error: "Provide at least one name field." };
        }
        const person = await deps.addPerson(input);
        return { ok: true, person: publicPerson(person) };
      },
    },
    {
      name: "create_plot_at_gps",
      description:
        "Create a single or double grave rectangle at the device GPS position in the open cemetery, then show it on the map. Fails when GPS is unavailable.",
      readOnly: false,
      inputSchema: {
        type: "object",
        properties: {
          size: {
            type: "string",
            enum: ["single", "double"],
            description: "Grave size. Defaults to single.",
          },
          section: { type: "string" },
          row: { type: "string" },
          number: { type: "string" },
        },
        additionalProperties: false,
      },
      async execute(input) {
        const cemetery = cemeteryRequired(deps);
        if ("ok" in cemetery) return cemetery;
        const gps = await deps.getGps();
        if (!gps) {
          return {
            ok: false,
            error:
              "GPS is unavailable, so no plot was created. Ask the user to draw the outline.",
          };
        }
        const size: GraveSize = input.size === "double" ? "double" : "single";
        const footprint = graveFootprint(gps.latitude, gps.longitude, size);
        const number =
          typeof input.number === "string" && input.number.trim()
            ? input.number.trim()
            : await deps.nextPlotNumber();
        const created = await deps.createPlot({
          geometry: JSON.stringify(footprint),
          section: typeof input.section === "string" ? input.section : "",
          row: typeof input.row === "string" ? input.row : "",
          number,
          status: "Active",
          location_id: cemetery.id,
          notes: "",
        });
        let focused = false;
        if (created.geometry) {
          const focus = await deps.focusPlot({
            id: created.id,
            location_id: cemetery.id,
            geometry: created.geometry,
            number: created.number,
            section: created.section,
            row: created.row,
          });
          focused = focus.ok === true;
        }
        return {
          ok: true,
          plot: {
            id: created.id,
            number: created.number ?? number,
            section: created.section ?? "",
            row: created.row ?? "",
            size,
          },
          focused,
        };
      },
    },
    {
      name: "begin_plot_drawing",
      description:
        "Turn on map drawing so the user can outline a plot by hand. The map must already be open.",
      readOnly: false,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      async execute() {
        const cemetery = cemeteryRequired(deps);
        if ("ok" in cemetery) return cemetery;
        return deps.beginDrawing();
      },
    },
    {
      name: "read_headstone",
      description:
        "Read the inscription on a plot. Uses the latest plot photo, or opens the camera when there is no photo. Saves the transcription and people onto the plot.",
      readOnly: false,
      inputSchema: {
        type: "object",
        properties: {
          plot_id: { type: "string", description: "Plot id." },
        },
        required: ["plot_id"],
        additionalProperties: false,
      },
      async execute(input) {
        const cemetery = cemeteryRequired(deps);
        if ("ok" in cemetery) return cemetery;
        const plot = await deps.getPlot(String(input.plot_id));
        if (!plot) return { ok: false, error: "Plot not found." };
        const wrong = plotInCemetery(plot, cemetery);
        if (wrong) return wrong;
        try {
          const reading = await deps.readHeadstone(plot);
          return {
            ok: true,
            transcription: reading.transcription ?? "",
            people: reading.persons.map(publicPerson),
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Reading failed.";
          return { ok: false, error: message };
        }
      },
    },
  ];
}
