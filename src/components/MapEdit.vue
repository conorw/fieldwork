<template>
  <div class="plot-editor h-full flex flex-col">
    <!-- Header - Only show in edit mode -->
    <div v-if="!isPhotoMode" class="bg-primary-600 text-white px-4 py-3 rounded-t-lg">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold">{{ title }}</h3>
        <button @click="closeEditor" class="text-white hover:text-gray-200">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Content -->
    <div :class="isPhotoMode ? 'p-0 flex flex-col h-full min-h-0' : 'p-4'">
      <!-- Instructions - Only show in edit mode, not photo mode -->
      <div v-if="!isPhotoMode" class="bg-gray-100 rounded-lg p-4 mb-4">
        <p class="text-sm text-gray-600 mb-2">{{ instructions }}</p>
        <ul class="text-sm text-gray-600 space-y-1">
          <li>• <strong>Click on the blue polygon</strong> to select it for editing</li>
          <li>• <strong>Drag the polygon</strong> to move it to the correct location</li>
          <li>• <strong>Drag the rotation handle</strong> (circular arrow) to rotate the plot</li>
          <li v-if="!allowCustomSizing">• <strong>Plot size is fixed</strong> at {{ selectedPlotSize?.width || 8 }}×{{
            selectedPlotSize?.height || 4 }}ft and cannot be changed</li>
          <li v-else>• <strong>Drag the resize handles</strong> to change the plot size</li>
        </ul>
      </div>

      <!-- Map Container -->
      <div
        :class="isPhotoMode ? 'flex-1 bg-gray-200 rounded-lg relative overflow-hidden min-h-0' : 'h-full bg-gray-200 rounded-lg relative overflow-hidden mb-4'"
        style="height: 450px;">
        <!-- Loading State -->
        <div v-if="isLoading" class="absolute inset-0 flex items-center justify-center bg-gray-200 bg-opacity-75 z-10">
          <div class="text-center">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-2"></div>
            <p class="text-sm text-gray-600">Loading map...</p>
          </div>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="absolute inset-0 flex items-center justify-center bg-gray-200 bg-opacity-75 z-10">
          <div class="text-center p-4">
            <svg class="w-8 h-8 text-red-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <p class="text-sm text-red-600 mb-2">{{ error }}</p>
            <button @click="retryInitialization" class="btn-secondary text-sm">
              Try Again
            </button>
          </div>
        </div>

        <div ref="mapElement" class="w-full h-full"></div>

        <!-- Location Indicator -->
        <LocationIndicator v-if="map && showLocationIndicator" :map="map" :location="currentLocation"
          :direction="userDirection" :accuracy="currentLocation?.accuracy" :show-accuracy-circle="true"
          :show-direction="true" :show-indicator="showLocationIndicator" />
      </div>

      <!-- Plot Information Display -->
      <div v-if="showPlotInfo" class="bg-gray-50 rounded-lg p-4 mb-4">
        <h4 class="font-medium mb-2">Plot Information</h4>
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span class="font-medium">Size:</span> {{ plotInfo.size }}
          </div>
          <div>
            <span class="font-medium">Location:</span> {{ plotInfo.location }}
          </div>
          <div>
            <span class="font-medium">Direction:</span> {{ plotInfo.direction }}
          </div>
          <div>
            <span class="font-medium">Date:</span> {{ plotInfo.date }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch, computed } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { useMapStore } from '../stores/map'
import { createBestTileSource } from '../utils/tileSource'
import { createMapView } from '../utils/mapView'
import { useLocationsStore } from '../stores/locations'
import LocationIndicator from './LocationIndicator.vue'
import { useDeviceOrientation } from '../composables/useDeviceOrientation'

// Static imports for OpenLayers
import Map from 'ol/Map'
import Feature from 'ol/Feature'
import Polygon from 'ol/geom/Polygon'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import Style from 'ol/style/Style'
import Fill from 'ol/style/Fill'
import Stroke from 'ol/style/Stroke'
import Zoom from 'ol/control/Zoom'
import Modify from 'ol/interaction/Modify'
import Select from 'ol/interaction/Select'
import Collection from 'ol/Collection'
import { fromLonLat, toLonLat } from 'ol/proj'

// Get stores
const settingsStore = useSettingsStore()
const mapStore = useMapStore()
const locationsStore = useLocationsStore()

// Props
const props = defineProps({
  isVisible: {
    type: Boolean,
    default: false
  },
  location: {
    type: Object,
    default: () => ({ latitude: 55.204, longitude: -6.238 }) // Default to Ballycastle
  },
  zoom: {
    type: Number,
    default: 16
  },
  maxZoom: {
    type: Number,
    default: 23
  },
  minZoom: {
    type: Number,
    default: 17
  },
  extent: {
    type: Array,
    default: null // [minX, minY, maxX, maxY] in same coordinate system as center
  },
  restrictExtent: {
    type: Boolean,
    default: true
  },
  isPhotoMode: {
    type: Boolean,
    default: false
  },
  existingPlot: {
    type: Object,
    default: null
  },
  selectedPlotSize: {
    type: Object,
    default: () => ({ width: 8, height: 4 })
  },
  userDirection: {
    type: Number,
    default: 0
  },
  allowCustomSizing: {
    type: Boolean,
    default: false
  },
  showLocationIndicator: {
    type: Boolean,
    default: true
  },
  title: {
    type: String,
    default: 'Map Editor'
  },
  instructions: {
    type: String,
    default: 'Position and adjust the plot on the map.'
  },
  existingPlots: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['close', 'error', 'ready'])

// Computed properties to use settings store values when props are not provided
const effectiveZoom = computed(() => props.zoom || settingsStore.defaultZoom)
const effectiveMaxZoom = computed(() => props.maxZoom || settingsStore.maxZoom)
const effectiveMinZoom = computed(() => props.minZoom || settingsStore.minZoom)

// State
const mapElement = ref(null)
const map = ref(null)
const currentEditingFeature = ref(null)
const initializationTimeout = ref(null)
const isLoading = ref(false)
const error = ref(null)
const isInitializing = ref(false)
const showPlotInfo = ref(false)
const plotInfo = ref({
  size: '',
  location: '',
  direction: '',
  date: ''
})

// Location tracking state
const currentLocation = ref(null)
// Use device orientation composable
const { userDirection, startOrientationListener, stopOrientationListener } = useDeviceOrientation()

// Methods
const initializeMap = async () => {
  // Prevent multiple simultaneous initializations
  if (isInitializing.value) {
    return
  }

  isInitializing.value = true
  isLoading.value = true
  error.value = null

  // Set a timeout to ensure we always emit something
  initializationTimeout.value = setTimeout(() => {
    console.error('MapEdit: Initialization timeout - forcing ready signal')
    isLoading.value = false
    error.value = 'Initialization timeout'
    isInitializing.value = false
    emit('ready')
  }, 8000) // 8 second timeout

  if (!mapElement.value) {
    console.error('MapEdit: Map element not found')
    // Wait a bit and try again, or emit ready if we can't proceed
    setTimeout(() => {
      if (!mapElement.value) {
        console.error('MapEdit: Map element still not found after timeout')
        clearTimeout(initializationTimeout.value)
        isLoading.value = false
        error.value = 'Map element not found'
        emit('error', { message: 'Map element not found' })
      } else {
        initializeMap()
      }
    }, 100)
    return
  }

  try {
    // For existing plots, use the plot's location data
    let location = null

    if (props.existingPlot && props.existingPlot.location) {
      location = props.existingPlot.location
    } else if (props.location && props.location.latitude && props.location.longitude) {
      location = props.location
    } else {
      location = { longitude: -6.2389, latitude: 55.2044 } // Default to Ballycastle
    }

    if (!location) {
      // Instead of emitting error, create a default map centered on a known location
      location = { longitude: -6.2389, latitude: 55.2044 } // Default to Ballycastle
    }


    // Create tile source with fallback
    const tileSource = await createBestTileSource(locationsStore.selectedLocation, 'MapEdit')

    // Create view with zoom enforcement
    const view = await createMapView({
      center: [location.longitude, location.latitude],
      zoom: effectiveZoom.value,
      maxZoom: effectiveMaxZoom.value,
      minZoom: effectiveMinZoom.value,
      viewName: 'MapEdit',
      isLatLng: true,
      extent: props.extent,
      restrictExtent: props.restrictExtent
    })

    map.value = new Map({
      target: mapElement.value,
      layers: [
        tileSource
      ],
      view: view,
      controls: [
        new Zoom({
          maxDelta: 1,
          duration: 250
        })
      ]
    })

    // Add plot to map based on mode
    if (props.isPhotoMode) {
      await addPhotoPlotToMap()
    } else if (props.existingPlot) {
      await addExistingPlotToMap()
    }

    // Clear the initialization timeout
    if (initializationTimeout.value) {
      clearTimeout(initializationTimeout.value)
      initializationTimeout.value = null
    }

    isLoading.value = false
    isInitializing.value = false

    // Initialize location tracking
    await initializeLocationTracking()

    // Add existing plots to the map
    await addExistingPlotsToMap()

    // Signal that the editor is ready
    emit('ready')

  } catch (error) {
    console.error('MapEdit: Error initializing map:', error)

    // Clear the initialization timeout
    if (initializationTimeout.value) {
      clearTimeout(initializationTimeout.value)
      initializationTimeout.value = null
    }

    isLoading.value = false
    error.value = error.message || 'Failed to initialize map'
    isInitializing.value = false
    // Emit error to parent component
    emit('error', { message: 'Failed to initialize map', error })
  }
}

// Initialize location tracking
const initializeLocationTracking = async () => {
  try {
    // Use the location prop passed from parent component
    if (props.location && props.location.latitude && props.location.longitude) {
      currentLocation.value = props.location
    } else {
      // Fallback to map store if no location prop
      if (mapStore.currentLocation) {
        currentLocation.value = mapStore.currentLocation
      } else {
        // Try to get current location
        const location = await mapStore.getCurrentLocation()
        if (location) {
          currentLocation.value = location
        }
      }
    }

    // Start tracking device orientation
    await startOrientationListener()
  } catch (error) {
    console.error('MapEdit: Error initializing location tracking:', error)
  }
}


const addPhotoPlotToMap = async () => {
  if (!map.value || !props.selectedPlotSize) {
    emit('error', { message: 'Missing map or selected plot size' })
    return
  }

  try {
    // Use the passed location prop instead of mapStore.currentLocation
    let location = null

    if (props.location && props.location.latitude && props.location.longitude) {
      location = props.location
    } else {
      location = { longitude: -6.2389, latitude: 55.2044 } // Default to Ballycastle
    }

    if (!location) {
      // Try to get location from map's current view center
      if (map.value) {
        const view = map.value.getView()
        const center = view.getCenter()
        if (center) {
          // Convert from map coordinates to lat/lng
          const [lon, lat] = toLonLat(center)
          const mapCenterLocation = { longitude: lon, latitude: lat }
          await createPolygonWithLocation(mapCenterLocation)
          return
        }
      }
      // Use fallback location if current location is not available
      const fallbackLocation = { longitude: -6.2389, latitude: 55.2044 }
      await createPolygonWithLocation(fallbackLocation)
      return
    }

    await createPolygonWithLocation(location)

  } catch (error) {
    console.error('MapEdit: Error adding photo plot to map:', error)
    // Emit error to parent component
    emit('error', { message: 'Failed to add photo plot to map', error })
  }
}

const createPolygonWithLocation = async (location) => {
  // Get plot size from selectedPlotSize or use defaults
  const plotSize = props.selectedPlotSize || { width: 8, height: 4 }
  const widthFeet = plotSize.width  // Long side (head to foot) - should go in direction you're facing
  const heightFeet = plotSize.height // Short side (left to right) - should go perpendicular to direction

  // Convert feet to meters
  const widthMeters = widthFeet * 0.3048
  const heightMeters = heightFeet * 0.3048

  // Create a simple rectangle centered on current location
  const center = fromLonLat([location.longitude, location.latitude])

  // Get the center point in lat/lng for distance calculations
  const [centerLon, centerLat] = toLonLat(center)

  // Calculate the offset in degrees that represents our desired distance
  // For small distances, we can approximate using the Earth's radius
  const earthRadius = 6371000 // Earth's radius in meters

  // Calculate offsets for a rectangle aligned with North-South/East-West axes
  // For plots: long side (width) goes North-South, short side (height) goes East-West
  const halfLongSideDegrees = (widthMeters / 2) / earthRadius * (180 / Math.PI)  // North-South (latitude)
  const halfShortSideDegrees = (heightMeters / 2) / earthRadius * (180 / Math.PI) // East-West (longitude)

  // Adjust longitude offset for latitude (longitude lines get closer at higher latitudes)
  const halfShortSideLonDegrees = halfShortSideDegrees / Math.cos(centerLat * Math.PI / 180)

  // Store the original direction
  const originalDirection = userDirection.value !== null ? userDirection.value : 0

  // Convert device orientation to OpenLayers rotation
  // Device orientation: 0° = North, 90° = East (clockwise)
  // Our rectangle is created as North-South by default
  // To point it in the device direction, we need to rotate it
  // Formula: rotation = -device_angle + 180
  const openlayersDirection = (360 - originalDirection + 180) % 360
  const directionRad = (openlayersDirection * Math.PI) / 180

  // Also need the original direction in radians for shift calculations
  const originalDirectionRad = (originalDirection * Math.PI) / 180

  // Create a rectangle where the user is positioned at the FOOT of the grave
  // First create a rectangle centered on the user location
  const north = centerLat + halfLongSideDegrees
  const south = centerLat - halfLongSideDegrees
  const east = centerLon + halfShortSideLonDegrees
  const west = centerLon - halfShortSideLonDegrees

  // Create the four corner points of the unrotated rectangle
  const corners = [
    [west, north],   // Top-left
    [east, north],   // Top-right
    [east, south],    // Bottom-right
    [west, south],   // Bottom-left
    [west, north]     // Close the polygon
  ]

  // If there's a rotation, apply it to each corner
  let rotatedCorners = corners
  if (originalDirection !== 0) {
    // Convert corners to map coordinates and apply rotation
    rotatedCorners = corners.map(([lon, lat]) => {
      // Convert to map coordinates
      const [x, y] = fromLonLat([lon, lat])

      // Translate to origin (center point)
      const [centerX, centerY] = center
      const translatedX = x - centerX
      const translatedY = y - centerY

      // Apply rotation
      const rotatedX = translatedX * Math.cos(directionRad) - translatedY * Math.sin(directionRad)
      const rotatedY = translatedX * Math.sin(directionRad) + translatedY * Math.cos(directionRad)

      // Translate back
      const finalX = rotatedX + centerX
      const finalY = rotatedY + centerY

      return [finalX, finalY]
    })
  } else {
    // Convert lat/lng corners to map coordinates when no rotation
    rotatedCorners = corners.map(([lon, lat]) => fromLonLat([lon, lat]))
  }

  // Shift the rectangle so the user is positioned at the FOOT of the grave
  // The foot is the edge closest to the user's facing direction
  // Calculate the shift needed to position user at foot
  // User should be at the center of the foot edge (short side)
  const shiftDistance = halfLongSideDegrees  // Distance from center to foot edge

  // Calculate shift components based on ORIGINAL user direction (not corrected)
  // We want to move the polygon away from the user in the direction they're facing
  const shiftLat = shiftDistance * Math.cos(originalDirectionRad)  // North-South shift
  const shiftLon = shiftDistance * Math.sin(originalDirectionRad) / Math.cos(centerLat * Math.PI / 180)  // East-West shift (adjusted for latitude)

  // Apply shift to all corners
  const shiftedCorners = rotatedCorners.map(([x, y]) => {
    // Convert back to lat/lng for shifting
    const [lon, lat] = toLonLat([x, y])

    // Apply shift - ADD to move the polygon away from the user in their facing direction
    const shiftedLat = lat + shiftLat
    const shiftedLon = lon + shiftLon

    // Convert back to map coordinates
    return fromLonLat([shiftedLon, shiftedLat])
  })

  // Create polygon coordinates
  const coordinates = shiftedCorners

  const polygonFeature = new Feature({
    geometry: new Polygon([coordinates])
  })

  const style = new Style({
    fill: new Fill({
      color: 'rgba(59, 130, 246, 0.3)'
    }),
    stroke: new Stroke({
      color: '#3b82f6',
      width: 2
    })
  })

  polygonFeature.setStyle(style)

  const vectorLayer = new VectorLayer({
    source: new VectorSource({
      features: [polygonFeature]
    })
  })

  // Add a name to the layer for debugging
  vectorLayer.set('name', 'editing-polygon')

  map.value.addLayer(vectorLayer)
  currentEditingFeature.value = polygonFeature

  // Fit the map view to show the polygon with appropriate padding
  const extent = polygonFeature.getGeometry().getExtent()
  map.value.getView().fit(extent, {
    padding: [20, 20, 20, 20],
    maxZoom: props.maxZoom
  })

  // In photo mode, add editing interactions for positioning
  if (props.isPhotoMode) {
    // In photo mode, we still want to allow editing for positioning the plot
    try {
      await addEditingInteractions(polygonFeature)
    } catch (error) {
      console.error('MapEdit: Error in addEditingInteractions:', error)
    }
  }
}

const addExistingPlotToMap = async () => {
  if (!map.value || !props.existingPlot) {
    console.error('MapEdit: Missing map or existingPlot:', {
      hasMap: !!map.value,
      hasExistingPlot: !!props.existingPlot
    })
    emit('error', { message: 'Missing map or existing plot data' })
    return
  }

  try {

    // Parse existing plot geometry
    const geometry = JSON.parse(props.existingPlot.geometry)
    const coordinates = geometry.coordinates[0]

    // Check if coordinates are in lat/lng format (small numbers) or map projection format (large numbers)
    // Lat/lng coordinates are typically between -180 to 180 for longitude and -90 to 90 for latitude
    // Map projection coordinates are typically very large numbers (millions)
    const isLatLngFormat = coordinates.some(coord =>
      Math.abs(coord[0]) <= 180 && Math.abs(coord[1]) <= 90
    )

    let mapCoordinates
    if (isLatLngFormat) {
      // Convert from lat/lng to map coordinates
      mapCoordinates = coordinates.map(coord => fromLonLat(coord))
    } else {
      // Coordinates are already in map projection format
      mapCoordinates = coordinates
    }

    const polygonFeature = new Feature({
      geometry: new Polygon([mapCoordinates]),
      plot: props.existingPlot
    })

    const style = new Style({
      fill: new Fill({
        color: 'rgba(59, 130, 246, 0.3)'
      }),
      stroke: new Stroke({
        color: '#3b82f6',
        width: 2
      })
    })

    polygonFeature.setStyle(style)

    const vectorLayer = new VectorLayer({
      source: new VectorSource({
        features: [polygonFeature]
      })
    })

    map.value.addLayer(vectorLayer)
    currentEditingFeature.value = polygonFeature

    // Center map on the plot (only if we didn't already center on plot location)
    if (!props.existingPlot?.location) {
      const extent = polygonFeature.getGeometry().getExtent()
      map.value.getView().fit(extent, {
        padding: [20, 20, 20, 20],
        maxZoom: props.maxZoom
      })
    }

    // Add editing interactions
    await addEditingInteractions(polygonFeature)

  } catch (error) {
    console.error('MapEdit: Error adding existing plot to map:', error)
    emit('error', { message: 'Failed to add existing plot to map', error })
  }
}

const addEditingInteractions = async (polygonFeature) => {
  try {
    // Try to import ol-ext Transform for advanced editing
    let Transform
    try {
      Transform = (await import('ol-ext/interaction/Transform')).default
    } catch (e) {
      // Fallback to basic modify interaction (position only, no resizing)
      const modifyInteraction = new Modify({
        features: new Collection([polygonFeature])
      })

      map.value.addInteraction(modifyInteraction)
      return
    }

    // Use ol-ext Transform for advanced editing (position and rotation only, no resizing)
    try {

      // Create a collection containing the polygon feature
      const featureCollection = new Collection([polygonFeature])

      // Create select interaction (without pre-populating features for manual selection)
      const selectInteraction = new Select({
        // Don't pre-populate features to allow manual clicking
      })

      // Create transform interaction with rotation enabled but scaling disabled
      const transformInteraction = new Transform({
        features: selectInteraction.getFeatures(), // Use select interaction's features collection
        enableRotation: true,
        scale: props.allowCustomSizing, // Allow scaling only if custom sizing is enabled
        rotate: true,
        translate: true,
        stretch: props.allowCustomSizing // Allow stretching only if custom sizing is enabled
      })

      // Add both interactions to the map
      map.value.addInteraction(selectInteraction)
      map.value.addInteraction(transformInteraction)

      // In photo mode, automatically select the polygon so it's immediately editable
      if (props.isPhotoMode) {
        // Direct approach: add the polygon to the select collection
        setTimeout(() => {
          try {
            // Add our polygon to the select collection
            selectInteraction.getFeatures().push(polygonFeature)
          } catch (error) {
            console.error('MapEdit: Error in automatic selection:', error)
          }
        }, 300) // Increased timeout to ensure everything is ready
      }
    } catch (transformError) {
      console.error('MapEdit: Failed to setup Transform interactions:', transformError)
    }

  } catch (error) {
    console.error('MapEdit: Error adding editing interactions:', error)
    // Emit error to parent component
    emit('error', { message: 'Failed to add editing interactions', error })
  }
}


const closeEditor = () => {
  emit('close')
}

const retryInitialization = () => {
  error.value = null
  initializeMap().catch(error => {
    console.error('MapEdit: Failed to initialize map after retry:', error)
    emit('error', { message: 'Failed to initialize map after retry', error })
  })
}


// Add existing plots to the map
const addExistingPlotsToMap = async () => {
  if (!map.value || !props.existingPlots || props.existingPlots.length === 0) {
    return
  }

  try {
    // Remove existing layer if it exists
    const layers = map.value.getLayers()
    let existingLayer = null
    layers.forEach((layer) => {
      if (layer.get('name') === 'existing-plots') {
        existingLayer = layer
      }
    })
    if (existingLayer) {
      map.value.removeLayer(existingLayer)
    }


    // Create features for all existing plots
    const features = []

    for (const plot of props.existingPlots) {
      if (!plot.geometry) {
        console.warn('MapEdit: Plot missing geometry:', plot.id)
        continue
      }

      try {
        // Parse geometry
        const geometry = JSON.parse(plot.geometry)
        const coordinates = geometry.coordinates[0]

        // Check if coordinates are in lat/lng format or map projection format
        const isLatLngFormat = coordinates.some((coord) =>
          Math.abs(coord[0]) <= 180 && Math.abs(coord[1]) <= 90
        )

        // Convert coordinates to map projection
        const mapCoordinates = isLatLngFormat
          ? coordinates.map((coord) => fromLonLat(coord))
          : coordinates

        // Create polygon feature
        const polygonFeature = new Feature({
          geometry: new Polygon([mapCoordinates]),
          plot: plot
        })

        // Create style for existing plots (different from editing plot)
        const existingPlotStyle = new Style({
          fill: new Fill({
            color: 'rgba(34, 197, 94, 0.3)' // Green with transparency
          }),
          stroke: new Stroke({
            color: '#22c55e', // Green border
            width: 2
          })
        })

        polygonFeature.setStyle(existingPlotStyle)
        features.push(polygonFeature)
      } catch (error) {
        console.error('MapEdit: Error processing plot geometry:', plot.id, error)
      }
    }

    if (features.length > 0) {
      // Create vector layer for existing plots
      const existingPlotsLayer = new VectorLayer({
        source: new VectorSource({
          features: features
        }),
        zIndex: 500 // Lower than editing plot but above base map
      })

      // Add name to identify this layer
      existingPlotsLayer.set('name', 'existing-plots')

      // Add layer to map
      map.value.addLayer(existingPlotsLayer)
    }

  } catch (error) {
    console.error('MapEdit: Error adding existing plots to map:', error)
  }
}

// Watch for changes in existing plots
watch(() => props.existingPlots, (newPlots) => {
  if (map.value && newPlots && newPlots.length > 0) {
    addExistingPlotsToMap()
  }
}, { deep: true })

// Lifecycle
onMounted(() => {
  if (props.isVisible) {
    nextTick(() => {
      initializeMap().catch(error => {
        console.error('MapEdit: Failed to initialize map in lifecycle:', error)
        emit('error', { message: 'Failed to initialize map', error })
      })
    })
  }
})

// Watch for visibility changes
watch(() => props.isVisible, (isVisible) => {
  if (isVisible && !map.value && !isInitializing.value) {
    nextTick(() => {
      initializeMap().catch(error => {
        console.error('MapEdit: Failed to initialize map after visibility change:', error)
        emit('error', { message: 'Failed to initialize map', error })
      })
    })
  } else if (isVisible && map.value) {
    // If map already exists, ensure it has the correct zoom settings
    const view = map.value.getView()
    if (props.maxZoom !== undefined) view.setMaxZoom(props.maxZoom)
    if (props.minZoom !== undefined) view.setMinZoom(props.minZoom)
    if (props.zoom !== undefined) view.setZoom(props.zoom)
  }
}, { immediate: true })

// Watch for userDirection prop changes
watch(() => props.userDirection, (newDirection) => {
  if (newDirection !== undefined && newDirection !== null) {
    userDirection.value = newDirection
  }
})

// Watch for local userDirection changes and update polygon geometry
watch(userDirection, async (newDirection, oldDirection) => {
  // Only update if we're in photo mode and have an editing feature
  if (props.isPhotoMode && currentEditingFeature.value && map.value && currentLocation.value) {

    try {
      // Get plot size
      const plotSize = props.selectedPlotSize || { width: 8, height: 4 }
      const widthFeet = plotSize.width
      const heightFeet = plotSize.height
      const widthMeters = widthFeet * 0.3048
      const heightMeters = heightFeet * 0.3048

      // Get the user's location (foot of the grave)
      const userLocationPoint = fromLonLat([currentLocation.value.longitude, currentLocation.value.latitude])

      // Calculate dimensions
      const earthRadius = 6371000
      const halfShortSideDegrees = (heightMeters / 2) / earthRadius * (180 / Math.PI)  // Short side (width) - perpendicular
      const halfLongSideDegrees = (widthMeters / 2) / earthRadius * (180 / Math.PI)    // Long side (length) - in facing direction

      // Get the user location in lat/lng
      const [userLon, userLat] = toLonLat(userLocationPoint)

      // Adjust longitude offset for latitude (longitude lines get closer at higher latitudes)
      const halfShortSideLonDegrees = halfShortSideDegrees / Math.cos(userLat * Math.PI / 180)

      // Calculate the center of the polygon (half the long side away from the user in their facing direction)
      const originalDirection = newDirection !== null ? newDirection : 0
      const originalDirectionRad = (originalDirection * Math.PI) / 180
      const shiftToCenter = halfLongSideDegrees

      // Calculate shift components to move from foot to center
      const shiftToCenterLat = shiftToCenter * Math.cos(originalDirectionRad)
      const shiftToCenterLon = shiftToCenter * Math.sin(originalDirectionRad) / Math.cos(userLat * Math.PI / 180)

      // Center location is at the midpoint of the grave
      const centerLat = userLat + shiftToCenterLat
      const centerLon = userLon + shiftToCenterLon

      // Create corners relative to the center point
      const north = centerLat + halfLongSideDegrees
      const south = centerLat - halfLongSideDegrees
      const east = centerLon + halfShortSideLonDegrees
      const west = centerLon - halfShortSideLonDegrees

      const corners = [
        [west, north], [east, north], [east, south], [west, south], [west, north]
      ]

      // Apply rotation
      // Device orientation: 0° = North, 90° = East (clockwise)
      // Our rectangle is created as North-South by default
      // To point it in the device direction, we need to rotate it
      // Device North (0°) → rectangle already points North → rotate 0° (but we need +90° for map coordinates)
      // Device East (90°) → need rectangle to point East → rotate +90° from North = +90° for map
      // Formula: rotation = -device_angle + 90 + 90 = -device_angle + 180
      const openlayersDirection = (360 - originalDirection + 180) % 360
      const directionRad = (openlayersDirection * Math.PI) / 180


      let rotatedCorners
      const centerMapCoords = fromLonLat([centerLon, centerLat])

      if (originalDirection !== 0) {
        rotatedCorners = corners.map(([lon, lat]) => {
          const [x, y] = fromLonLat([lon, lat])
          const [centerX, centerY] = centerMapCoords
          const translatedX = x - centerX
          const translatedY = y - centerY
          const rotatedX = translatedX * Math.cos(directionRad) - translatedY * Math.sin(directionRad)
          const rotatedY = translatedX * Math.sin(directionRad) + translatedY * Math.cos(directionRad)
          return [rotatedX + centerX, rotatedY + centerY]
        })
      } else {
        rotatedCorners = corners.map(([lon, lat]) => fromLonLat([lon, lat]))
      }

      const finalCorners = rotatedCorners

      // Update the existing feature's geometry
      const newGeometry = new Polygon([finalCorners])
      currentEditingFeature.value.setGeometry(newGeometry)
    } catch (error) {
      console.error('MapEdit: Error updating polygon geometry:', error)
    }
  }
}, { immediate: false })

// Watch for location prop changes
watch(() => props.location, async (newLocation, oldLocation) => {
  // Update currentLocation ref so LocationIndicator moves
  if (newLocation && newLocation.latitude && newLocation.longitude) {
    currentLocation.value = newLocation
  }

  // If we're in photo mode and have a map, redraw the polygon with the new location
  if (props.isPhotoMode && map.value && currentEditingFeature.value && newLocation) {

    try {
      // Remove the current polygon
      const layers = map.value.getLayers()
      const vectorLayers = layers.getArray().filter(layer =>
        layer.getSource && layer.getSource().getFeatures &&
        layer.getSource().getFeatures().some(f => f === currentEditingFeature.value)
      )

      vectorLayers.forEach(layer => {
        map.value.removeLayer(layer)
      })

      // Redraw the polygon with new location
      await createPolygonWithLocation(newLocation)
    } catch (error) {
      console.error('❌ MapEdit: Error redrawing polygon with new location:', error)
    }
  }
}, { immediate: false })

// Watch for selectedPlotSize changes to redraw polygon when size changes
watch(() => props.selectedPlotSize, async (newPlotData, oldPlotData) => {
  if (newPlotData &&
    (!oldPlotData || newPlotData.width !== oldPlotData.width || newPlotData.height !== oldPlotData.height)) {

    // Only redraw if we're in photo mode and have a map
    if (props.isPhotoMode && map.value && currentEditingFeature.value) {
      try {
        // Remove the current polygon
        const layers = map.value.getLayers()
        const vectorLayers = layers.getArray().filter(layer =>
          layer.getSource && layer.getSource().getFeatures &&
          layer.getSource().getFeatures().some(f => f === currentEditingFeature.value)
        )

        vectorLayers.forEach(layer => {
          map.value.removeLayer(layer)
        })

        // Get current location from the existing feature or map center
        let location
        if (props.location) {
          location = props.location
        } else {
          // Get location from map center
          const view = map.value.getView()
          const center = view.getCenter()
          const [lon, lat] = toLonLat(center)
          location = { longitude: lon, latitude: lat }
        }

          // Redraw the polygon with new size
        await createPolygonWithLocation(location)

      } catch (error) {
        console.error('❌ MapEdit: Error redrawing polygon:', error)
      }
    }
  }
}, { immediate: false })

// Watch for zoom prop changes and settings store changes
watch([effectiveMaxZoom, effectiveMinZoom, effectiveZoom], (newValues, oldValues) => {
  // If map exists, update the view with new zoom settings
  if (map.value) {
    const view = map.value.getView()
    if (newValues[0] !== undefined) view.setMaxZoom(newValues[0])
    if (newValues[1] !== undefined) view.setMinZoom(newValues[1])
    if (newValues[2] !== undefined) view.setZoom(newValues[2])
  }
}, { immediate: true })

onUnmounted(() => {
  // Clear orientation listener
  stopOrientationListener()

  // Clear initialization timeout
  if (initializationTimeout.value) {
    clearTimeout(initializationTimeout.value)
    initializationTimeout.value = null
  }

  // Clean up map
  if (map.value) {
    try {
      map.value.setTarget(undefined)
      map.value = null
    } catch (error) {
      console.error('MapEdit: Error during map cleanup:', error)
    }
  }
})

// Expose method to get current geometry and feature data
const getCurrentPlotData = () => {
  if (currentEditingFeature.value) {
    const geometry = currentEditingFeature.value.getGeometry()
    const coordinates = geometry.getCoordinates()[0]

    return {
      geometry: coordinates,
      feature: currentEditingFeature.value,
      location: currentLocation.value,
      direction: userDirection.value
    }
  }
  return null
}

defineExpose({
  getCurrentPlotData
})
</script>