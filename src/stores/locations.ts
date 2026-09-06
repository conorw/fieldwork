import { ref, computed } from "vue";
import { defineStore } from "pinia";
import { usePowerSyncStore } from "./powersync";
import { useAuthStore } from "./auth";
import type { LocationRecord } from "../powersync-schema";
import { pmtilesService, type PMTilesLocation } from "../utils/pmtilesService";
import { useStorage } from "@vueuse/core";

export interface LocationData {
  id: string;
  name: string;
  bbox: [number, number, number, number];
  minZoom: number;
  maxZoom: number;
  pmtilesUrl?: string;
  dateCreated: string;
  createdBy: string;
  isPublic: boolean;
  ownerId?: string;
  userRole?: "owner" | "admin" | "member";
  aiStatus?: "teacher" | "training" | "local" | "error";
  adapterUrl?: string;
  adapterVersion?: string;
  aiTrainError?: string;
  aiTrainJobId?: string;
}

export const useLocationsStore = defineStore("locations", () => {
  const powerSyncStore = usePowerSyncStore();
  const authStore = useAuthStore();

  // State
  const locations = ref<LocationData[]>([]);
  const selectedLocation = ref<LocationData | null>(null);
  const selectedLocationId = useStorage("selectedLocationId", "");
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // Computed
  const publicLocations = computed(() =>
    locations.value.filter((loc) => loc.isPublic),
  );

  const userLocations = computed(() =>
    locations.value.filter((loc) => loc.userRole !== undefined),
  );

  // Actions
  let loadPromise: Promise<void> | null = null;

  const loadLocations = async () => {
    // If already loading, wait for the existing load to complete
    if (isLoading.value && loadPromise) {
      await loadPromise;
      return;
    }

    // Always reload to ensure we have the latest data, especially after creating a new location
    // if (locations.value.length > 0) {
    //   return;
    // }

    // Wait for PowerSync to be ready
    if (!powerSyncStore.powerSync) {
      const isConnecting =
        powerSyncStore.isConnecting ||
        (powerSyncStore as any).isInitialized === false;

      if (isConnecting || !powerSyncStore.isInitialized) {
        // Wait up to 10 seconds for PowerSync to initialize
        let waitCount = 0;
        while (
          (isConnecting || !powerSyncStore.isInitialized) &&
          !powerSyncStore.powerSync &&
          waitCount < 100
        ) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          waitCount++;
          if (powerSyncStore.powerSync) break;
        }
      }
    }

    if (!powerSyncStore.powerSync) {
      console.error("LocationsStore: PowerSync client not initialized");
      error.value = "PowerSync client not initialized";
      return;
    }

    isLoading.value = true;
    error.value = null;

    // Store the promise so other callers can wait for it
    loadPromise = (async () => {
      try {
        let results: any[] = [];

        // Get user's location memberships and owned locations
        if (authStore.user && powerSyncStore.powerSync) {
          // Get locations where user is owner OR member
          // Use a simpler query that handles both cases
          results = await powerSyncStore.powerSync.getAll(
            `SELECT l.*, COALESCE(lm.role, CASE WHEN l.owner_id = ? THEN 'owner' END) as user_role 
           FROM locations l 
           LEFT JOIN location_members lm ON l.id = lm.location_id AND lm.user_id = ?
           WHERE l.owner_id = ? OR lm.user_id = ?`,
            [
              authStore.user.id,
              authStore.user.id,
              authStore.user.id,
              authStore.user.id,
            ],
          );
        } else if (powerSyncStore.powerSync) {
          // Fallback: load all locations if not authenticated (shouldn't happen with auth guards)
          results = await powerSyncStore.powerSync.getAll(
            "SELECT * FROM locations",
          );
        }

        if (authStore.user) {
          locations.value = results
            .map((loc: any) => {
              try {
                return {
                  ...loc,
                  bbox:
                    typeof loc.bbox === "string"
                      ? JSON.parse(loc.bbox)
                      : loc.bbox,
                  minZoom: parseInt(loc.min_zoom || loc.minZoom || "8"),
                  maxZoom: parseInt(loc.max_zoom || loc.maxZoom || "18"),
                  pmtilesUrl:
                    loc.pmtiles_url && loc.pmtiles_url.trim() !== ""
                      ? loc.pmtiles_url
                      : undefined,
                  isPublic: loc.is_public === "true" || loc.is_public === true,
                  ownerId: loc.owner_id,
                  userRole:
                    loc.user_role ||
                    (loc.owner_id === authStore.user?.id ? "owner" : undefined),
                  dateCreated: loc.date_created || loc.dateCreated,
                  createdBy: loc.created_by || loc.createdBy,
                  aiStatus: (loc.ai_status || "teacher") as LocationData["aiStatus"],
                  adapterUrl: loc.adapter_url || undefined,
                  adapterVersion: loc.adapter_version || undefined,
                  aiTrainError: loc.ai_train_error || undefined,
                  aiTrainJobId: loc.ai_train_job_id || undefined,
                };
              } catch (e) {
                console.error("Error parsing location:", loc, e);
                return null;
              }
            })
            .filter((loc): loc is LocationData => loc !== null);
        } else {
          locations.value = results.map((loc: any) => ({
            ...loc,
            bbox: JSON.parse(loc.bbox),
            minZoom: parseInt(loc.min_zoom || loc.minZoom),
            maxZoom: parseInt(loc.max_zoom || loc.maxZoom),
            pmtilesUrl:
              loc.pmtiles_url && loc.pmtiles_url.trim() !== ""
                ? loc.pmtiles_url
                : undefined,
            isPublic: loc.is_public === "true" || loc.is_public === true,
            ownerId: loc.owner_id,
            dateCreated: loc.date_created || loc.dateCreated,
            createdBy: loc.created_by || loc.createdBy,
            aiStatus: (loc.ai_status || "teacher") as LocationData["aiStatus"],
            adapterUrl: loc.adapter_url || undefined,
            adapterVersion: loc.adapter_version || undefined,
            aiTrainError: loc.ai_train_error || undefined,
            aiTrainJobId: loc.ai_train_job_id || undefined,
          }));
        }
        // Ensure selectedLocationId is set before selecting location
        // This ensures queries (like usePlots) have a valid location ID immediately
        if (selectedLocationId.value) {
          const location = getLocationById(selectedLocationId.value);
          if (location) {
            selectLocation(selectedLocationId.value);
          } else {
            // Stored location ID is invalid (deleted or no access), clear it
            console.warn(
              `Stored location ID ${selectedLocationId.value} not found, clearing selection`,
            );
            selectedLocationId.value = "";
            selectedLocation.value = null;
            // Auto-select first location if available
            if (locations.value.length > 0) {
              selectLocation(locations.value[0].id);
            }
          }
        } else if (locations.value.length > 0) {
          // Auto-select first location if none selected
          selectLocation(locations.value[0].id);
        }
      } catch (err) {
        error.value = `Failed to load locations: ${err}`;
        console.error("Error loading locations:", err);
      } finally {
        isLoading.value = false;
        loadPromise = null;
      }
    })();

    await loadPromise;
  };

  const selectLocation = (id: string) => {
    selectedLocationId.value = id;
    const location = getLocationById(id);
    selectedLocation.value = location || null;
    console.log("📍 [LocationsStore] selectLocation called:", {
      id,
      found: !!location,
      locationName: location?.name,
      pmtilesUrl: location?.pmtilesUrl,
      hasPmtilesUrl: !!location?.pmtilesUrl,
      pmtilesUrlType: typeof location?.pmtilesUrl,
      locationObject: location
        ? {
            id: location.id,
            name: location.name,
            pmtilesUrl: location.pmtilesUrl,
            bbox: location.bbox,
            minZoom: location.minZoom,
            maxZoom: location.maxZoom,
          }
        : null,
    });
  };

  const updateLocation = async (id: string, updates: Partial<LocationData>) => {
    if (!powerSyncStore.powerSync) {
      throw new Error("PowerSync client not initialized");
    }

    // Reload locations if the location isn't found (might have just been created)
    let location = getLocationById(id);
    if (!location) {
      console.warn(`Location ${id} not found, reloading locations...`);
      await loadLocations();
      location = getLocationById(id);
    }

    if (!location) {
      throw new Error(`Location ${id} not found`);
    }

    const getBboxString = (
      bbox: [number, number, number, number] | undefined,
      fallback: string,
    ) => {
      return bbox ? JSON.stringify(bbox) : fallback;
    };

    const updatedLocation: LocationRecord = {
      id: location.id,
      name: updates.name || location.name,
      bbox: getBboxString(updates.bbox, JSON.stringify(location.bbox)),
      min_zoom: updates.minZoom
        ? updates.minZoom.toString()
        : location.minZoom.toString(),
      max_zoom: updates.maxZoom
        ? updates.maxZoom.toString()
        : location.maxZoom.toString(),
      pmtiles_url: updates.pmtilesUrl || location.pmtilesUrl || null,
      date_created: location.dateCreated,
      date_modified: new Date().toISOString(), // Add date_modified field
      created_by: location.createdBy,
      owner_id: location.ownerId || null, // Include owner_id
      is_public:
        updates.isPublic !== undefined
          ? updates.isPublic.toString()
          : location.isPublic.toString(),
      ai_status: updates.aiStatus || location.aiStatus || "teacher",
      adapter_url:
        updates.adapterUrl !== undefined
          ? updates.adapterUrl || null
          : location.adapterUrl || null,
      adapter_version:
        updates.adapterVersion !== undefined
          ? updates.adapterVersion || null
          : location.adapterVersion || null,
      ai_train_error:
        updates.aiTrainError !== undefined
          ? updates.aiTrainError || null
          : location.aiTrainError || null,
      ai_train_job_id:
        updates.aiTrainJobId !== undefined
          ? updates.aiTrainJobId || null
          : location.aiTrainJobId || null,
    };

    await powerSyncStore.powerSync?.execute(
      `UPDATE locations SET
        name = ?, bbox = ?, min_zoom = ?, max_zoom = ?, pmtiles_url = ?,
        date_modified = ?, is_public = ?,
        ai_status = ?, adapter_url = ?, adapter_version = ?,
        ai_train_error = ?, ai_train_job_id = ?
       WHERE id = ?`,
      [
        updatedLocation.name,
        updatedLocation.bbox,
        updatedLocation.min_zoom,
        updatedLocation.max_zoom,
        updatedLocation.pmtiles_url,
        updatedLocation.date_modified,
        updatedLocation.is_public,
        updatedLocation.ai_status,
        updatedLocation.adapter_url,
        updatedLocation.adapter_version,
        updatedLocation.ai_train_error,
        updatedLocation.ai_train_job_id,
        id,
      ],
    );

    // Update local state
    const index = locations.value.findIndex((loc) => loc.id === id);
    if (index !== -1) {
      locations.value[index] = {
        ...locations.value[index],
        ...updates,
      };
    }
  };

  const deleteLocation = async (id: string) => {
    if (!powerSyncStore.powerSync) {
      throw new Error("PowerSync client not initialized");
    }

    console.log(`🗑️ Deleting location ${id} and all associated data...`);

    try {
      // Start a transaction to ensure all deletions succeed or none do
      await powerSyncStore.powerSync.writeTransaction(async (tx) => {
        // 1. Get all plots for this location
        const plots = await tx.getAll(
          "SELECT id FROM plots WHERE location_id = ?",
          [id],
        );
        console.log(
          `🗑️ Found ${plots.length} plots to delete for location ${id}`,
        );

        // 2. For each plot, delete associated data
        for (const plot of plots) {
          const plotId = (plot as any).id;
          console.log(`🗑️ Deleting data for plot ${plotId}...`);

          // Delete plot images
          await tx.execute("DELETE FROM plot_images WHERE plot_id = ?", [
            plotId,
          ]);
          console.log(`🗑️ Deleted plot images for plot ${plotId}`);

          // Get all persons for this plot
          const persons = await tx.getAll(
            "SELECT id FROM persons WHERE plot_id = ?",
            [plotId],
          );
          console.log(
            `🗑️ Found ${persons.length} persons to delete for plot ${plotId}`,
          );

          // Delete person images for each person
          for (const person of persons) {
            const personId = (person as any).id;
            await tx.execute("DELETE FROM person_images WHERE person_id = ?", [
              personId,
            ]);
            console.log(`🗑️ Deleted person images for person ${personId}`);
          }

          // Delete all persons for this plot
          await tx.execute("DELETE FROM persons WHERE plot_id = ?", [plotId]);
          console.log(`🗑️ Deleted persons for plot ${plotId}`);
        }

        // 3. Delete all plots for this location
        await tx.execute("DELETE FROM plots WHERE location_id = ?", [id]);
        console.log(`🗑️ Deleted plots for location ${id}`);

        // 4. Finally, delete the location itself
        await tx.execute("DELETE FROM locations WHERE id = ?", [id]);
        console.log(`🗑️ Deleted location ${id}`);
      });

      // Remove from local state
      const index = locations.value.findIndex((loc) => loc.id === id);
      if (index !== -1) {
        locations.value.splice(index, 1);
      }

      // If this was the selected location, clear the selection
      if (selectedLocationId.value === id) {
        selectedLocationId.value = "";
        selectedLocation.value = null;
      }

      console.log(
        `✅ Successfully deleted location ${id} and all associated data`,
      );
    } catch (error) {
      console.error(`❌ Error deleting location ${id}:`, error);
      throw new Error(
        `Failed to delete location: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  const getLocationById = (id: string): LocationData | undefined => {
    return locations.value.find((loc) => loc.id === id);
  };

  const getPMTilesForLocation = async (
    locationId: string,
  ): Promise<{
    data: ArrayBuffer;
    source: "powersync" | "generated" | "local";
  }> => {
    const location = getLocationById(locationId);
    if (!location) {
      throw new Error(`Location ${locationId} not found`);
    }

    const pmtilesLocation: PMTilesLocation = {
      id: location.id,
      name: location.name,
      bbox: location.bbox,
      minZoom: location.minZoom,
      maxZoom: location.maxZoom,
      pmtilesUrl: location.pmtilesUrl,
    };

    return await pmtilesService.getPMTiles(pmtilesLocation);
  };

  const preloadLocationPMTiles = async (locationId: string): Promise<void> => {
    const location = getLocationById(locationId);
    if (!location) return;

    const pmtilesLocation: PMTilesLocation = {
      id: location.id,
      name: location.name,
      bbox: location.bbox,
      minZoom: location.minZoom,
      maxZoom: location.maxZoom,
      pmtilesUrl: location.pmtilesUrl,
    };

    await pmtilesService.preloadPMTiles(pmtilesLocation);
  };

  return {
    // State
    locations,
    selectedLocation,
    selectedLocationId,
    isLoading,
    error,

    // Computed
    publicLocations,
    userLocations,

    // Actions
    loadLocations,
    selectLocation,
    updateLocation,
    deleteLocation,
    getLocationById,
    getPMTilesForLocation,
    preloadLocationPMTiles,
  };
});
