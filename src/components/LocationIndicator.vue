<template>
  <!-- This component doesn't render anything visible - it manages OpenLayers features -->
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import Circle from 'ol/geom/Circle'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import Style from 'ol/style/Style'
import Fill from 'ol/style/Fill'
import Stroke from 'ol/style/Stroke'
import Icon from 'ol/style/Icon'

import { fromLonLat } from 'ol/proj'

const props = defineProps({
  map: {
    type: Object,
    required: true
  },
  location: {
    type: Object,
    default: null
  },
  direction: {
    type: Number,
    default: null
  },
  accuracy: {
    type: Number,
    default: null
  },
  showAccuracyCircle: {
    type: Boolean,
    default: true
  },
  showDirection: {
    type: Boolean,
    default: true
  },
  showIndicator: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['location-updated'])

// State for OpenLayers features
const locationFeature = ref(null)
const accuracyFeature = ref(null)
const directionFeature = ref(null)
const locationLayer = ref(null)
const accuracyLayer = ref(null)
const directionLayer = ref(null)

// Initialize the location indicator
const initializeLocationIndicator = async () => {
  if (!props.map || !props.showIndicator) return

  try {

    // Create location dot feature
    if (props.location) {
      const locationPoint = fromLonLat([props.location.longitude, props.location.latitude])

      locationFeature.value = new Feature({
        geometry: new Point(locationPoint),
        type: 'location'
      })

      // Style for location dot (blue circle) - smaller and less intrusive
      const locationStyle = new Style({
        image: new Icon({
          src: 'data:image/svg+xml;base64,' + btoa(`
            <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
              <circle cx="8" cy="8" r="5" fill="#3b82f6" fill-opacity="0.8" stroke="white" stroke-width="2"/>
            </svg>
          `),
          scale: 1,
          anchor: [0.5, 0.5]
        })
      })

      locationFeature.value.setStyle(locationStyle)

      // Create location layer
      locationLayer.value = new VectorLayer({
        source: new VectorSource({
          features: [locationFeature.value]
        }),
        zIndex: 1000
      })

      props.map.addLayer(locationLayer.value)
    }

    // Create accuracy circle feature
    if (props.showAccuracyCircle && props.accuracy && props.location) {
      const locationPoint = fromLonLat([props.location.longitude, props.location.latitude])

      // Convert accuracy from meters to map units (approximate)
      const accuracyInMapUnits = props.accuracy * 0.00001 // Rough conversion

      accuracyFeature.value = new Feature({
        geometry: new Circle(locationPoint, accuracyInMapUnits),
        type: 'accuracy'
      })

      // Style for accuracy circle (red border, transparent fill)
      const accuracyStyle = new Style({
        fill: new Fill({
          color: 'rgba(239, 68, 68, 0.1)'
        }),
        stroke: new Stroke({
          color: '#ef4444',
          width: 2
        })
      })

      accuracyFeature.value.setStyle(accuracyStyle)

      // Create accuracy layer
      accuracyLayer.value = new VectorLayer({
        source: new VectorSource({
          features: [accuracyFeature.value]
        }),
        zIndex: 999
      })

      props.map.addLayer(accuracyLayer.value)
    }

    // Create direction indicator feature
    if (props.showDirection && props.location) {

      const locationPoint = fromLonLat([props.location.longitude, props.location.latitude])

      // Use provided direction or default to North (0 degrees)
      const direction = props.direction !== null ? props.direction : 0

      // Device orientation API returns compass heading where:
      // 0° = North, 90° = East, 180° = South, 270° = West
      // No correction needed - the device direction is already correct
      const correctedDirection = direction

      // Calculate direction arrow position - use a larger distance for visibility
      const arrowDistance = 0.001 // Increased distance for better visibility
      const angleRad = (correctedDirection * Math.PI) / 180
      const arrowX = locationPoint[0] + Math.sin(angleRad) * arrowDistance
      const arrowY = locationPoint[1] + Math.cos(angleRad) * arrowDistance

      directionFeature.value = new Feature({
        geometry: new Point([arrowX, arrowY]),
        type: 'direction'
      })

      // Create a more prominent direction arrow using a circle with a line
      const directionStyle = new Style({
        image: new Icon({
          src: 'data:image/svg+xml;base64,' + btoa(`
            <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="9" fill="#3b82f6" fill-opacity="0.9" stroke="white" stroke-width="2"/>
              <line x1="12" y1="12" x2="12" y2="3" stroke="white" stroke-width="3" stroke-linecap="round"/>
            </svg>
          `),
          scale: 1,
          anchor: [0.5, 0.5],
          rotation: correctedDirection * Math.PI / 180
        })
      })

      directionFeature.value.setStyle(directionStyle)

      // Create direction layer
      directionLayer.value = new VectorLayer({
        source: new VectorSource({
          features: [directionFeature.value]
        }),
        zIndex: 1001
      })

      props.map.addLayer(directionLayer.value)
    }
  } catch (error) {
    console.error('Error initializing location indicator:', error)
  }
}

// Helper to update direction arrow rotation
const updateDirectionArrowRotation = () => {
  if (!directionFeature.value || !props.showDirection) return
  
  const direction = props.direction !== null ? props.direction : 0
  const correctedDirection = direction
  
  const directionStyle = new Style({
    image: new Icon({
      src: 'data:image/svg+xml;base64,' + btoa(`
        <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="9" fill="#3b82f6" fill-opacity="0.9" stroke="white" stroke-width="2"/>
          <line x1="12" y1="12" x2="12" y2="3" stroke="white" stroke-width="3" stroke-linecap="round"/>
        </svg>
      `),
      scale: 1,
      anchor: [0.5, 0.5],
      rotation: correctedDirection * Math.PI / 180
    })
  })
  directionFeature.value.setStyle(directionStyle)
}

// Update location indicator
const updateLocationIndicator = () => {
  if (!props.map || !props.showIndicator) return

  try {
    if (props.location) {
      const locationPoint = fromLonLat([props.location.longitude, props.location.latitude])

      // Update location dot
      if (locationFeature.value) {
        locationFeature.value.getGeometry().setCoordinates(locationPoint)
      }

      // Update accuracy circle
      if (accuracyFeature.value && props.showAccuracyCircle && props.accuracy) {
        const accuracyInMapUnits = props.accuracy * 0.00001
        accuracyFeature.value.getGeometry().setCenterAndRadius(locationPoint, accuracyInMapUnits)
      }

      // Update direction arrow position and rotation
      if (directionFeature.value && props.showDirection) {
        const direction = props.direction !== null ? props.direction : 0
        const correctedDirection = direction
        const arrowDistance = 0.001
        const angleRad = (correctedDirection * Math.PI) / 180
        const arrowX = locationPoint[0] + Math.sin(angleRad) * arrowDistance
        const arrowY = locationPoint[1] + Math.cos(angleRad) * arrowDistance

        directionFeature.value.getGeometry().setCoordinates([arrowX, arrowY])
        updateDirectionArrowRotation()
      }
    }
  } catch (error) {
    console.error('Error updating location indicator:', error)
  }
}

// Clean up layers
const cleanupLayers = () => {
  if (props.map) {
    if (locationLayer.value) {
      props.map.removeLayer(locationLayer.value)
      locationLayer.value = null
    }
    if (accuracyLayer.value) {
      props.map.removeLayer(accuracyLayer.value)
      accuracyLayer.value = null
    }
    if (directionLayer.value) {
      props.map.removeLayer(directionLayer.value)
      directionLayer.value = null
    }
  }
}

// Watch for changes
watch(() => props.location, (newLocation, oldLocation) => {
  if (props.map && props.showIndicator) {
    // If location was null/undefined before and now has a value, initialize
    if (!oldLocation && newLocation && !locationFeature.value) {
      initializeLocationIndicator()
    } else if (locationFeature.value) {
      // Otherwise just update existing features
      updateLocationIndicator()
    }
  }
})

watch(() => props.direction, () => {
  if (props.map && props.showIndicator) {
    // Update direction arrow rotation when direction changes
    updateDirectionArrowRotation()
  }
})

watch(() => props.showIndicator, (newValue) => {
  if (newValue) {
    initializeLocationIndicator()
  } else {
    cleanupLayers()
  }
})

// Lifecycle
onMounted(() => {
  if (props.map && props.showIndicator) {
    nextTick(() => {
      initializeLocationIndicator()
    })
  }
})

onUnmounted(() => {
  cleanupLayers()
})
</script>