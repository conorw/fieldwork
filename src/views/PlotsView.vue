<template>
  <div class="h-full overflow-y-auto p-6 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-surface-900">Cemetery Plots</h1>
        <p class="text-sm text-surface-600">
          Manage and search cemetery plot data
        </p>
      </div>

      <div class="flex items-center space-x-4">
        <div class="text-sm text-surface-600">
          {{ filteredPlots.length }} of {{ plots?.length || 0 }} plots
        </div>

        <Button @click="$router.push('/')" label="New Plot">
          <template #icon>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </template>
        </Button>
      </div>
    </div>

    <!-- Search and Filters -->
    <Card>
      <template #title>
        <span>Search and Filters</span>
      </template>

      <template #content>
        <div class="grid grid-cols-1 md:grid-cols-5 gap-4">
          <!-- Search -->
          <div class="md:col-span-2">
            <label class="block text-sm font-medium text-surface-700 mb-1">Search</label>
            <InputText v-model="searchQuery" placeholder="Search by section, row, number, or notes..." class="w-full" />
          </div>

          <!-- Section Filter -->
          <div>
            <label class="block text-sm font-medium text-surface-700 mb-1">Section</label>
            <Select v-model="sectionFilter" :options="sectionOptions" option-label="label" option-value="value"
              placeholder="All Sections" class="w-full" />
          </div>

          <!-- Status Filter -->
          <div>
            <label class="block text-sm font-medium text-surface-700 mb-1">Status</label>
            <Select v-model="statusFilter" :options="statusOptions" option-label="label" option-value="value"
              placeholder="All Statuses" class="w-full" />
          </div>
        </div>
      </template>
    </Card>

    <!-- Error State -->
    <div v-if="error" class="text-center py-8">
      <svg class="mx-auto h-12 w-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
      <h3 class="mt-2 text-sm font-medium text-surface-900">Error loading plots</h3>
      <p class="mt-1 text-sm text-surface-500">{{ error.message }}</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="!loading && filteredPlots.length === 0" class="text-center py-12">
      <h3 class="mt-2 text-sm font-medium text-surface-900">No plots found</h3>
      <p class="mt-1 text-sm text-surface-500">
        {{ (plots?.length || 0) === 0 ? 'Get started by creating your first plot.' : 'Try adjusting your search or filters.' }}
      </p>
      <div class="mt-6">
        <Button @click="$router.push('/')" label="Create Plot">
          <template #icon>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </template>
        </Button>
      </div>
    </div>

    <!-- Plots Grid -->
    <div v-if="filteredPlots.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <Card v-for="plot in filteredPlots" :key="plot.id"
        class="hover:shadow-md transition-shadow duration-200 cursor-pointer" @click="viewPlot(plot)">
        <template #content>
          <!-- Plot Header -->
          <div class="flex items-start justify-between mb-3">
            <div>
              <h3 class="text-lg font-semibold text-surface-900">
                {{ plot.section }}-{{ plot.row }}-{{ plot.number }}
              </h3>
              <p class="text-sm text-surface-600">{{ plot.type }}</p>
            </div>
            <div class="flex items-center space-x-2">
              <Chip :label="plot.status" :severity="getStatusSeverity(plot.status)" size="small" />
              <div v-if="getPlotSyncStatus(plot.id) === 'pending'" class="w-2 h-2 bg-yellow-400 rounded-full"
                title="Pending sync"></div>
            </div>
          </div>

          <!-- Plot Image -->
          <div class="mb-3">
            <Image v-if="plotImages.get(plot.id)" :src="plotImages.get(plot.id)" :alt="`Plot ${plot.section}-${plot.row}-${plot.number} image`"
              class="w-full h-32 object-cover rounded-lg" loading="lazy" @error="plotImages.delete(plot.id)" />
            <div v-else class="w-full h-32 bg-surface-100 rounded-lg flex items-center justify-center">
              <svg class="w-8 h-8 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>

          <!-- Plot Details -->
          <div class="space-y-2 text-sm text-surface-600">
            <div v-if="plot.notes" class="pt-2 border-t border-surface-200">
              <p class="text-surface-700 line-clamp-2">{{ plot.notes }}</p>
            </div>
          </div>
        </template>

        <template #footer>
          <!-- Action Buttons -->
          <div class="w-full">
            <Button @click.stop="viewPlot(plot)" label="View Details" class="w-full" size="small" />
          </div>
        </template>
      </Card>
    </div>

    <!-- Load More -->
    <div v-if="hasMorePlots" class="text-center">
      <Button @click="loadMore" severity="secondary" label="Load More Plots" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { usePowerSyncStore } from '../stores/powersync'
import { useLocationsStore } from '../stores/locations'
import { PlotRecord } from '@/powersync-schema'

const router = useRouter()

// Local state
const searchQuery = ref('')
const sectionFilter = ref('')
const statusFilter = ref('')
const pageSize = ref(20)
const displayedPlotsCount = ref(20)
const plotImages = ref(new Map()) // plotId -> imageUrl
const hasLoadedOnce = ref(false) // Track if initial load has occurred

// Locations store
const locationsStore = useLocationsStore()

// PowerSync store for direct queries
const powerSyncStore = usePowerSyncStore()

// Reactive data for plots
const plots = ref<any[]>([])
const loading = ref(false)
const error = ref<any>(null)

// Computed properties for sections (from all plots, not just filtered)
const sections = computed(() => {
  if (!plots.value || plots.value.length === 0) return []
  const uniqueSections = [...new Set(plots.value.map(p => p.section))]
  return uniqueSections.sort()
})

// Computed properties for select options
const sectionOptions = computed(() => {
  const options = sections.value.map(section => ({
    label: section,
    value: section
  }))
  return [{ label: 'All Sections', value: '' }, ...options]
})

const statusOptions = computed(() => [
  { label: 'All Statuses', value: '' },
  { label: 'Active', value: 'Active' },
  { label: 'Reserved', value: 'Reserved' },
  { label: 'Occupied', value: 'Occupied' },
  { label: 'Unavailable', value: 'Unavailable' }
])

// Function to build search query
const buildSearchQuery = () => {
  let query = 'SELECT id, section, row,notes,number, location_id, status FROM plots WHERE 1=1'
  const params = []

  // Add search filter
  if (searchQuery.value) {
    query += ' AND (LOWER(section) LIKE ? OR LOWER(row) LIKE ? OR LOWER(number) LIKE ? OR LOWER(notes) LIKE ?)'
    const searchTerm = `%${searchQuery.value.toLowerCase()}%`
    params.push(searchTerm, searchTerm, searchTerm, searchTerm)
  }

  // Add section filter
  if (sectionFilter.value) {
    query += ' AND section = ?'
    params.push(sectionFilter.value)
  }

  // Add status filter
  if (statusFilter.value) {
    query += ' AND status = ?'
    params.push(statusFilter.value)
  }

  // Add location filter (always use current location)
  if (locationsStore.selectedLocation?.id) {
    query += ' AND location_id = ?'
    params.push(locationsStore.selectedLocation.id)
  }

  query += ' ORDER BY date_created DESC'

  return { query, params }
}

// Function to load plots with current filters
const loadPlots = async () => {
  const loadStart = performance.now()
  console.log('📋 [PlotsView] Starting loadPlots')
  
  if (!powerSyncStore.powerSync) {
    return
  }

  loading.value = true
  error.value = null

  try {
    const buildStart = performance.now()
    const { query, params } = buildSearchQuery()
    console.log(`📋 [PlotsView] Query built in ${(performance.now() - buildStart).toFixed(2)}ms`)
    
    const queryStart = performance.now()
    const allPlots = await powerSyncStore.powerSync.getAll(query, params) as PlotRecord[]
    const queryEnd = performance.now()
    console.log(`📋 [PlotsView] Query executed in ${(queryEnd - queryStart).toFixed(2)}ms, got ${allPlots.length} plots`)

    // Track total count for hasMorePlots
    totalPlotsCount.value = allPlots.length

    // Apply pagination
    const paginationStart = performance.now()
    plots.value = allPlots.slice(0, displayedPlotsCount.value)
    console.log(`📋 [PlotsView] Pagination applied in ${(performance.now() - paginationStart).toFixed(2)}ms, showing ${plots.value.length} plots`)
    
    const totalTime = performance.now() - loadStart
    console.log(`📋 [PlotsView] loadPlots completed in ${totalTime.toFixed(2)}ms`)
  } catch (err) {
    console.error('Error loading plots:', err)
    error.value = err
  } finally {
    loading.value = false
  }
}

// Computed property for filtered plots (now just returns the loaded plots)
const filteredPlots = computed(() => plots.value)

// Track total count for hasMorePlots
const totalPlotsCount = ref(0)

const hasMorePlots = computed(() => {
  return displayedPlotsCount.value < totalPlotsCount.value
})

// Methods
const viewPlot = (plot: any) => {
  router.push(`/plots/${plot.id}`)
}

const loadMore = async () => {
  displayedPlotsCount.value += pageSize.value
  await loadPlots()
}

// Debounce timer for search
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

// Watchers to trigger search when filters change (debounced for search query)
watch([searchQuery, sectionFilter, statusFilter], async () => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
  }
  
  searchDebounceTimer = setTimeout(async () => {
    displayedPlotsCount.value = pageSize.value
    await loadPlots()
  }, searchQuery.value ? 300 : 0) // 300ms debounce for search, instant for filters
}, { immediate: false })

// Watch for location changes
watch(() => locationsStore.selectedLocation, async () => {
  displayedPlotsCount.value = pageSize.value
  await loadPlots()
}, { immediate: false })

// Load plots when PowerSync is ready
watch(() => powerSyncStore.isInitialized, async (initialized, wasInitialized) => {
  console.log(`📋 [PlotsView] PowerSync watcher: initialized=${initialized}, wasInitialized=${wasInitialized}, hasLoadedOnce=${hasLoadedOnce.value}`)
  // Only trigger if PowerSync became initialized (not if it was already initialized)
  if (initialized && !wasInitialized && !hasLoadedOnce.value && powerSyncStore.powerSync) {
    const watcherStart = performance.now()
    hasLoadedOnce.value = true
    await loadPlots()
    console.log(`📋 [PlotsView] PowerSync watcher completed in ${(performance.now() - watcherStart).toFixed(2)}ms`)
  }
}, { immediate: true })


// Load images for displayed plots using a single optimized query (defer to next tick)
watch(filteredPlots, async (newPlots, oldPlots) => {
  const imageWatcherStart = performance.now()
  console.log(`📋 [PlotsView] Image watcher triggered: ${newPlots?.length || 0} plots`)
  
  // Only load when plots actually change
  if (newPlots && newPlots.length > 0 && newPlots !== oldPlots) {
    // Only load images that aren't already loaded
    const filterStart = performance.now()
    const imagesToLoad = newPlots.filter(plot => !plotImages.value.has(plot.id))
    console.log(`📋 [PlotsView] Filter check took ${(performance.now() - filterStart).toFixed(2)}ms, ${imagesToLoad.length} images to load`)
    
    if (imagesToLoad.length > 0) {
      // Defer image loading to next tick so cards render first
      await nextTick()
      await loadPlotImagesBatch(imagesToLoad.map(plot => plot.id))
      console.log(`📋 [PlotsView] Image watcher completed in ${(performance.now() - imageWatcherStart).toFixed(2)}ms`)
    }
  }
})

// Load images in a single batch query instead of individual queries
const loadPlotImagesBatch = async (plotIds: string[]) => {
  const batchStart = performance.now()
  console.log(`📋 [PlotsView] loadPlotImagesBatch: ${plotIds.length} plot IDs`)
  
  if (!powerSyncStore.powerSync || plotIds.length === 0) {
    return
  }

  try {
    // Use a single query with IN clause to get all images at once
    // Include images with thumbnail_data OR cloud_url (prioritize thumbnails)
    const placeholders = plotIds.map(() => '?').join(',')
    const query = `SELECT plot_id, thumbnail_data, cloud_url, data 
                   FROM plot_images 
                   WHERE plot_id IN (${placeholders}) 
                   AND (thumbnail_data IS NOT NULL OR cloud_url IS NOT NULL)
                   ORDER BY date_created DESC`

    const queryStart = performance.now()
    const allImages = await powerSyncStore.powerSync.getAll(query, plotIds) as any[]
    console.log(`📋 [PlotsView] Image query took ${(performance.now() - queryStart).toFixed(2)}ms, got ${allImages.length} images`)

    // Group by plot_id and take the first image for each plot
    const groupStart = performance.now()
    const imageMap = new Map<string, any>()
    for (const image of allImages) {
      if (!imageMap.has(image.plot_id)) {
        imageMap.set(image.plot_id, image)
      }
    }
    console.log(`📋 [PlotsView] Grouping images took ${(performance.now() - groupStart).toFixed(2)}ms, ${imageMap.size} unique plot images`)

    // Set the images in the cache
    const cacheStart = performance.now()
    for (const [plotId, image] of imageMap.entries()) {
      if (image.thumbnail_data) {
        plotImages.value.set(plotId, `data:image/jpeg;base64,${image.thumbnail_data}`)
      } else if (image.cloud_url) {
        plotImages.value.set(plotId, image.cloud_url)
      } else if (image.data) {
        plotImages.value.set(plotId, `data:image/jpeg;base64,${image.data}`)
      }
    }
    console.log(`📋 [PlotsView] Caching images took ${(performance.now() - cacheStart).toFixed(2)}ms`)
    
    console.log(`📋 [PlotsView] loadPlotImagesBatch completed in ${(performance.now() - batchStart).toFixed(2)}ms`)
  } catch (error) {
    console.error('Error loading plot images batch:', error)
  }
}

const getPlotSyncStatus = (_plotId: string) => {
  // This would check the sync status for a specific plot
  // For now, return a placeholder
  return 'synced'
}

const getStatusSeverity = (status: string) => {
  const severities = {
    'Active': 'success',
    'Reserved': 'warning',
    'Occupied': 'secondary',
    'Unavailable': 'danger'
  }
  return severities[status as keyof typeof severities] || 'secondary'
}

// Define event handlers outside async block so they're accessible to onUnmounted
const handlePlotCreated = (event: any) => {
  console.log('Plot created event received in PlotsView:', event.detail)
  // Reload plots to update the list
  loadPlots()
}

const handlePlotUpdated = (event: any) => {
  console.log('Plot updated event received in PlotsView:', event.detail)
  // Reload plots to update the list
  loadPlots()
}

const handlePlotEditingFinished = (event: any) => {
  console.log('Plot editing finished event received in PlotsView:', event.detail)
  // Reload plots to update the list
  loadPlots()
}

onMounted(async () => {
  const mountStart = performance.now()
  console.log('📋 [PlotsView] onMounted started')
  
  // Load locations only if not already loaded
  if (locationsStore.locations.length === 0) {
    const loadLocStart = performance.now()
    await locationsStore.loadLocations()
    console.log(`📋 [PlotsView] Locations loaded in ${(performance.now() - loadLocStart).toFixed(2)}ms`)
  }

  // Load plots if PowerSync is already initialized (e.g., navigating from another screen)
  if (powerSyncStore.isInitialized && !hasLoadedOnce.value && powerSyncStore.powerSync) {
    console.log('📋 [PlotsView] PowerSync already initialized, loading plots in onMounted')
    hasLoadedOnce.value = true
    await loadPlots()
  }

  window.addEventListener('plot-created', handlePlotCreated)
  window.addEventListener('plot-updated', handlePlotUpdated)
  window.addEventListener('plot-editing-finished', handlePlotEditingFinished)

  console.log(`📋 [PlotsView] onMounted completed in ${(performance.now() - mountStart).toFixed(2)}ms`)
})

// Clean up event listener on unmount
onUnmounted(() => {
  window.removeEventListener('plot-created', handlePlotCreated)
  window.removeEventListener('plot-updated', handlePlotUpdated)
  window.removeEventListener('plot-editing-finished', handlePlotEditingFinished)
})
</script>