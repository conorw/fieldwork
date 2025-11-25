<template>
  <div class="h-full flex flex-col min-h-0">
    <!-- Map Container -->
    <div class="flex-1 relative min-h-0 map-container h-full">
      <MapComponent ref="mapComponent" :center="mapCenter" :zoom="settingsStore.defaultZoom"
        :max-zoom="settingsStore.maxZoom" :min-zoom="settingsStore.minZoom" :extent="mapExtent"
        :restrict-extent="isExtentConfigured" :location="currentLocation" view-name="MainMap" tile-source-name="MainMap"
        :show-zoom="true" :show-scale-line="true" :show-attribution="true"
        :show-context-menu="true" :context-menu-items="[
          {
            action: 'add-plot',
            label: 'Add Plot at This Location',
            icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6'
          }
        ]" @map-created="handleMapCreated" @map-ready="handleMapReady" @error="handleMapError"
        @context-menu-action="handleContextMenuAction" />

      <!-- Camera Button Overlay -->
      <button @click="startPlotCreationWizard" 
        class="absolute top-4 left-1/2 transform -translate-x-1/2 z-20 flex items-center justify-center w-12 h-12 rounded-full bg-primary-600 hover:bg-primary-700 text-white shadow-lg hover:shadow-xl transition-all duration-200"
        title="Create from Photo">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      <!-- Drawing Instructions Overlay -->
      <div v-if="drawingMode" class="absolute top-4 left-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg z-20">
        <p class="text-sm">Click to draw plot area. Plot will be created as 8×4ft rectangle centered on your drawing.
        </p>
      </div>

      <!-- Editing Instructions Overlay -->
      <div v-if="editingMode"
        class="absolute top-4 left-4 bg-orange-600 text-white px-4 py-3 rounded-lg shadow-lg z-20">
        <p class="text-sm font-medium mb-1">Editing Plot</p>
        <p class="text-xs mb-1">• Drag corners to scale</p>
        <p class="text-xs mb-1">• Drag center to move</p>
        <p class="text-xs mb-2">• Use rotation handle to rotate</p>
        <button @click="finishEditing"
          class="mt-2 text-xs bg-white text-orange-600 px-2 py-1 rounded hover:bg-gray-100">
          Finish Editing
        </button>
      </div>

      <!-- Plot Editor Modal -->
      <div v-if="showMapEdit" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
          <MapEdit :is-visible="true" title="Edit Plot"
            instructions="Adjust the plot position, size, and rotation on the map" save-button-text="Save Changes"
            :existing-plot="selectedPlot" :max-zoom="settingsStore.maxZoom" :min-zoom="settingsStore.minZoom"
            :zoom="settingsStore.defaultZoom" @save="handlePlotEditSave" @cancel="closeMapEdit" @close="closeMapEdit" />
        </div>
      </div>


      <!-- Layer Control -->
      <LayerControl 
        :map-instance="mapStore.map" 
        @layer-visibility-changed="handleLayerVisibilityChanged"
        ref="layerControl"
      />

      <!-- Plot Info Panel -->
      <div v-if="selectedPlot" class="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-4 max-w-sm z-20 max-h-[calc(100vh-8rem)] overflow-y-auto">
        <h3 class="font-medium text-gray-900 mb-2">
          Plot {{ selectedPlot.section }}-{{ selectedPlot.row }}-{{ selectedPlot.number }}
        </h3>
        <p class="text-sm text-gray-600 mb-2">{{ selectedPlot.status }}</p>
        <p class="text-sm text-gray-600 mb-3">{{ selectedPlotPersonsNames || 'No deceased persons' }}</p>

        <!-- Thumbnail Images -->
        <ThumbnailViewer
          :images="plotImages"
          :title="`Plot ${selectedPlot.section}-${selectedPlot.row}-${selectedPlot.number} Photos`"
          :max-thumbnails="3"
          :image-alt="`Plot ${selectedPlot.section}-${selectedPlot.row}-${selectedPlot.number} photo`"
          :show-quality-indicator="true"
          :show-hover-actions="false"
          @image-click="viewImage"
        />

        <div class="flex space-x-2">
          <router-link :to="`/plots/${selectedPlot.id}`" 
            class="flex items-center justify-center w-10 h-10 rounded-lg bg-primary-600 hover:bg-primary-700 text-white shadow-md hover:shadow-lg transition-all duration-200"
            title="View Details">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </router-link>
          <button @click="togglePlotEditing" 
            :class="[
              'flex items-center justify-center w-10 h-10 rounded-lg shadow-md hover:shadow-lg transition-all duration-200',
              editingMode ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white'
            ]"
            :title="editingMode ? 'Finish Editing & Save' : 'Start Editing (Scale, Rotate, Move)'">
            <svg v-if="!editingMode" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
            </svg>
          </button>
          <button @click="mapStore.clearSelectedPlot" 
            class="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-500 hover:bg-gray-600 text-white shadow-md hover:shadow-lg transition-all duration-200"
            title="Close">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Photo Plot Creation Modal -->
  <PlotCreationWizard :is-visible="showPlotCreationWizard" :initial-location="persistentContextLocation"
    @close="handlePlotCreationWizardClose" @plot-created="handlePhotoPlotCreated" />
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { useMapStore } from '../stores/map'
import { useSettingsStore } from '../stores/settings'
import { usePowerSyncStore, usePlots, usePlotImages } from '../stores/powersync'
import { useLocationsStore } from '../stores/locations'
import PlotCreationWizard from '../components/PlotCreationWizard.vue'
import MapEdit from '../components/MapEdit.vue'
import MapComponent from '../components/MapComponent.vue'
import ThumbnailViewer from '../components/ThumbnailViewer.vue'
import LayerControl from '../components/LayerControl.vue'
import { useRouter } from 'vue-router'
import { updateLayerVisibility, refreshMapLayers } from '../utils/tileSource'
import { isLocationWithinBounds } from '../utils/locationUtils'
import { toLonLat } from 'ol/proj'

const mapStore = useMapStore()
const settingsStore = useSettingsStore()
const powerSyncStore = usePowerSyncStore()
const locationsStore = useLocationsStore()
const router = useRouter()

const mapComponent = ref(null)
const layerControl = ref(null)
const showPlotCreationWizard = ref(false)
const showMapEdit = ref(false)

// Context menu state
const persistentContextLocation = ref(null)

// Use PowerSync queries for reactive data
// Note: usePlots will return empty results until selectedLocationId is set
const { data: plots, refetch: refetchPlots } = usePlots()

// Computed properties
const currentLocation = computed(() => mapStore.currentLocation)
const drawingMode = computed(() => mapStore.drawingMode)
const editingMode = computed(() => mapStore.editingMode)
const selectedPlot = computed(() => mapStore.selectedPlot)
const selectedPlotPersonsNames = computed(() => mapStore.selectedPlotPersons.map(person => person.full_name).join(', '))
const isExtentConfigured = computed(() => mapStore.isExtentConfigured)
const mapExtent = computed(() => mapStore.mapExtent)

// Plot images for selected plot - use reactive plotId
// Create a ref for the plot ID so we can update it reactively
const selectedPlotId = computed(() => selectedPlot.value?.id || '')
const plotImagesQuery = usePlotImages(selectedPlotId)

const plotImages = computed(() => plotImagesQuery.data.value || [])

// Listen for plot selection events to refetch images (especially for newly created plots)
let plotSelectedHandler = null
onMounted(() => {
  plotSelectedHandler = async (event) => {
    const { plotId } = event.detail
    if (plotId && selectedPlot.value?.id === plotId && plotImagesQuery.refetch) {
      // Wait a bit for image to be inserted into database
      await new Promise(resolve => setTimeout(resolve, 500))
      await plotImagesQuery.refetch()
    }
  }
  
  window.addEventListener('plot-selected', plotSelectedHandler)
})

onUnmounted(() => {
  if (plotSelectedHandler) {
    window.removeEventListener('plot-selected', plotSelectedHandler)
  }
})


// Computed map center - use extent center if configured, otherwise use GPS-based center from settings
const mapCenter = computed(() => {
  if (isExtentConfigured.value && mapExtent.value) {
    // Calculate center from extent
    const [minLon, minLat, maxLon, maxLat] = mapExtent.value
    const centerLon = (minLon + maxLon) / 2
    const centerLat = (minLat + maxLat) / 2
    return [centerLon, centerLat]
  }
  // Use GPS-based center from settings store, fallback to Ballycastle
  return settingsStore.defaultCenter
})

// Check if extent configuration is needed
const checkLocationSelection = () => {
  if (!locationsStore.selectedLocationId) {
    router.push('/locations')
  }
}

// Methods
const finishEditing = async () => {
  try {
    // Get the current plot and its geometry
    if (selectedPlot.value) {
      // Find the plot feature on the map
      const layers = mapStore.map.getLayers().getArray()
      let plotFeature = null
      
      for (const layer of layers) {
        if (layer.get('name') === 'plots') {
          const vectorLayer = layer
          const source = vectorLayer.getSource()
          const features = source.getFeatures()
          plotFeature = features.find((f) => f.get('plot')?.id === selectedPlot.value.id)
          if (plotFeature) break
        }
      }
      
      if (plotFeature) {
        // Get the current geometry
        const geometry = plotFeature.getGeometry()
        const coordinates = geometry.getCoordinates()[0]
        
        // Convert coordinates back to lat/lng
        const latLngCoordinates = coordinates.map((coord) => toLonLat(coord))
        
        // Save the updated coordinates to the database
        await mapStore.saveInPlacePlotCoordinates(latLngCoordinates, selectedPlot.value.id)
        
        // Update the plot data in the selectedPlot to reflect the new geometry
        selectedPlot.value.geometry = JSON.stringify({
          type: 'Polygon',
          coordinates: [latLngCoordinates]
        })
      }
    }
    
    // Disable editing mode
    await mapStore.disableInPlacePlotEditing()
  } catch (error) {
    console.error('Error finishing plot editing:', error)
  }
}

const togglePlotEditing = async () => {
  if (editingMode.value) {
    // Currently editing - finish editing and save
    await finishEditing()
  } else {
    // Not editing - start editing
    if (selectedPlot.value) {
      await mapStore.enableInPlacePlotEditing(selectedPlot.value)
    }
  }
}

const startPlotCreationWizard = async () => {
  // Check if current location is within allowed extent
  const currentLocation = mapStore.currentLocation
  const allowedExtent = mapStore.mapExtent
  
  // Check if we have both location and extent
  if (!currentLocation) {
    showPlotCreationWizard.value = true
    return
  }
  
  if (!allowedExtent) {
    showPlotCreationWizard.value = true
    return
  }
  
  // Check bounds
  const isWithinBounds = isLocationWithinBounds(currentLocation, allowedExtent)
  
  if (!isWithinBounds) {
    // Show error message and prevent plot creation
    alert('Location Outside Bounds\n\nYour current location is outside the allowed cemetery area. Please move to a valid location within the cemetery boundaries to create a plot.')
    return
  }
  
  showPlotCreationWizard.value = true
}

const handlePhotoPlotCreated = async (newPlot) => {
  // Clear the persistent context location after plot creation
  persistentContextLocation.value = null

  // Refetch plots to update the list
  if (typeof refetchPlots === 'function') {
    refetchPlots()
  }

  // Handle zoom to plot and show popup
  if (newPlot) {
    try {
      // Add the plot to the map first if it's not already there
      await mapStore.addPlotMarker(newPlot)
      // Then zoom to it and show the popup
      await mapStore.zoomToPlot(newPlot)
    } catch (error) {
      console.error('MapView: Error handling zoom to plot:', error)
    }
  }
}

// Clean up context menu location when modal is closed without creating a plot
const handlePlotCreationWizardClose = () => {
  showPlotCreationWizard.value = false
  persistentContextLocation.value = null
}

const handlePlotEditSave = (updatedPlot) => {
  // Update the selected plot in the store
  mapStore.updatePlot(updatedPlot)
  // Close the editor
  closeMapEdit()
  // Refetch plots to update the list
  if (typeof refetchPlots === 'function') {
    refetchPlots()
  }
}

const closeMapEdit = () => {
  showMapEdit.value = false
}

// Listen for new plot creation events
const handlePlotCreated = () => {
  // Refetch plots to update the list
  if (typeof refetchPlots === 'function') {
    refetchPlots()
  }
}

// Listen for plot update events
const handlePlotUpdated = () => {
  // Refetch plots to update the list
  if (typeof refetchPlots === 'function') {
    refetchPlots()
  }
}

// Listen for plot editing completion events
const handlePlotEditingFinished = () => {
  // Refetch plots to update the list and refresh map display
  if (typeof refetchPlots === 'function') {
    refetchPlots()
  }
}

// Listen for open plot editor events
const handleOpenMapEdit = () => {
  showMapEdit.value = true
}

// Listen for navigation to plots view events
const handleNavigateToPlots = () => {
  router.push('/plots')
}

// Listen for navigation to plot detail events
const handleNavigateToPlotDetail = (event) => {
  const { plotId, editMode, plotData } = event.detail

  // Check if plotData is too large for URL query parameters
  const plotDataString = plotData ? JSON.stringify(plotData) : undefined
  if (plotDataString && plotDataString.length > 2000) {
    // For large data, we'll rely on the PowerSync query instead
    const query = editMode ? { editMode: 'true' } : {}
    router.push({ path: `/plots/${plotId}`, query })
  } else {
    // Navigate to specific plot detail page with edit mode if requested
    if (editMode) {
      router.push({
        path: `/plots/${plotId}`,
        query: {
          editMode: 'true',
          plotData: plotDataString
        }
      })
    } else {
      router.push({
        path: `/plots/${plotId}`,
        query: {
          plotData: plotDataString
        }
      })
    }
  }
}

// Listen for zoom to plot events
const handleZoomToPlot = async (event) => {
  const { plot } = event.detail

  if (plot) {
    // Add the plot to the map first if it's not already there
    await mapStore.addPlotMarker(plot)
    // Then zoom to it and show the popup
    await mapStore.zoomToPlot(plot)
  }
}

// Listen for clear map data events
const handleClearMapData = () => {
  // Clear all map layers except the base tile layer
  if (mapStore.map) {
    const layers = mapStore.map.getLayers()
    const layersToRemove = []

    // Collect all layers except the base tile layer
    layers.forEach(layer => {
      if (layer.getSource && layer.getSource().getFeatures) {
        // This is a vector layer with features (plots)
        layersToRemove.push(layer)
      }
    })

    // Remove the collected layers
    layersToRemove.forEach(layer => {
      mapStore.map.removeLayer(layer)
    })
  }

  // Clear selected plot
  mapStore.clearSelectedPlot()
}

// Initialize map when component mounts
onMounted(async () => {
  try {
    // Only load locations if not already loaded
    if (locationsStore.locations.length === 0) {
      await locationsStore.loadLocations()
    }

    // Check if a location is selected
    checkLocationSelection()

    // Initialize map store if not already initialized
    if (!mapStore.initialized) {
      await mapStore.initialize()
    }

    // Wait for PowerSync to initialize before refetching plots
    // This prevents queries from blocking on database initialization (15+ seconds on slow networks)
    if (!powerSyncStore.isInitialized) {
      let waitAttempts = 0
      const maxAttempts = 150
      
      while (!powerSyncStore.isInitialized && waitAttempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100))
        waitAttempts++
      }
      
      // If still not initialized after waiting, continue anyway
      if (powerSyncStore.isInitialized) {
        // After PowerSync initializes, give it a moment to start syncing data
        // This prevents queries from running against an empty local database
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    } else {
      // Even if already initialized, give Android IndexedDB a moment to be fully ready
      // This helps with IndexedDB transaction initialization on slower devices
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // Restore saved zoom level when returning to map view
    if (mapStore.map) {
      mapStore.restoreZoomLevel()
    }
  } catch (error) {
    console.error('Error initializing map store:', error)
  }
})

// Listen for new plot creation events
window.addEventListener('plot-created', handlePlotCreated)
window.addEventListener('plot-updated', handlePlotUpdated)
window.addEventListener('plot-editing-finished', handlePlotEditingFinished)
window.addEventListener('open-map-edit', handleOpenMapEdit)
window.addEventListener('navigate-to-plots', handleNavigateToPlots)
window.addEventListener('navigate-to-plot-detail', handleNavigateToPlotDetail)
window.addEventListener('zoom-to-plot', handleZoomToPlot)
window.addEventListener('clear-map-data', handleClearMapData)

// Clean up event listeners on unmount
onUnmounted(() => {
  window.removeEventListener('plot-created', handlePlotCreated)
  window.removeEventListener('plot-updated', handlePlotUpdated)
  window.removeEventListener('plot-editing-finished', handlePlotEditingFinished)
  window.removeEventListener('open-map-edit', handleOpenMapEdit)
  window.removeEventListener('navigate-to-plots', handleNavigateToPlots)
  window.removeEventListener('navigate-to-plot-detail', handleNavigateToPlotDetail)
  window.removeEventListener('zoom-to-plot', handleZoomToPlot)
  window.removeEventListener('clear-map-data', handleClearMapData)
})

// Watch for map availability and restore zoom level
watch(() => mapStore.map, (newMap, oldMap) => {
  if (newMap && !oldMap) {
    // Map just became available, restore zoom level
    mapStore.restoreZoomLevel()
  }
})

// Consolidated watcher for adding and removing plots from map
watch([plots, () => mapStore.map], async ([newPlots, map]) => {
  // Only process if map is available and we have plots data
  if (!map || !mapStore.plotsLayer) return
  
  const source = mapStore.plotsLayer.getSource()
  if (!source) return
  
  // Get current plot IDs from the plots array
  const currentPlotIds = new Set((newPlots || []).map(plot => plot.id))
  
  // Get existing features on the map
  const existingFeatures = source.getFeatures()
  const existingPlotIds = new Set(existingFeatures.map(f => f.get('plot')?.id).filter(Boolean))
  
  // Find plots to add (in plots array but not on map)
  const plotsToAdd = (newPlots || []).filter(plot => !existingPlotIds.has(plot.id))
  
  // Find plots to remove (on map but not in plots array)
  const plotsToRemove = existingFeatures.filter(f => {
    const plotId = f.get('plot')?.id
    return plotId && !currentPlotIds.has(plotId)
  })
  
  // Remove plots that are no longer in the data
  if (plotsToRemove.length > 0) {
    plotsToRemove.forEach(feature => {
      source.removeFeature(feature)
    })
  }
  
  // Add new plots
  if (plotsToAdd.length > 0) {
    const plotPromises = plotsToAdd.map(plot => mapStore.addPlotMarkerOptimized(plot))
    await Promise.all(plotPromises)
  }
  
  // Trigger a single render update if anything changed
  if (plotsToAdd.length > 0 || plotsToRemove.length > 0) {
    source.changed()
  }
}, { immediate: true })


// MapComponent event handlers
const handleMapCreated = (mapInstance) => {
  // Pass map instance to store
  mapStore.setMap(mapInstance)
}

const handleMapReady = async () => {
  // Plot loading is now handled by the consolidated watcher
}

const handleMapError = (error) => {
  console.error('MapView: Map error event received:', error)
}

// New handler for context menu actions from MapComponent
const handleContextMenuAction = async ({ action, location }) => {
  if (action === 'add-plot' && location) {
    // Store the location for the plot creation wizard
    persistentContextLocation.value = location

    // Wait for the next tick to ensure the location is set before opening modal
    await nextTick()

    // Start photo plot creation with the clicked location
    showPlotCreationWizard.value = true
  }
}

// Image click handler
const viewImage = (image) => {
  if (selectedPlot.value?.id) {
    router.push(`/plots/${selectedPlot.value.id}`)
  }
}


// Handle layer visibility changes
const handleLayerVisibilityChanged = (visibilityData) => {
  // Update the global layer visibility state
  updateLayerVisibility(visibilityData.featureLayers)
  
  // Refresh the map layers to apply changes
  if (mapStore.map) {
    refreshMapLayers(mapStore.map)
  }
}
</script>