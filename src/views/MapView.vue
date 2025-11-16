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
import { mapViewLogger } from '../utils/logger'
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

// Use Zero queries for reactive data
// Note: usePlots will return empty results until selectedLocationId is set
const { data: plots, refetch: refetchPlots } = usePlots()

// Removed debug logging to improve performance

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
      console.log('🗺️ [MapView] Plot selected, refetching images for plot:', plotId)
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
const toggleDrawingMode = () => {
  mapStore.toggleDrawingMode()
}

const centerOnLocation = async () => {
  await mapStore.centerOnLocation()
}

const cancelDrawing = () => {
  mapStore.cancelDrawing()
}

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
        console.log('Updated selectedPlot geometry to match saved coordinates')
      }
    }
    
    // Disable editing mode
    console.log('About to call disableInPlacePlotEditing...')
    await mapStore.disableInPlacePlotEditing()
    console.log('Plot editing finished successfully')
    console.log('Editing mode after disable:', mapStore.editingMode)
    console.log('Local editingMode after disable:', editingMode.value)
    console.log('=== FINISH EDITING COMPLETED ===')
  } catch (error) {
    console.error('Error finishing plot editing:', error)
  }
}

const togglePlotEditing = async () => {
  if (editingMode.value) {
    // Currently editing - finish editing and save
    console.log('Finishing plot editing and saving...')
    await finishEditing()
    console.log('After finishEditing, editingMode:', editingMode.value)
    console.log('MapStore editingMode:', mapStore.editingMode)
  } else {
    // Not editing - start editing
    if (selectedPlot.value) {
      console.log('Starting plot editing for:', selectedPlot.value)
      await mapStore.enableInPlacePlotEditing(selectedPlot.value)
      console.log('After enableInPlacePlotEditing, editingMode:', editingMode.value)
      console.log('MapStore editingMode:', mapStore.editingMode)
    }
  }
}

const startPlotCreationWizard = async () => {
  // Check if current location is within allowed extent
  const currentLocation = mapStore.currentLocation
  const allowedExtent = mapStore.mapExtent
  mapViewLogger.debug('Checking location for plot creation:', {
    currentLocation,
    allowedExtent,
    hasCurrentLocation: !!currentLocation,
    hasAllowedExtent: !!allowedExtent,
    currentLocationType: typeof currentLocation,
    allowedExtentType: typeof allowedExtent,
    currentLocationKeys: currentLocation ? Object.keys(currentLocation) : 'N/A',
    allowedExtentLength: allowedExtent ? allowedExtent.length : 'N/A'
  })
  
  // Check if we have both location and extent
  if (!currentLocation) {
    mapViewLogger.warn('No current location available, allowing plot creation')
    showPlotCreationWizard.value = true
    return
  }
  
  if (!allowedExtent) {
    mapViewLogger.warn('No extent configured, allowing plot creation')
    showPlotCreationWizard.value = true
    return
  }
  
  // Check bounds
  const isWithinBounds = isLocationWithinBounds(currentLocation, allowedExtent)
  mapViewLogger.debug('Location bounds check:', { 
    isWithinBounds,
    locationCoords: { lat: currentLocation.latitude, lon: currentLocation.longitude },
    extentBounds: allowedExtent
  })
  
  if (!isWithinBounds) {
    // Show error message and prevent plot creation
    mapViewLogger.error('Current location is outside allowed extent, preventing plot creation')
    
    // Show error message to user
    alert('Location Outside Bounds\n\nYour current location is outside the allowed cemetery area. Please move to a valid location within the cemetery boundaries to create a plot.')
    
    return // Don't open the wizard
  }
  
  mapViewLogger.info('Location is within bounds, opening plot creation wizard')
  showPlotCreationWizard.value = true
}

const handlePhotoPlotCreated = async (newPlot) => {
  console.log('🔍 MapView: handlePhotoPlotCreated called with plot:', newPlot)
  console.log('🔍 MapView: Plot ID:', newPlot?.id)
  console.log('🔍 MapView: Plot geometry available:', !!newPlot?.geometry)
  console.log('🔍 persistentContextLocation before clearing:', persistentContextLocation.value)

  // Clear the persistent context location after plot creation
  persistentContextLocation.value = null
  console.log('🔍 persistentContextLocation after clearing: null')

  // Refetch plots to update the list
  if (typeof refetchPlots === 'function') {
    refetchPlots()
  } else {
    console.warn('refetchPlots is not available, plots will update automatically')
  }

  // Handle zoom to plot and show popup
  if (newPlot) {
    console.log('MapView: Handling zoom to newly created plot:', newPlot.id)
    console.log('MapView: Map store available:', !!mapStore)
    console.log('MapView: Map available:', !!mapStore.map)

    try {
      // Add the plot to the map first if it's not already there
      await mapStore.addPlotMarker(newPlot)
      console.log('MapView: Plot marker added, now zooming to plot')

      // Then zoom to it and show the popup
      await mapStore.zoomToPlot(newPlot)
      console.log('MapView: Zoom to plot completed')
    } catch (error) {
      console.error('MapView: Error handling zoom to plot:', error)
    }
  } else {
    console.warn('MapView: No plot data in handlePhotoPlotCreated')
  }
}

// Clean up context menu location when modal is closed without creating a plot
const handlePlotCreationWizardClose = () => {
  console.log('MapView: Plot creation wizard closed')
  // Close the modal
  showPlotCreationWizard.value = false
  // Clear the persistent context location when modal is closed without creating a plot
  persistentContextLocation.value = null
}

const handlePlotEditSave = (updatedPlot) => {
  console.log('Plot edited:', updatedPlot)
  // Update the selected plot in the store
  mapStore.updatePlot(updatedPlot)
  // Close the editor
  closeMapEdit()
  // Refetch plots to update the list
  if (typeof refetchPlots === 'function') {
    refetchPlots()
  } else {
    console.warn('refetchPlots is not available, plots will update automatically')
  }
}

const closeMapEdit = () => {
  console.log('MapView: Closing MapEdit modal')

  // MapEdit is now independent - no need to reset mapStore configuration
  showMapEdit.value = false
}

// Listen for new plot creation events
const handlePlotCreated = (event) => {
  console.log('MapView: Plot created event received:', event.detail)
  console.log('MapView: Event type:', event.type)
  console.log('MapView: Event detail keys:', Object.keys(event.detail || {}))

  // Refetch plots to update the list
  if (typeof refetchPlots === 'function') {
    refetchPlots()
  } else {
    console.warn('refetchPlots is not available, plots will update automatically')
  }
}

// Listen for plot update events
const handlePlotUpdated = (event) => {
  console.log('Plot updated event received:', event.detail)
  // Refetch plots to update the list
  if (typeof refetchPlots === 'function') {
    refetchPlots()
  } else {
    console.warn('refetchPlots is not available, plots will update automatically')
  }
}

// Listen for plot editing completion events
const handlePlotEditingFinished = (event) => {
  console.log('Plot editing finished event received:', event.detail)
  // Refetch plots to update the list and refresh map display
  if (typeof refetchPlots === 'function') {
    refetchPlots()
  } else {
    console.warn('refetchPlots is not available, plots will update automatically')
  }
}

// Listen for open plot editor events
const handleOpenMapEdit = (event) => {
  // MapEdit is now independent - no need to update mapStore configuration
  console.log('MapView: Opening MapEdit with independent zoom configuration')

  showMapEdit.value = true
}

// Listen for navigation to plots view events
const handleNavigateToPlots = (event) => {
  console.log('Navigate to plots event received:', event.detail)
  // Navigate to plots view
  router.push('/plots')
}

// Listen for navigation to plot detail events
const handleNavigateToPlotDetail = (event) => {
  console.log('Navigate to plot detail event received:', event.detail)
  const { plotId, editMode, plotData } = event.detail

  // Check if plotData is too large for URL query parameters
  const plotDataString = plotData ? JSON.stringify(plotData) : undefined
  if (plotDataString && plotDataString.length > 2000) {
    console.warn('Plot data is too large for URL query parameter, length:', plotDataString.length)
    // For large data, we'll rely on the Zero.dev query instead
    const query = editMode ? { editMode: 'true' } : {}
    router.push({ path: `/plots/${plotId}`, query })
  } else {
    console.log('Plot data size is acceptable for URL query parameter, length:', plotDataString?.length || 0)
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
  console.log('MapView: Zoom to plot event received:', event.detail)
  console.log('MapView: Event type:', event.type)
  console.log('MapView: Event detail keys:', Object.keys(event.detail || {}))

  const { plot } = event.detail

  if (plot) {
    console.log('MapView: Processing zoom to plot:', plot.id)
    console.log('MapView: Plot geometry available:', !!plot.geometry)
    console.log('MapView: Map store available:', !!mapStore)
    console.log('MapView: Map available:', !!mapStore.map)

    // Add the plot to the map first if it's not already there
    await mapStore.addPlotMarker(plot)
    console.log('MapView: Plot marker added, now zooming to plot')

    // Then zoom to it and show the popup
    await mapStore.zoomToPlot(plot)
    console.log('MapView: Zoom to plot completed')
  } else {
    console.warn('MapView: No plot data in zoom-to-plot event')
    console.warn('MapView: Event detail:', event.detail)
  }
}

// Listen for clear map data events
const handleClearMapData = (event) => {
  console.log('Clear map data event received')
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

    console.log('Cleared', layersToRemove.length, 'plot layers from map')
  }

  // Clear selected plot
  mapStore.clearSelectedPlot()
}

// Initialize map when component mounts
onMounted(async () => {
  const mountStart = performance.now()
  console.log('🗺️ [MapView] onMounted started')
  
  try {
    // Only load locations if not already loaded
    if (locationsStore.locations.length === 0) {
      console.log('🗺️ [MapView] Loading locations...')
      const loadStart = performance.now()
      await locationsStore.loadLocations()
      console.log(`🗺️ [MapView] Locations loaded in ${(performance.now() - loadStart).toFixed(2)}ms`)
    }

    // Check if a location is selected
    checkLocationSelection()

    // Initialize map store if not already initialized
    if (!mapStore.initialized) {
      console.log('🗺️ [MapView] Initializing map store...')
      const initStart = performance.now()
      await mapStore.initialize()
      console.log(`🗺️ [MapView] Map store initialized in ${(performance.now() - initStart).toFixed(2)}ms`)
    }

    // Wait for PowerSync to initialize before refetching plots
    // This prevents queries from blocking on database initialization (15+ seconds on slow networks)
    console.log('🗺️ [MapView] Checking PowerSync state...', {
      isInitialized: powerSyncStore.isInitialized,
      isConnecting: powerSyncStore.isConnecting,
      hasPowerSync: !!powerSyncStore.powerSync
    })
    
    if (!powerSyncStore.isInitialized) {
      console.log('🗺️ [MapView] Waiting for PowerSync to initialize...')
      const powersyncStart = performance.now()
      let waitAttempts = 0
      const maxAttempts = 150
      
      while (!powerSyncStore.isInitialized && waitAttempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100))
        waitAttempts++
        
        // Log progress every 10 attempts (1 second)
        if (waitAttempts % 10 === 0) {
          console.log(`🗺️ [MapView] Still waiting for PowerSync... (attempt ${waitAttempts}/${maxAttempts})`, {
            isInitialized: powerSyncStore.isInitialized,
            isConnecting: powerSyncStore.isConnecting
          })
        }
      }
      
      const powersyncReadyTime = performance.now() - powersyncStart
      console.log(`🗺️ [MapView] PowerSync initialized in ${powersyncReadyTime.toFixed(2)}ms (attempts: ${waitAttempts}/${maxAttempts})`, {
        isInitialized: powerSyncStore.isInitialized,
        isConnecting: powerSyncStore.isConnecting
      })
      
      // If still not initialized after waiting, log warning but continue
      if (!powerSyncStore.isInitialized) {
        console.warn('🗺️ [MapView] PowerSync not initialized after 15s wait, proceeding anyway')
      } else {
        // After PowerSync initializes, give it a moment to start syncing data
        // This prevents queries from running against an empty local database
        console.log('🗺️ [MapView] Waiting 200ms for PowerSync to start syncing...')
        await new Promise(resolve => setTimeout(resolve, 200))
        console.log('🗺️ [MapView] Proceeding with plot query...')
      }
    } else {
      console.log('🗺️ [MapView] PowerSync already initialized')
      // Even if already initialized, give Android IndexedDB a moment to be fully ready
      // This helps with IndexedDB transaction initialization on slower devices
      console.log('🗺️ [MapView] Waiting 100ms for IndexedDB to be fully ready...')
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    // No need to manually refetch - usePlots() uses PowerSync's watch() which automatically
    // streams updates when plots change. The watch() is started automatically when PowerSync
    // initializes and location is selected.
    console.log('🗺️ [MapView] Plots will load automatically via PowerSync watch()')

    // Restore saved zoom level when returning to map view
    if (mapStore.map) {
      mapStore.restoreZoomLevel()
    }
    
    const totalTime = performance.now() - mountStart
    console.log(`🗺️ [MapView] onMounted completed in ${totalTime.toFixed(2)}ms`)
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
watch([plots, () => mapStore.map], async ([newPlots, map], [oldPlots, oldMap]) => {
  // Only process if map is available and we have plots data
  if (!map || !mapStore.plotsLayer) return
  
  const watchStart = performance.now()
  console.log(`🗺️ [MapView] Plots watcher triggered: ${newPlots?.length || 0} plots, map available: ${!!map}`)
  
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
  
  console.log(`🗺️ [MapView] Plots to add: ${plotsToAdd.length}, plots to remove: ${plotsToRemove.length}`)
  
  // Remove plots that are no longer in the data
  if (plotsToRemove.length > 0) {
    const removeStart = performance.now()
    plotsToRemove.forEach(feature => {
      source.removeFeature(feature)
      const plotId = feature.get('plot')?.id
      console.log(`🗺️ [MapView] Removed plot ${plotId} from map`)
    })
    console.log(`🗺️ [MapView] Removing plots took ${(performance.now() - removeStart).toFixed(2)}ms`)
  }
  
  // Add new plots
  if (plotsToAdd.length > 0) {
    const addStart = performance.now()
    const plotPromises = plotsToAdd.map(plot => mapStore.addPlotMarkerOptimized(plot))
    await Promise.all(plotPromises)
    console.log(`🗺️ [MapView] Adding plots took ${(performance.now() - addStart).toFixed(2)}ms`)
  }
  
  // Trigger a single render update if anything changed
  if (plotsToAdd.length > 0 || plotsToRemove.length > 0) {
    source.changed()
    console.log(`🗺️ [MapView] Plots watcher completed in ${(performance.now() - watchStart).toFixed(2)}ms`)
  }
}, { immediate: true })

// Close context menu when clicking outside
const handleMapClick = () => {
  // if (showContextMenu.value) { // This line is removed
  //   hideContextMenu() // This line is removed
  // }
}

// Add click handler to map element
onMounted(() => {
  // The MapComponent handles its own click events, so we don't need to add listeners here
  // The context menu will be closed by the MapComponent's click events
})

onUnmounted(() => {
  // No need to remove listeners since we're not adding them
})

// MapComponent event handlers
const handleMapCreated = (mapInstance) => {
  console.log('MapView: Map created event received:', mapInstance)
  // Pass map instance to store
  mapStore.setMap(mapInstance)
}

const handleMapReady = async (mapInstance) => {
  console.log('MapView: Map ready event received:', mapInstance)

  // Debug LayerControl component
  console.log('MapView: LayerControl ref:', layerControl.value)
  console.log('MapView: LayerControl component mounted:', !!layerControl.value)
  
  // Plot loading is now handled by the consolidated watcher
}

const handleMapError = (error) => {
  console.error('MapView: Map error event received:', error)
}

// New handler for context menu actions from MapComponent
const handleContextMenuAction = async ({ action, location }) => {
  console.log('Context menu action received:', action, 'at location:', location)

  if (action === 'add-plot' && location) {
    console.log('🔍 Adding plot at location:', location)
    console.log('🔍 Location details:', {
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy
    })

    // Store the location for the plot creation wizard
    persistentContextLocation.value = location
    console.log('🔍 persistentContextLocation set to:', persistentContextLocation.value)

    // Wait for the next tick to ensure the location is set before opening modal
    await nextTick()

    // Start photo plot creation with the clicked location
    showPlotCreationWizard.value = true

    // Debug: Check if the location is still available after opening modal
    console.log('🔍 PlotCreationWizard modal opened, persistentContextLocation:', persistentContextLocation.value)
    console.log('🔍 PlotCreationWizard modal opened, persistentContextLocation still valid:', !!persistentContextLocation.value)
  }
}

// Image click handler
const viewImage = (image) => {
  if (selectedPlot.value?.id) {
    router.push(`/plots/${selectedPlot.value.id}`)
  }
}

const getLocationName = (locationId) => {
  if (!locationId) return 'No Location'
  const location = locationsStore.locations.find(loc => loc.id === locationId)
  return location ? location.name : 'Unknown Location'
}

// Handle layer visibility changes
const handleLayerVisibilityChanged = (visibilityData) => {
  console.log('🔍 MapView: Layer visibility changed:', visibilityData)
  console.log('🔍 MapView: Map instance available:', !!mapStore.map)
  
  // Update the global layer visibility state
  updateLayerVisibility(visibilityData.featureLayers)
  
  // Refresh the map layers to apply changes
  if (mapStore.map) {
    console.log('🔍 MapView: Refreshing map layers...')
    refreshMapLayers(mapStore.map)
  } else {
    console.warn('⚠️ MapView: No map instance available for refresh')
  }
}
</script>