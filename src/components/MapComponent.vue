<template>
  <div class="map-component relative w-full h-full">
    <div ref="mapElement" class="w-full h-full"></div>

    <!-- Location Indicator -->
    <LocationIndicator 
      v-if="map && showLocationIndicator"
      :map="map"
      :location="currentLocation"
      :direction="userDirection"
      :accuracy="currentLocation?.accuracy"
      :show-accuracy-circle="true"
      :show-direction="true"
      :show-indicator="showLocationIndicator"
    />

    <!-- Context Menu -->
    <div v-if="contextMenuVisible && contextMenuItems.length > 0" class="fixed inset-0 z-20" @click="hideContextMenu" @touchstart="hideContextMenu">
      <div 
        :style="{ left: `${contextMenuPosition.x}px`, top: `${contextMenuPosition.y}px` }"
        class="absolute bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-30 min-w-[200px]"
        @touchstart.stop
        @touchend.stop
        @click.stop>
        <button v-for="item in contextMenuItems" :key="item.action" 
          @click="handleContextMenuAction(item.action)"
          @touchstart="handleContextMenuAction(item.action)"
          class="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-100 active:bg-gray-200 flex items-center touch-manipulation select-none">
          <svg v-if="item.icon" class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="item.icon" />
          </svg>
          {{ item.label }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { createBestTileSource } from '../utils/tileSource'
import { createMapView } from '../utils/mapView'
import { useLocationsStore } from '../stores/locations'
import { useMapStore } from '../stores/map'
import LocationIndicator from './LocationIndicator.vue'
import { useToastService } from '../utils/toastService'
import { isLocationWithinBounds } from '../utils/locationUtils'
import { mapComponentLogger } from '../utils/logger'
import { useDeviceOrientation } from '../composables/useDeviceOrientation'

import { fromLonLat, toLonLat } from 'ol/proj'
import Map from 'ol/Map'
import Control from 'ol/control/Control'
import Zoom from 'ol/control/Zoom'
import ScaleLine from 'ol/control/ScaleLine'
import Attribution from 'ol/control/Attribution'

const props = defineProps({
  // Map configuration
  center: {
    type: Array,
    default: () => [-6.238, 55.204] // Default to Ballycastle
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
  viewName: {
    type: String,
    default: 'MapComponent'
  },
  isLatLng: {
    type: Boolean,
    default: true
  },
  // Extent constraints
  extent: {
    type: Array,
    default: null // [minX, minY, maxX, maxY] in same coordinate system as center
  },
  restrictExtent: {
    type: Boolean,
    default: true
  },
  // Controls configuration
  showFullScreen: {
    type: Boolean,
    default: true
  },
  showZoom: {
    type: Boolean,
    default: true
  },
  showScaleLine: {
    type: Boolean,
    default: true
  },
  showAttribution: {
    type: Boolean,
    default: true
  },
  showLocationIndicator: {
    type: Boolean,
    default: true
  },
  // Tile source configuration
  tileSourceName: {
    type: String,
    default: 'MapComponent'
  },
  // Context menu configuration
  showContextMenu: {
    type: Boolean,
    default: false
  },
  contextMenuItems: {
    type: Array,
    default: () => []
  },
  // Disable event handlers to prevent interference with OpenLayers interactions
  disableEventHandlers: {
    type: Boolean,
    default: false
  },
  // Location data for PMTiles support
  location: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['map-created', 'map-ready', 'error', 'contextmenu', 'click', 'touchstart', 'touchend', 'touchmove', 'context-menu-action'])

const mapElement = ref(null)
const map = ref(null)
const isLoading = ref(false)
const error = ref(null)

// Locations store for PMTiles support
const locationsStore = useLocationsStore()
const mapStore = useMapStore()

// Toast service
const { showError, showInfo, showWarning } = useToastService()

// Location tracking state
// Watch mapStore.currentLocation and update local ref for LocationIndicator
const currentLocation = computed(() => mapStore.currentLocation)

// Use device orientation composable
const { userDirection, startOrientationListener, stopOrientationListener } = useDeviceOrientation()

// Track if we've already shown the bounds warning to avoid duplicates
const hasShownBoundsWarning = ref(false)

// Helper function to show bounds warning only once per session
const showBoundsWarningOnce = (message) => {
  if (!hasShownBoundsWarning.value) {
    showWarning(message)
    hasShownBoundsWarning.value = true
  }
}

// Helper function to reset bounds warning flag (for when user clicks location button)
const resetBoundsWarning = () => {
  hasShownBoundsWarning.value = false
}


// Context menu state
const contextMenuVisible = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const contextMenuLocation = ref(null)

// Create map instance
const createMap = async () => {
  isLoading.value = true
  error.value = null
  
  try {
    if (!mapElement.value) {
      mapComponentLogger.error('Map element not found')
      throw new Error('Map element not found')
    }

    // Additional validation to ensure the element is properly mounted
    if (!mapElement.value.addEventListener) {
      console.error('MapComponent: Map element is not a proper DOM element')
      throw new Error('Map element is not a proper DOM element')
    }

    // Find available PMTiles location function
    const findSelectedLocation = async () => {
      try {
        // Only load locations if not already loaded
        if (locationsStore.locations.length === 0) {
          await locationsStore.loadLocations()
        }

        const location = locationsStore.selectedLocation

        if (!location) {
          return null
        }

        return {
          id: location.id,
          name: location.name,
          bbox: location.bbox,
          minZoom: location.minZoom,
          maxZoom: location.maxZoom,
          pmtilesUrl: location.pmtilesUrl
        }
      } catch (error) {
        console.error('Error finding available PMTiles location:', error)
        return null
      }
    }

    // Create tile source using shared utility
    let tileSource

    // Check if we have location data with PMTiles support
    if (locationsStore.selectedLocation && locationsStore.selectedLocation.pmtilesUrl) {
      // Use the best available tile source (PMTiles if cached/available, fallback to others)
      tileSource = await createBestTileSource(locationsStore.selectedLocation, props.viewName)
    } else {
      // Check if we should use PMTiles even without explicit location prop
      const pmtilesLocation = await findSelectedLocation()
      tileSource = await createBestTileSource(pmtilesLocation, props.viewName)
    }

    // Create view using shared utility
    const view = await createMapView({
      center: props.center,
      zoom: props.zoom,
      maxZoom: props.maxZoom,
      minZoom: props.minZoom,
      viewName: props.viewName,
      isLatLng: props.isLatLng,
      extent: props.extent,
      restrictExtent: props.restrictExtent
    })

    // Build controls array based on props
    const controls = []
    // Removed FullScreen control - replaced with custom ZoomToExtent control
    if (props.showZoom) controls.push(new Zoom())
    if (props.showScaleLine) {
      controls.push(new ScaleLine({
        units: 'metric',
        bar: false,
        backgroundColor: 'transparent',
        text: false,
        minWidth: 200,
        maxWidth: 300
      }))
    }
    if (props.showAttribution) {
      controls.push(new Attribution({
        collapsible: false
      }))
    }

    // Add custom ZoomToExtent control for current location
    const ZoomToExtentControl = class extends Control {
      constructor() {
        const element = document.createElement('div')
        element.className = 'ol-zoom-extent ol-unselectable ol-control'
        element.style.cssText = `
          position: absolute;
          top: 0.5em;
          right: 0.5em;
          left: unset;
          background: rgba(255, 255, 255, 0.8);
          border-radius: 4px;
          padding: 2px;
        `

        const button = document.createElement('button')
        button.type = 'button'
        button.title = 'Zoom to current location'
        button.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
            <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
        `
        button.style.cssText = `
          width: 40px;
          height: 40px;
          border: none;
          background: transparent;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        `

        button.addEventListener('click', () => {
          this.zoomToCurrentLocation()
        })

        element.appendChild(button)

        super({
          element: element
        })
      }

      async zoomToCurrentLocation() {
        // Reset the warning flag so user can see the warning again if they click the button
        resetBoundsWarning()
        
        if (props.location && props.location.latitude && props.location.longitude) {
          // Check bounds before zooming
          if (props.extent && props.restrictExtent) {
            if (!isLocationWithinBounds(props.location, props.extent)) {
              showBoundsWarningOnce('Your current location is outside the allowed map area.')
            }
          }
          
          const center = fromLonLat([props.location.longitude, props.location.latitude])
          map.value.getView().animate({
            center: center,
            duration: 1000
          })
        }
      }
    }

    controls.push(new ZoomToExtentControl())

    // Create map instance
    map.value = new Map({
      target: mapElement.value,
      layers: [
        tileSource
      ],
      view: view,
      controls: controls
    })

    // Add zoom info display
    // const zoomInfoElement = document.createElement('div')
    // zoomInfoElement.id = 'zoom-info'
    // zoomInfoElement.style.cssText = `
    //   position: absolute;
    //   top: 10px;
    //   right: 10px;
    //   background: rgba(255, 255, 255, 0.9);
    //   padding: 10px;
    //   border-radius: 5px;
    //   font-family: monospace;
    //   font-size: 12px;
    //   z-index: 1000;
    //   border: 1px solid #ccc;
    //   box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    // `
    // mapElement.value.appendChild(zoomInfoElement)

    // Function to update zoom info display
    const updateZoomInfo = () => {
      const view = map.value?.getView()
      if (view) {
        const currentZoom = view.getZoom()
        const maxZoom = view.getMaxZoom()
        const minZoom = view.getMinZoom()
        const tileSourceSize = 0

        zoomInfoElement.innerHTML = `
          <div><strong>Zoom Info</strong></div>
          <div>Current: ${currentZoom?.toFixed(2) || 'N/A'}</div>
          <div>View Min: ${minZoom || 'N/A'}</div>
          <div>View Max: ${maxZoom || 'N/A'}</div>
          <div>Props Min: ${props.minZoom}</div>
          <div>Props Max: ${props.maxZoom}</div>
          <div>PMTiles: ${tileSourceSize}</div>
          <div>Source: ${tileSourceSize}</div>
        `
      }
    }

    // Update zoom info initially and on zoom changes
    // updateZoomInfo()
    // map.value.getView().on('change:resolution', updateZoomInfo)
    // map.value.getView().on('change:center', updateZoomInfo)

    // Debug PMTiles source constraints
    setTimeout(() => {
      const layers = map.value?.getLayers()
      if (layers && layers.getLength() > 0) {
        const source = layers.item(0).getSource()

        // Try to force higher zoom limits
        if (source && source.setMaxZoom) {
          source.setMaxZoom(23)
        }

        // Also try to set view zoom limits
        const view = map.value.getView()
        view.setMaxZoom(23)

        // Update display
        //updateZoomInfo()
      }
    }, 1000)

    // Add right-click event listener directly to the map
    // Add click event listener to close context menu when clicking elsewhere
    map.value.on('click', async (event) => {
      // Only close context menu if clicking on the map itself, not on the context menu
      if (contextMenuVisible.value) {
        // Check if this is a touch event that triggered a long press
        const isTouchEvent = event.originalEvent && event.originalEvent.type === 'touchend'
        
        if (!isTouchEvent) {
          // Add a small delay to allow context menu clicks to register first
          setTimeout(() => {
            hideContextMenu()
          }, 100)
        }
      }
    })

    // Add touch event listeners for mobile long press
    let touchStartTime = 0
    let touchStartPosition = null
    let longPressTimer = null
    let longPressTriggered = false
    let touchMoved = false

    mapElement.value.addEventListener('touchstart', (event) => {
      if (!props.showContextMenu || props.disableEventHandlers) return
      
      touchStartTime = Date.now()
      touchStartPosition = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY
      }
      longPressTriggered = false
      touchMoved = false
      
      // Set up long press timer
      longPressTimer = setTimeout(async () => {
        try {
          // Only trigger if touch hasn't moved significantly
          if (!touchMoved) {
            longPressTriggered = true
            
            // Get coordinates from the touch position
            const pixel = map.value.getPixelFromCoordinate(map.value.getCoordinateFromPixel([touchStartPosition.x - mapElement.value.getBoundingClientRect().left, touchStartPosition.y - mapElement.value.getBoundingClientRect().top]))
            const [longitude, latitude] = toLonLat(pixel)
            const location = { longitude, latitude, accuracy: 5 }
            
            // Show context menu at touch position
            showContextMenuAt({
              clientX: touchStartPosition.x,
              clientY: touchStartPosition.y
            }, location)
          }
        } catch (error) {
          console.error('Error handling long press:', error)
        }
      }, 500) // 500ms long press
    }, { passive: true })

    mapElement.value.addEventListener('touchend', (event) => {
      // Only clear timer if long press hasn't been triggered yet
      if (longPressTimer && !longPressTriggered) {
        clearTimeout(longPressTimer)
        longPressTimer = null
      }
      
      // If long press was triggered, prevent the map click event from firing
      if (longPressTriggered) {
        event.preventDefault()
        event.stopPropagation()
      }
    }, { passive: false })

    mapElement.value.addEventListener('touchmove', (event) => {
      // Check if touch has moved significantly (more than 10px)
      if (touchStartPosition && longPressTimer) {
        const deltaX = Math.abs(event.touches[0].clientX - touchStartPosition.x)
        const deltaY = Math.abs(event.touches[0].clientY - touchStartPosition.y)
        
        if (deltaX > 10 || deltaY > 10) {
          touchMoved = true
          clearTimeout(longPressTimer)
          longPressTimer = null
        }
      }
    }, { passive: true })

    // Add right-click event listener for desktop
    map.value.on('contextmenu', async (event) => {
      // Prevent default browser context menu
      event.preventDefault()

      if (!props.showContextMenu || props.disableEventHandlers) {
        return
      }

      try {
        // Get the coordinate from the click event
        const coordinate = event.coordinate
        const [longitude, latitude] = toLonLat(coordinate)

        const location = { longitude, latitude, accuracy: 5 }

        // Convert OpenLayers event to DOM event for positioning
        const domEvent = event.originalEvent || event
        showContextMenuAt(domEvent, location)
      } catch (error) {
        console.error('Error handling right-click:', error)
      }
    })

    // Emit map created event
    emit('map-created', map.value)
    emit('map-ready', map.value)

    // Set loading to false first so map renders
    isLoading.value = false

    // Initialize location tracking (defer to not block initial render)
    setTimeout(async () => {
      await initializeLocationTracking()
      await autoCenterOnUserLocation()
    }, 0)

  } catch (err) {
    console.error(`${props.viewName}: Error creating map:`, err)
    error.value = err.message || 'Failed to create map'
    isLoading.value = false
    emit('error', { message: 'Failed to create map', error: err })
  }
}

// Initialize location tracking
const initializeLocationTracking = async () => {
  try {
    // Get current location from map store
    // currentLocation is now a computed property that automatically reflects mapStore.currentLocation
    if (!mapStore.currentLocation) {
      // Try to get current location if not already available
      await mapStore.getCurrentLocation()
    }
    
    // Check if location is within bounds
    if (currentLocation.value && props.extent && props.restrictExtent) {
      if (!isLocationWithinBounds(currentLocation.value, props.extent)) {
        showBoundsWarningOnce('Your current location is outside the allowed map area. The map will show the configured area instead.')
      }
    }
    
    if (!currentLocation.value) {
      if (props.extent && props.restrictExtent) {
        showInfo('Location not available. Showing configured map area.')
      }
    }

    // Set up device orientation tracking using Capacitor Motion
    await setupDeviceOrientationTracking()
  } catch (error) {
    console.error('MapComponent: Error initializing location tracking:', error)
    showError('Failed to initialize location tracking. Please check your location permissions.')
  }
}

// Auto-center on user's current location if within allowed extent
const autoCenterOnUserLocation = async () => {
  try {
    // Check if we have a current location
    if (!currentLocation.value || !currentLocation.value.latitude || !currentLocation.value.longitude) {
      return
    }

    // Check if location is within allowed extent
    if (props.extent && props.restrictExtent) {
      if (!isLocationWithinBounds(currentLocation.value, props.extent)) {
        return
      }
    }

    // Minimal delay to ensure map is initialized
    await new Promise(resolve => setTimeout(resolve, 100))

    // Convert location to map coordinates
    const center = fromLonLat([currentLocation.value.longitude, currentLocation.value.latitude])
    
    // Check if map is available
    if (!map.value) {
      return
    }
    
    // Check if user location is within extent in map coordinates
    if (props.extent && props.restrictExtent) {
      const [x, y] = center
      
      // Convert extent from lat/lng to map coordinates if needed
      let extentInMapCoords = props.extent
      if (props.isLatLng) {
        // Extent is in lat/lng, convert to map coordinates
        const [minLon, minLat, maxLon, maxLat] = props.extent
        const minMapCoords = fromLonLat([minLon, minLat])
        const maxMapCoords = fromLonLat([maxLon, maxLat])
        extentInMapCoords = [minMapCoords[0], minMapCoords[1], maxMapCoords[0], maxMapCoords[1]]
      }
      
      const [minX, minY, maxX, maxY] = extentInMapCoords
      const isWithinExtent = x >= minX && x <= maxX && y >= minY && y <= maxY
      
      if (!isWithinExtent) {
        return
      }
    }
    
    // Set center directly first, then animate
    map.value.getView().setCenter(center)
    
    // Then animate to ensure smooth transition
    map.value.getView().animate({
      center: center,
      duration: 1000,
      easing: (t) => t * (2 - t) // ease-out animation
    })
  } catch (error) {
    console.error('MapComponent: Error auto-centering on user location:', error)
  }
}

// Set up device orientation tracking using Capacitor Motion
const setupDeviceOrientationTracking = async () => {
  try {
    // Request permission for device motion on iOS 13+
    if (typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission) {
      try {
        const permission = await DeviceMotionEvent.requestPermission()
        if (permission === 'granted') {
          await startOrientationListener()
        } else {
          userDirection.value = 0 // Default to North
        }
      } catch (error) {
        console.error('MapComponent: Error requesting motion permission:', error)
        userDirection.value = 0 // Default to North
      }
    } else {
      // For Android and older iOS, try to start listener directly
      await startOrientationListener()
    }
  } catch (error) {
    console.error('MapComponent: Error setting up orientation tracking:', error)
    userDirection.value = 0 // Default to North
  }
}


// Watch for location changes and check bounds (only when user actively requests location)
watch(() => mapStore.currentLocation, (newLocation, oldLocation) => {
  // Only check bounds if this is a new location (not initial load)
  if (newLocation && oldLocation && props.extent && props.restrictExtent) {
    if (!isLocationWithinBounds(newLocation, props.extent)) {
      showBoundsWarningOnce('Your current location is outside the allowed map area.')
    }
  }
})

// Watch for prop changes that require map recreation
watch([() => props.center, () => props.zoom, () => props.maxZoom, () => props.minZoom, () => props.extent, () => props.restrictExtent],
  ([newCenter, newZoom, newMaxZoom, newMinZoom, newExtent, newRestrictExtent], [oldCenter, oldZoom, oldMaxZoom, oldMinZoom, oldExtent, oldRestrictExtent]) => {
    if (!map.value) return
    
    const view = map.value.getView()

    // Update center if changed (only check first two elements to avoid expensive stringify)
    const centerChanged = newCenter[0] !== oldCenter[0] || newCenter[1] !== oldCenter[1]
    if (centerChanged) {
      if (props.isLatLng) {
        view.setCenter(fromLonLat(newCenter))
      } else {
        view.setCenter(newCenter)
      }
    }

    // Update zoom if changed
    if (newZoom !== oldZoom) {
      view.setZoom(newZoom)
    }

    // Update zoom limits if changed
    if (newMaxZoom !== oldMaxZoom) {
      view.setMaxZoom(newMaxZoom)
    }
    if (newMinZoom !== oldMinZoom) {
      view.setMinZoom(newMinZoom)
    }

    // Update extent if changed (check each element individually)
    if (newRestrictExtent !== oldRestrictExtent || 
        newExtent && oldExtent && (
          newExtent[0] !== oldExtent[0] || 
          newExtent[1] !== oldExtent[1] || 
          newExtent[2] !== oldExtent[2] || 
          newExtent[3] !== oldExtent[3]
        ) || 
        !newExtent !== !oldExtent) {
      if (newExtent && newRestrictExtent) {
        let viewExtent = newExtent
        if (props.isLatLng) {
          viewExtent = fromLonLat(newExtent.slice(0, 2)).concat(fromLonLat(newExtent.slice(2, 4)))
        }
        view.setExtent(viewExtent)
      } else {
        view.setExtent(undefined)
      }
    }
  }
)

// Lifecycle
onMounted(async () => {
  await nextTick()
  createMap()
})

onUnmounted(() => {
  if (map.value) {
    map.value.setTarget(undefined)
    map.value = null
  }

  // Clean up orientation listener
  stopOrientationListener()

  // Clean up zoom info display
  const zoomInfoElement = document.getElementById('zoom-info')
  if (zoomInfoElement) {
    zoomInfoElement.remove()
  }
})

// Test function to try zooming beyond limits
const testHighZoom = () => {
  if (map.value) {
    const view = map.value.getView()
    view.animate({ zoom: 20, duration: 1000 })
  }
}

// Expose map instance
defineExpose({
  map,
  isLoading,
  error,
  createMap,
  testHighZoom,
  resetView: async () => {
    if (map.value) {
      const view = map.value.getView()
      if (props.isLatLng) {
        view.setCenter(fromLonLat(props.center))
      } else {
        view.setCenter(props.center)
      }
      view.setZoom(props.zoom)
    }
  },
  setViewToExtent: async (bbox, minZoom, maxZoom) => {
    if (map.value) {
      const view = map.value.getView()

      // Convert bbox from [minLon, minLat, maxLon, maxLat] to map coordinates
      const sw = fromLonLat([bbox[0], bbox[1]])
      const ne = fromLonLat([bbox[2], bbox[3]])
      const extent = [sw[0], sw[1], ne[0], ne[1]]

      // Fit the view to the extent with some padding
      view.fit(extent, {
        padding: [20, 20, 20, 20],
        duration: 1000
      })

      // Set zoom constraints
      view.setMinZoom(minZoom)
      view.setMaxZoom(maxZoom)

      // Set the current zoom to a reasonable level within the range
      const currentZoom = Math.max(minZoom, Math.min(maxZoom, view.getZoom() || 16))
      view.setZoom(currentZoom)
    }
  },
  // Expose orientation tracking methods for external control
  restartOrientationTracking: async () => {
    await setupDeviceOrientationTracking()
  },
  stopOrientationTracking: () => {
    stopOrientationListener()
  },
  getCurrentDirection: () => userDirection.value
})

// Context menu methods
const showContextMenuAt = (event, location) => {
  // Get click position relative to the map container
  const rect = mapElement.value.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  // Ensure menu stays within bounds
  const menuWidth = 200
  const menuHeight = 50
  const adjustedX = Math.min(x, rect.width - menuWidth - 10)
  const adjustedY = Math.min(y, rect.height - menuHeight - 10)

  contextMenuPosition.value = { x: adjustedX, y: adjustedY }
  contextMenuLocation.value = location
  contextMenuVisible.value = true
  
  // Add haptic feedback on mobile if available
  if (navigator.vibrate) {
    navigator.vibrate(50) // Short vibration
  }
}

const hideContextMenu = () => {
  contextMenuVisible.value = false
  contextMenuLocation.value = null
}

const handleContextMenuAction = (action) => {
  emit('context-menu-action', { action, location: contextMenuLocation.value })
  hideContextMenu()
}
</script>

<style scoped>
.map-component {
  width: 100%;
  height: 100%;
  min-height: 0;
  flex: 1;
  margin: 0;
  padding: 0;
}
</style>