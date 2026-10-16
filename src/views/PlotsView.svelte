<script lang="ts">
import Button from "$lib/ui/Button.svelte";
import Card from "$lib/ui/Card.svelte";
import Image from "$lib/ui/Image.svelte";
import InputText from "$lib/ui/InputText.svelte";
import Message from "$lib/ui/Message.svelte";
import Select from "$lib/ui/Select.svelte";
import Skeleton from "$lib/ui/Skeleton.svelte";
import Tag from "$lib/ui/Tag.svelte";

import { ref, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import { useRouter } from "vue-router";
import { usePowerSyncStore } from "../stores/powersync";
import { useLocationsStore } from "../stores/locations";
import type { PlotRecord } from "@/powersync-schema";
import { rewritePublicStorageUrl } from "../utils/storageUrl";

const router = useRouter();

// Local state
const searchQuery = ref("");
const sectionFilter = ref("");
const statusFilter = ref("");
const pageSize = ref(20);
const displayedPlotsCount = ref(20);
const plotImages = ref(new Map()); // plotId -> imageUrl
const hasLoadedOnce = ref(false); // Track if initial load has occurred

// Locations store
const locationsStore = useLocationsStore();

// PowerSync store for direct queries
const powerSyncStore = usePowerSyncStore();

// Reactive data for plots
const plots = ref<any[]>([]);
const loading = ref(false);
const error = ref<any>(null);

// Computed properties for sections (from all plots, not just filtered)
const sections = computed(() => {
  if (!plots.value || plots.value.length === 0) return [];
  const uniqueSections = [...new Set(plots.value.map((p) => p.section))];
  return uniqueSections.sort();
});

// Computed properties for select options
const sectionOptions = computed(() => {
  const options = sections.value.map((section) => ({
    label: section,
    value: section,
  }));
  return [{ label: "All Sections", value: "" }, ...options];
});

const statusOptions = computed(() => [
  { label: "All Statuses", value: "" },
  { label: "Active", value: "Active" },
  { label: "Reserved", value: "Reserved" },
  { label: "Occupied", value: "Occupied" },
  { label: "Unavailable", value: "Unavailable" },
]);

// Function to build search query
const buildSearchQuery = () => {
  let query =
    "SELECT id, section, row,notes,number, location_id, status FROM plots WHERE 1=1";
  const params = [];

  // Add search filter
  if (searchQuery.value) {
    query +=
      " AND (LOWER(section) LIKE ? OR LOWER(row) LIKE ? OR LOWER(number) LIKE ? OR LOWER(notes) LIKE ?)";
    const searchTerm = `%${searchQuery.value.toLowerCase()}%`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }

  // Add section filter
  if (sectionFilter.value) {
    query += " AND section = ?";
    params.push(sectionFilter.value);
  }

  // Add status filter
  if (statusFilter.value) {
    query += " AND status = ?";
    params.push(statusFilter.value);
  }

  // Add location filter (always use current location)
  if (locationsStore.selectedLocation?.id) {
    query += " AND location_id = ?";
    params.push(locationsStore.selectedLocation.id);
  }

  query += " ORDER BY date_created DESC";

  return { query, params };
};

// Function to load plots with current filters
const loadPlots = async () => {
  if (!powerSyncStore.powerSync) {
    return;
  }

  loading.value = true;
  error.value = null;

  try {
    const { query, params } = buildSearchQuery();
    const allPlots = (await powerSyncStore.powerSync.getAll(
      query,
      params,
    )) as PlotRecord[];

    // Track total count for hasMorePlots
    totalPlotsCount.value = allPlots.length;

    plots.value = allPlots.slice(0, displayedPlotsCount.value);
  } catch (err) {
    console.error("Error loading plots:", err);
    error.value = err;
  } finally {
    loading.value = false;
  }
};

// Computed property for filtered plots (now just returns the loaded plots)
const filteredPlots = computed(() => plots.value);

// Track total count for hasMorePlots
const totalPlotsCount = ref(0);

const hasMorePlots = computed(() => {
  return displayedPlotsCount.value < totalPlotsCount.value;
});

const remainingPlotsCount = computed(() =>
  Math.min(pageSize.value, totalPlotsCount.value - displayedPlotsCount.value),
);

const hasActiveFilters = computed(
  () => !!(searchQuery.value || sectionFilter.value || statusFilter.value),
);

// With filters on, an empty result means "no match" rather than "no plots".
const hasAnyPlots = computed(
  () => totalPlotsCount.value > 0 || hasActiveFilters.value,
);

const resultSummary = computed(() => {
  if (loading.value && !hasLoadedOnce.value) return "Loading plots…";
  const total = totalPlotsCount.value;
  const noun = total === 1 ? "plot" : "plots";
  if (total === 0) return hasActiveFilters.value ? "No matching plots" : "No plots yet";
  if (plots.value.length < total) {
    return `Showing ${plots.value.length} of ${total} ${noun}`;
  }
  return `${total} ${noun}`;
});

const clearFilters = () => {
  searchQuery.value = "";
  sectionFilter.value = "";
  statusFilter.value = "";
};

const plotLabel = (plot: any) => {
  const parts = [plot.section, plot.row, plot.number].filter(
    (part) => part !== null && part !== undefined && `${part}`.trim() !== "",
  );
  return parts.length > 0 ? parts.join("-") : "Unnamed plot";
};

// Methods
const viewPlot = (plot: any) => {
  router.push(`/plots/${plot.id}`);
};

const loadMore = async () => {
  displayedPlotsCount.value += pageSize.value;
  await loadPlots();
};

// Debounce timer for search
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

// Watchers to trigger search when filters change (debounced for search query)
watch(
  [searchQuery, sectionFilter, statusFilter],
  async () => {
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }

    searchDebounceTimer = setTimeout(
      async () => {
        displayedPlotsCount.value = pageSize.value;
        await loadPlots();
      },
      searchQuery.value ? 300 : 0,
    ); // 300ms debounce for search, instant for filters
  },
  { immediate: false },
);

// Watch for location changes
watch(
  () => locationsStore.selectedLocation,
  async () => {
    displayedPlotsCount.value = pageSize.value;
    await loadPlots();
  },
  { immediate: false },
);

// Load plots when PowerSync is ready
watch(
  () => powerSyncStore.isInitialized,
  async (initialized, wasInitialized) => {
    console.log(
      `📋 [PlotsView] PowerSync watcher: initialized=${initialized}, wasInitialized=${wasInitialized}, hasLoadedOnce=${hasLoadedOnce.value}`,
    );
    // Only trigger if PowerSync became initialized (not if it was already initialized)
    if (
      initialized &&
      !wasInitialized &&
      !hasLoadedOnce.value &&
      powerSyncStore.powerSync
    ) {
      const watcherStart = performance.now();
      hasLoadedOnce.value = true;
      await loadPlots();
      console.log(
        `📋 [PlotsView] PowerSync watcher completed in ${(performance.now() - watcherStart).toFixed(2)}ms`,
      );
    }
  },
  { immediate: true },
);

// Load images for displayed plots using a single optimized query (defer to next tick)
watch(filteredPlots, async (newPlots, oldPlots) => {
  const imageWatcherStart = performance.now();
  console.log(
    `📋 [PlotsView] Image watcher triggered: ${newPlots?.length || 0} plots`,
  );

  // Only load when plots actually change
  if (newPlots && newPlots.length > 0 && newPlots !== oldPlots) {
    // Only load images that aren't already loaded
    const filterStart = performance.now();
    const imagesToLoad = newPlots.filter(
      (plot) => !plotImages.value.has(plot.id),
    );
    console.log(
      `📋 [PlotsView] Filter check took ${(performance.now() - filterStart).toFixed(2)}ms, ${imagesToLoad.length} images to load`,
    );

    if (imagesToLoad.length > 0) {
      // Defer image loading to next tick so cards render first
      await nextTick();
      await loadPlotImagesBatch(imagesToLoad.map((plot) => plot.id));
      console.log(
        `📋 [PlotsView] Image watcher completed in ${(performance.now() - imageWatcherStart).toFixed(2)}ms`,
      );
    }
  }
});

// Load images in a single batch query instead of individual queries
const loadPlotImagesBatch = async (plotIds: string[]) => {
  const batchStart = performance.now();
  console.log(`📋 [PlotsView] loadPlotImagesBatch: ${plotIds.length} plot IDs`);

  if (!powerSyncStore.powerSync || plotIds.length === 0) {
    return;
  }

  try {
    // Use a single query with IN clause to get all images at once
    // Include images with thumbnail_data OR cloud_url (prioritize thumbnails)
    const placeholders = plotIds.map(() => "?").join(",");
    const query = `SELECT plot_id, thumbnail_data, cloud_url, data 
                   FROM plot_images 
                   WHERE plot_id IN (${placeholders}) 
                   AND (thumbnail_data IS NOT NULL OR cloud_url IS NOT NULL)
                   ORDER BY date_created DESC`;

    const queryStart = performance.now();
    const allImages = (await powerSyncStore.powerSync.getAll(
      query,
      plotIds,
    )) as any[];
    console.log(
      `📋 [PlotsView] Image query took ${(performance.now() - queryStart).toFixed(2)}ms, got ${allImages.length} images`,
    );

    // Group by plot_id and take the first image for each plot
    const groupStart = performance.now();
    const imageMap = new Map<string, any>();
    for (const image of allImages) {
      if (!imageMap.has(image.plot_id)) {
        imageMap.set(image.plot_id, image);
      }
    }
    console.log(
      `📋 [PlotsView] Grouping images took ${(performance.now() - groupStart).toFixed(2)}ms, ${imageMap.size} unique plot images`,
    );

    // Set the images in the cache
    const cacheStart = performance.now();
    for (const [plotId, image] of imageMap.entries()) {
      if (image.thumbnail_data) {
        plotImages.value.set(
          plotId,
          `data:image/jpeg;base64,${image.thumbnail_data}`,
        );
      } else if (image.cloud_url) {
        plotImages.value.set(plotId, rewritePublicStorageUrl(image.cloud_url));
      } else if (image.data) {
        plotImages.value.set(plotId, `data:image/jpeg;base64,${image.data}`);
      }
    }
    console.log(
      `📋 [PlotsView] Caching images took ${(performance.now() - cacheStart).toFixed(2)}ms`,
    );

    console.log(
      `📋 [PlotsView] loadPlotImagesBatch completed in ${(performance.now() - batchStart).toFixed(2)}ms`,
    );
  } catch (error) {
    console.error("Error loading plot images batch:", error);
  }
};

const getStatusSeverity = (status: string) => {
  const severities = {
    Active: "success",
    Reserved: "warning",
    Occupied: "secondary",
    Unavailable: "danger",
  };
  return severities[status as keyof typeof severities] || "secondary";
};

// Define event handlers outside async block so they're accessible to onUnmounted
const handlePlotCreated = (event: any) => {
  console.log("Plot created event received in PlotsView:", event.detail);
  // Reload plots to update the list
  loadPlots();
};

const handlePlotUpdated = (event: any) => {
  console.log("Plot updated event received in PlotsView:", event.detail);
  // Reload plots to update the list
  loadPlots();
};

const handlePlotEditingFinished = (event: any) => {
  console.log(
    "Plot editing finished event received in PlotsView:",
    event.detail,
  );
  // Reload plots to update the list
  loadPlots();
};

onMounted(async () => {
  const mountStart = performance.now();
  console.log("📋 [PlotsView] onMounted started");

  // Load locations only if not already loaded
  if (locationsStore.locations.length === 0) {
    const loadLocStart = performance.now();
    await locationsStore.loadLocations();
    console.log(
      `📋 [PlotsView] Locations loaded in ${(performance.now() - loadLocStart).toFixed(2)}ms`,
    );
  }

  // Load plots if PowerSync is already initialized (e.g., navigating from another screen)
  if (
    powerSyncStore.isInitialized &&
    !hasLoadedOnce.value &&
    powerSyncStore.powerSync
  ) {
    console.log(
      "📋 [PlotsView] PowerSync already initialized, loading plots in onMounted",
    );
    hasLoadedOnce.value = true;
    await loadPlots();
  }

  window.addEventListener("plot-created", handlePlotCreated);
  window.addEventListener("plot-updated", handlePlotUpdated);
  window.addEventListener("plot-editing-finished", handlePlotEditingFinished);

  console.log(
    `📋 [PlotsView] onMounted completed in ${(performance.now() - mountStart).toFixed(2)}ms`,
  );
});

// Clean up event listener on unmount
onUnmounted(() => {
  window.removeEventListener("plot-created", handlePlotCreated);
  window.removeEventListener("plot-updated", handlePlotUpdated);
  window.removeEventListener(
    "plot-editing-finished",
    handlePlotEditingFinished,
  );
});
</script>

<div class="h-full overflow-y-auto p-4 space-y-4 sm:p-6 sm:space-y-6"><div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h1 class="text-2xl font-bold text-surface-900">Cemetery Plots</h1><p class="text-sm text-surface-600">{resultSummary.value}</p></div><Button class="w-full sm:w-auto" label="Add plot on map" icon="pi pi-map-marker" onclick={(event) => {  router.push('/') }}></Button></div><Card>{#snippet content()}<div class="grid grid-cols-1 md:grid-cols-5 gap-4"><div class="md:col-span-2"><label class="block text-sm font-medium text-surface-700 mb-1" for="plot-search">Search</label><InputText class="w-full" id="plot-search" bind:value={searchQuery.value} placeholder="Section, row, number, or notes"></InputText></div><div><label class="block text-sm font-medium text-surface-700 mb-1">Section</label><Select class="w-full" bind:value={sectionFilter.value} options={sectionOptions.value} option-label="label" option-value="value" placeholder="All Sections"></Select></div><div><label class="block text-sm font-medium text-surface-700 mb-1">Status</label><Select class="w-full" bind:value={statusFilter.value} options={statusOptions.value} option-label="label" option-value="value" placeholder="All Statuses"></Select></div>{#if hasActiveFilters.value}<div class="flex items-end"><Button class="w-full" label="Clear" icon="pi pi-filter-slash" severity="secondary" text onclick={clearFilters}></Button></div>{/if}</div>{/snippet}</Card>{#if error.value}<Message severity="error" closable={false}><div><h3 class="font-medium">Could not load plots</h3><p class="text-sm mt-1">{error.value.message}</p></div></Message>{/if}<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" aria-busy="true">{#each 6 as n (n)}<Card>{#snippet content()}<Skeleton class="mb-2" width="60%" height="1.25rem"></Skeleton><Skeleton class="mb-3" width="35%" height="0.75rem"></Skeleton><Skeleton width="100%" height="8rem"></Skeleton>{/snippet}</Card>{/each}</div><div class="text-center py-12"><i class="pi pi-map-marker text-4xl text-surface-400"></i><h3 class="mt-3 font-medium text-surface-900">{hasAnyPlots.value ? "No matching plots" : "No plots recorded yet"}</h3><p class="mt-1 text-sm text-surface-500">{hasAnyPlots.value
            ? "Try a different search term or clear the filters."
            : "Open the map and photograph a headstone to record your first plot."}</p><div class="mt-6">{#if hasAnyPlots.value}<Button label="Clear filters" icon="pi pi-filter-slash" severity="secondary" onclick={clearFilters}></Button>{:else}<Button label="Add plot on map" icon="pi pi-map-marker" onclick={(event) => {  router.push('/') }}></Button>{/if}</div></div>{#if filteredPlots.value.length > 0}<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{#each filteredPlots.value as plot (plot.id)}<Card class="hover:shadow-md transition-shadow duration-200 cursor-pointer" role="button" tabindex="0" aria-label={`Open plot ${plotLabel(plot)}`} onclick={(event) => {  viewPlot(plot) }} onKeydown={(event) => { ((event) => { if (event.key !== "Enter") return; viewPlot(plot) })(event); ((event) => { if (event.key !== " " && event.key !== "Spacebar") return; event.preventDefault(); viewPlot(plot) })(event); }}>{#snippet content()}<div class="flex items-start justify-between gap-2 mb-3"><h3 class="text-lg font-semibold text-surface-900">{plotLabel(plot)}</h3>{#if plot.status}<Tag value={plot.status} severity={getStatusSeverity(plot.status)}></Tag>{/if}</div><div class="mb-3">{#if plotImages.value.get(plot.id)}<Image class="w-full h-32 object-cover rounded-lg" src={plotImages.value.get(plot.id)} alt={`Plot ${plot.section}-${plot.row}-${plot.number} image`} loading="lazy" onError={(event) => {  plotImages.value.delete(plot.id) }}></Image>{:else}<div class="w-full h-32 bg-surface-100 rounded-lg flex items-center justify-center"><svg class="w-8 h-8 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>{/if}</div><div class="space-y-2 text-sm text-surface-600">{#if plot.notes}<div class="pt-2 border-t border-surface-200"><p class="text-surface-700 line-clamp-2">{plot.notes}</p></div>{/if}</div>{/snippet}</Card>{/each}</div>{/if}{#if hasMorePlots.value}<div class="text-center"><Button severity="secondary" loading={loading.value} label={`Show ${remainingPlotsCount} more`} onclick={loadMore}></Button></div>{/if}</div>
