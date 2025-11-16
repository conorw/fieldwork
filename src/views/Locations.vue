<template>
  <div class="h-full bg-surface-50">

    <!-- Content -->
    <div class="p-4">
      <!-- Loading Overlay for Extent Check -->
      <div v-if="isCheckingExtent"
        class="fixed inset-0 bg-surface-50 bg-opacity-90 flex items-center justify-center z-50">
        <div class="text-center">
          <ProgressSpinner />
          <p class="mt-4 text-lg text-surface-700">Checking map configuration...</p>
        </div>
      </div>

      <!-- Mobile-First Layout -->
      <div class="space-y-4">
        <!-- Location Name Input -->
        <Card>
          <template #title>Create New Location</template>
          <template #content>
            <InputText v-model="locationName" placeholder="Enter location name"
              :class="{ 'p-invalid': locationNameError }" class="w-full" />
            <InlineMessage v-if="locationNameError" severity="error" :closable="false">
              {{ locationNameError }}
            </InlineMessage>
          </template>
        </Card>

        <!-- Map Container -->
        <Card>
          <template #content>
            <div class="overflow-hidden" style="height: 50vh;">
              <MapComponent ref="mapComponent" :center="mapCenter" :zoom="12" :max-zoom="20" :min-zoom="12"
                :location="selectedLocationData" view-name="ExtentConfiguration" tile-source-name="ExtentConfiguration"
                :show-full-screen="false" :show-zoom="true" :show-scale-line="true" :show-attribution="true"
                :show-context-menu="false" :context-menu-items="[]" :disable-event-handlers="true"
                @map-created="handleMapCreated" @map-ready="handleMapReady" @error="handleMapError" />
            </div>
          </template>
        </Card>

        <!-- Simple Controls -->
        <Card>
          <template #content>
            <div class="space-y-3">
              <Button @click="resetRectangleToDefault" :disabled="isLoading || isSaving" label="Reset Area Size"
                severity="secondary" class="w-full" />

              <Button @click="handleSetExtent" :disabled="isSaving" :label="isSaving ? 'Saving...' : 'Save Location'"
                class="w-full" />

              <Button v-if="isExtentConfigured" @click="handleGoToMap" label="Go to Map" severity="success"
                class="w-full" />
            </div>
          </template>
        </Card>
      </div>
    </div>

    <!-- Simplified Save Location Modal -->
    <Dialog v-model:visible="showSaveLocationModal" modal header="Save Location"
      :style="{ width: '90vw', maxWidth: '400px' }">
      <div class="space-y-4">
        <!-- Location Name -->
        <div>
          <label class="block text-sm font-medium text-surface-700 mb-2">Location Name</label>
          <InputText v-model="locationName" placeholder="Enter location name"
            :class="{ 'p-invalid': locationNameError }" class="w-full" />
          <InlineMessage v-if="locationNameError" severity="error" :closable="false">
            {{ locationNameError }}
          </InlineMessage>
        </div>

        <!-- Public/Private -->
        <div>
          <Checkbox v-model="isPublic" inputId="public" />
          <label for="public" class="ml-2 text-sm text-surface-700">Make this location public</label>
        </div>

        <!-- Status Message -->
        <Message v-if="pmtilesStatus"
          :severity="pmtilesStatus === 'error' ? 'error' : pmtilesStatus === 'success' ? 'success' : 'info'"
          :closable="false">
          {{ pmtilesStatusMessage }}
        </Message>
      </div>

      <template #footer>
        <div class="flex space-x-3">
          <Button @click="closeSaveLocationModal" label="Cancel" severity="secondary" :disabled="isSavingLocation"
            class="flex-1" />
          <Button @click="handleSaveLocation" label="Save" :disabled="isSavingLocation || !locationName.trim()"
            class="flex-1" />
        </div>
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useMapStore } from '../stores/map'
import { useSettingsStore } from '../stores/settings'
import { useLocationsStore } from '../stores/locations'
import { usePowerSyncStore } from '../stores/powersync'
import MapComponent from '../components/MapComponent.vue'

const router = useRouter()
const mapStore = useMapStore()
const settingsStore = useSettingsStore()
const locationsStore = useLocationsStore()
const powerSyncStore = usePowerSyncStore()

const mapComponent = ref(null)
const isLoading = ref(false)
const isSaving = ref(false)
const isCheckingExtent = ref(true)

// Location management
const locationName = ref('')
const locationNameError = ref('')
const selectedMinZoom = ref(8)
const selectedMaxZoom = ref(15)
const isPublic = ref(true)
const pmtilesStatus = ref('') // 'generating', 'success', 'error'
const isSavingLocation = ref(false)
const selectedLocation = ref(null)

// Modal state
const showSaveLocationModal = ref(false)
const currentExtent = ref(null)

// Polygon state
const drawnPolygon = ref(null)
const polygonWidth = ref(1000) // Default 1km
const polygonHeight = ref(1000) // Default 1km
const polygonArea = ref(1000000) // Default 1km²
const isPolygonValid = ref(true) // Default is valid
const vectorSource = ref(null)
const vectorLayer = ref(null)

// Computed properties
const isExtentConfigured = computed(() => mapStore.isExtentConfigured)

// Computed center that updates when GPS becomes available
const mapCenter = computed(() => {
  return settingsStore.defaultCenter
})

// PMTiles status styling
const pmtilesStatusClass = computed(() => {
  switch (pmtilesStatus.value) {
    case 'generating':
      return 'bg-blue-100 text-blue-800'
    case 'success':
      return 'bg-green-100 text-green-800'
    case 'error':
      return 'bg-red-100 text-red-800'
    default:
      return ''
  }
})

const pmtilesStatusMessage = computed(() => {
  switch (pmtilesStatus.value) {
    case 'generating':
      return 'Generating PMTiles file...'
    case 'success':
      return 'PMTiles file generated successfully!'
    case 'error':
      return 'Failed to generate PMTiles file'
    default:
      return ''
  }
})

// Selected location data for PMTiles support
const selectedLocationData = computed(() => {
  if (selectedLocation.value && selectedLocation.value.pmtilesUrl) {
    return selectedLocation.value
  }
  return null
})

// Create default 2km x 2km rectangle
const createDefaultRectangle = async () => {
  try {
    const olGeom = await import('ol/geom')
    const ol = await import('ol')
    const olStyle = await import('ol/style')
    const olLayer = await import('ol/layer')
    const olSource = await import('ol/source')
    const olProj = await import('ol/proj')
    const olSphere = await import('ol/sphere')

    const Polygon = olGeom.Polygon
    const Feature = ol.Feature
    const Style = olStyle.Style
    const Fill = olStyle.Fill
    const Stroke = olStyle.Stroke
    const VectorLayer = olLayer.Vector
    const VectorSource = olSource.Vector
    const fromLonLat = olProj.fromLonLat
    const getArea = olSphere.getArea

    const map = mapComponent.value.map

    // Create a 1km x 1km rectangle centered on the map center
    const center = mapCenter.value

    // Calculate the exact degrees for 1km at this latitude
    // 1 degree of latitude ≈ 111km, so 1km ≈ 0.009 degrees
    // 1 degree of longitude ≈ 111km * cos(latitude), so we need to adjust for latitude
    const latDegrees = 1 / 111 // 1km in latitude degrees
    const lonDegrees = 1 / (111 * Math.cos(center[1] * Math.PI / 180)) // 1km in longitude degrees at this latitude

    const halfLat = latDegrees / 2
    const halfLon = lonDegrees / 2

    const rectangleCoords = [
      [
        [center[0] - halfLon, center[1] - halfLat],
        [center[0] + halfLon, center[1] - halfLat],
        [center[0] + halfLon, center[1] + halfLat],
        [center[0] - halfLon, center[1] + halfLat],
        [center[0] - halfLon, center[1] - halfLat] // Close the rectangle
      ]
    ]

    // Convert to map projection coordinates
    const projectedCoords = rectangleCoords[0].map(coord => fromLonLat(coord))

    const rectangleGeometry = new Polygon([projectedCoords])

    // Create feature
    const feature = new Feature(rectangleGeometry)

    // Create vector source and layer
    vectorSource.value = new VectorSource()
    vectorLayer.value = new VectorLayer({
      source: vectorSource.value,
      name: 'extentRectangle',
      style: new Style({
        fill: new Fill({
          color: 'rgba(59, 130, 246, 0.2)'
        }),
        stroke: new Stroke({
          color: '#3b82f6',
          width: 2
        })
      })
    })

    console.log('Vector source and layer created')
    console.log('Vector source:', vectorSource.value)
    console.log('Vector layer:', vectorLayer.value)

    // Add feature to source
    vectorSource.value.addFeature(feature)

    console.log('Feature added to source')
    console.log('Source features count:', vectorSource.value.getFeatures().length)
    console.log('Source features:', vectorSource.value.getFeatures())

    // Add layer to map
    map.addLayer(vectorLayer.value)

    console.log('Rectangle created and added to map:')
    console.log('Feature:', feature)
    console.log('Geometry:', feature.getGeometry())
    console.log('Vector source:', vectorSource.value)
    console.log('Vector layer:', vectorLayer.value)
    console.log('Map layers:', map.getLayers().getArray())

    // Store reference to feature
    drawnPolygon.value = feature

    // Calculate initial dimensions
    const extent = rectangleGeometry.getExtent()
    const { width, height } = await calculatePolygonDimensions(extent)
    const area = getArea(rectangleGeometry)

    polygonWidth.value = width
    polygonHeight.value = height
    polygonArea.value = area

    // Check if rectangle is within 1km x 1km limit
    const maxSize = settingsStore.maxExtentSize + 200 // 1km in meters
    isPolygonValid.value = width <= maxSize && height <= maxSize

    console.log('Default rectangle created:', { width, height, area, isValid: isPolygonValid.value })

    // Add rectangle interactions for moving only
    console.log('Adding rectangle interactions...')
    addRectangleInteractions(feature, vectorSource.value)

    // Ensure the map is zoomed to show the rectangle
    const rectangleExtent = rectangleGeometry.getExtent()
    map.getView().fit(rectangleExtent, {
      padding: [50, 50, 50, 50],
      duration: 1000
    })

    console.log('Map view fitted to rectangle extent:', rectangleExtent)

  } catch (error) {
    console.error('Error creating default rectangle:', error)
  }
}

// Reset rectangle to default size
const resetRectangleToDefault = async () => {
  if (drawnPolygon.value && vectorSource.value) {
    // Remove current rectangle
    vectorSource.value.clear()

    // Create new default rectangle
    await createDefaultRectangle()
  }
}

// Calculate distance between two points in meters
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371000 // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// Add modify interaction for resizing
const addModifyInteraction = async (feature, source) => {
  try {
    const olInteraction = await import('ol/interaction')
    const olSphere = await import('ol/sphere')
    const olProj = await import('ol/proj')
    const olGeom = await import('ol/geom')
    const olStyle = await import('ol/style')

    const Modify = olInteraction.Modify
    const Select = olInteraction.Select
    const getArea = olSphere.getArea
    const toLonLat = olProj.toLonLat
    const fromLonLat = olProj.fromLonLat
    const Polygon = olGeom.Polygon
    const Style = olStyle.Style
    const Fill = olStyle.Fill
    const Stroke = olStyle.Stroke
    const Circle = olStyle.Circle

    const map = mapComponent.value.map

    console.log('Setting up interactions...')
    console.log('Map instance:', map)
    console.log('Feature:', feature)
    console.log('Source:', source)

    // Create a style for the polygon that shows vertices
    const polygonStyle = new Style({
      fill: new Fill({
        color: 'rgba(59, 130, 246, 0.2)'
      }),
      stroke: new Stroke({
        color: '#3b82f6',
        width: 3
      }),
      image: new Circle({
        radius: 8,
        fill: new Fill({
          color: '#ef4444'
        }),
        stroke: new Stroke({
          color: 'white',
          width: 3
        })
      })
    })

    // Create a style for the polygon without vertices (for the layer)
    const layerStyle = new Style({
      fill: new Fill({
        color: 'rgba(59, 130, 246, 0.2)'
      }),
      stroke: new Stroke({
        color: '#3b82f6',
        width: 3
      })
    })

    // Update the layer style
    vectorLayer.value.setStyle(layerStyle)

    // Create a collection for the features
    const features = source.getFeaturesCollection()

    // Add Select interaction
    const selectInteraction = new Select({
      features: features,
      style: polygonStyle
    })

    // Add Modify interaction for both resizing and moving
    const modifyInteraction = new Modify({
      source: source,
      style: polygonStyle
    })

    console.log('Interactions created:', {
      select: selectInteraction,
      modify: modifyInteraction
    })

    // Add event listeners
    selectInteraction.on('select', (event) => {
      console.log('Feature selected:', event.selected)
    })

    modifyInteraction.on('modifystart', (event) => {
      console.log('Modifying polygon...', event)
      console.log('Modify event features:', event.features)
    })

    modifyInteraction.on('modifyend', async (event) => {
      console.log('Modify end event:', event)
      const modifiedFeature = event.features.getArray()[0]
      let geometry = modifiedFeature.getGeometry()

      console.log('Modified feature:', modifiedFeature)
      console.log('Modified geometry:', geometry)
      console.log('Modified geometry type:', geometry.getType())

      // Validate that the geometry is still a polygon
      if (geometry.getType() !== 'Polygon') {
        console.error('Geometry is not a polygon after modification:', geometry.getType())
        return
      }

      // Get the current extent and convert to lat/lng
      const extent = geometry.getExtent()
      const sw = toLonLat([extent[0], extent[1]])
      const ne = toLonLat([extent[2], extent[3]])

      // Calculate center point
      const centerLon = (sw[0] + ne[0]) / 2
      const centerLat = (sw[1] + ne[1]) / 2

      // Calculate current dimensions
      const currentWidth = calculateDistance(centerLat, sw[0], centerLat, ne[0])
      const currentHeight = calculateDistance(sw[1], centerLon, ne[1], centerLon)

      console.log('Current dimensions:', { width: currentWidth, height: currentHeight })

      // Check size constraints
      const maxSize = settingsStore.maxExtentSize + 200 // 2km in meters
      const isTooLarge = currentWidth > maxSize || currentHeight > maxSize

      if (isTooLarge) {
        console.log('Rectangle too large, constraining to 1km x 1km')

        // Calculate the exact degrees for 1km at this latitude
        const latDegrees = 1 / 111 // 1km in latitude degrees
        const lonDegrees = 1 / (111 * Math.cos(centerLat * Math.PI / 180)) // 1km in longitude degrees

        const halfLat = latDegrees / 2
        const halfLon = lonDegrees / 2

        // Create a constrained 1km x 1km rectangle
        const constrainedCoords = [
          [
            [centerLon - halfLon, centerLat - halfLat],
            [centerLon + halfLon, centerLat - halfLat],
            [centerLon + halfLon, centerLat + halfLat],
            [centerLon - halfLon, centerLat + halfLat],
            [centerLon - halfLon, centerLat - halfLat] // Close the polygon
          ]
        ]

        // Convert to map projection coordinates
        const projectedCoords = constrainedCoords[0].map(coord => fromLonLat(coord))
        const constrainedGeometry = new Polygon([projectedCoords])

        // Update the feature with the constrained geometry
        modifiedFeature.setGeometry(constrainedGeometry)
        geometry = constrainedGeometry

        // Recalculate dimensions for the constrained polygon
        const constrainedExtent = geometry.getExtent()
        const constrainedDimensions = await calculatePolygonDimensions(constrainedExtent)
        const constrainedArea = getArea(geometry)

        polygonWidth.value = constrainedDimensions.width
        polygonHeight.value = constrainedDimensions.height
        polygonArea.value = constrainedArea
        isPolygonValid.value = true

        console.log('Rectangle constrained to:', {
          width: constrainedDimensions.width,
          height: constrainedDimensions.height,
          area: constrainedArea
        })

        // Show user feedback
        alert('Rectangle size constrained to maximum 1km x 1km')
      } else {
        // Simply update the dimensions without changing the shape
        const rectangularExtent = geometry.getExtent()
        const rectangularDimensions = await calculatePolygonDimensions(rectangularExtent)
        const rectangularArea = getArea(geometry)

        polygonWidth.value = rectangularDimensions.width
        polygonHeight.value = rectangularDimensions.height
        polygonArea.value = rectangularArea
        isPolygonValid.value = true

        console.log('Rectangle scaled:', {
          width: rectangularDimensions.width,
          height: rectangularDimensions.height,
          area: rectangularArea
        })
      }
    })

    // Add interactions to the map
    map.addInteraction(selectInteraction)
    map.addInteraction(modifyInteraction)

    console.log('All interactions added to map')
    console.log('Map interactions:', map.getInteractions().getArray())
    console.log('Features in source:', source.getFeatures())
    console.log('Features collection:', source.getFeaturesCollection())

    // Test if the feature is selectable
    const testFeature = source.getFeatures()[0]
    if (testFeature) {
      console.log('Test feature found:', testFeature)
      console.log('Test feature geometry:', testFeature.getGeometry())
      console.log('Test feature extent:', testFeature.getGeometry().getExtent())
    } else {
      console.warn('No features found in source!')
    }

  } catch (error) {
    console.error('Error adding interactions:', error)
  }
}

// Add rectangle interactions for moving and resizing
const addRectangleInteractions = async (feature, source) => {
  try {
    const olInteraction = await import('ol/interaction')
    const olSphere = await import('ol/sphere')
    const olProj = await import('ol/proj')
    const olGeom = await import('ol/geom')
    const olStyle = await import('ol/style')
    const olExtent = await import('ol/extent')
    const olEvents = await import('ol/events/condition')

    const Select = olInteraction.Select
    const Translate = olInteraction.Translate
    const Modify = olInteraction.Modify
    const getArea = olSphere.getArea
    const toLonLat = olProj.toLonLat
    const fromLonLat = olProj.fromLonLat
    const Polygon = olGeom.Polygon
    const Point = olGeom.Point
    const MultiPoint = olGeom.MultiPoint
    const Style = olStyle.Style
    const Fill = olStyle.Fill
    const Stroke = olStyle.Stroke
    const RegularShape = olStyle.RegularShape
    const getCenter = olExtent.getCenter
    const getWidth = olExtent.getWidth
    const getHeight = olExtent.getHeight
    const primaryAction = olEvents.primaryAction
    const platformModifierKeyOnly = olEvents.platformModifierKeyOnly
    const never = olEvents.never

    const map = mapComponent.value.map

    console.log('Setting up rectangle interactions for moving and resizing...')
    console.log('Map instance:', map)
    console.log('Feature:', feature)
    console.log('Source:', source)

    // Function to calculate center and vertices for rectangle
    const calculateRectangleCenter = (geometry) => {
      const extent = geometry.getExtent()
      const center = getCenter(extent)
      const coordinates = geometry.getCoordinates()[0].slice(1) // Remove last duplicate point
      return {
        center: center,
        coordinates: coordinates,
        minRadius: Math.max(getWidth(extent), getHeight(extent)) / 6
      }
    }

    // Create a style for the rectangle with square resize handles
    const rectangleStyle = function (feature) {
      const styles = []

      // Base rectangle style
      const modifyGeometry = feature.get('modifyGeometry')
      const geometry = modifyGeometry ? modifyGeometry.geometry : feature.getGeometry()

      styles.push(new Style({
        geometry: geometry,
        fill: new Fill({
          color: 'rgba(59, 130, 246, 0.2)'
        }),
        stroke: new Stroke({
          color: '#3b82f6',
          width: 3
        })
      }))

      // Add center point (red)
      const result = calculateRectangleCenter(geometry)
      const center = result.center
      if (center) {
        styles.push(new Style({
          geometry: new Point(center),
          image: new RegularShape({
            points: 4,
            radius: 6,
            radius2: 0,
            fill: new Fill({
              color: '#ef4444'
            }),
            stroke: new Stroke({
              color: 'white',
              width: 2
            }),
            rotation: Math.PI / 4
          })
        }))

        // Add corner vertices (green squares)
        const coordinates = result.coordinates
        const minRadius = result.minRadius
        const sqDistances = coordinates.map(function (coordinate) {
          const dx = coordinate[0] - center[0]
          const dy = coordinate[1] - center[1]
          return dx * dx + dy * dy
        })
        const rsq = minRadius * minRadius
        const cornerPoints = coordinates.filter(function (coordinate, index) {
          return sqDistances[index] > rsq
        })

        if (cornerPoints.length > 0) {
          styles.push(new Style({
            geometry: new MultiPoint(cornerPoints),
            image: new RegularShape({
              points: 4,
              radius: 6,
              radius2: 0,
              fill: new Fill({
                color: '#10b981'
              }),
              stroke: new Stroke({
                color: 'white',
                width: 2
              }),
              rotation: Math.PI / 4
            })
          }))
        }
      }

      return styles
    }

    // Update the layer style
    vectorLayer.value.setStyle(rectangleStyle)

    // Create a collection for the features
    const features = source.getFeaturesCollection()

    // Add Select interaction
    const selectInteraction = new Select({
      features: features,
      style: rectangleStyle
    })

    // Add Translate interaction for moving
    const translateInteraction = new Translate({
      source: source
    })

    // Get default modify style
    const defaultModifyStyle = new Modify({ source: source }).getOverlay().getStyleFunction()

    // Add Modify interaction for scaling
    const modifyInteraction = new Modify({
      source: source,
      deleteCondition: never,
      insertVertexCondition: never,
      style: function (feature, resolution) {
        feature.get('features').forEach(function (modifyFeature) {
          const modifyGeometry = modifyFeature.get('modifyGeometry')
          if (modifyGeometry) {
            const point = feature.getGeometry().getCoordinates()
            let modifyPoint = modifyGeometry.point
            if (!modifyPoint) {
              // Save the initial geometry and vertex position
              modifyPoint = point
              modifyGeometry.point = modifyPoint
              modifyGeometry.geometry0 = modifyGeometry.geometry
              // Get anchor and minimum radius of vertices to be used
              const result = calculateRectangleCenter(modifyGeometry.geometry0)
              modifyGeometry.center = result.center
              modifyGeometry.minRadius = result.minRadius
            }

            const center = modifyGeometry.center
            const minRadius = modifyGeometry.minRadius
            let dx, dy
            dx = modifyPoint[0] - center[0]
            dy = modifyPoint[1] - center[1]
            const initialRadius = Math.sqrt(dx * dx + dy * dy)
            if (initialRadius > minRadius) {
              const initialAngle = Math.atan2(dy, dx)
              dx = point[0] - center[0]
              dy = point[1] - center[1]
              const currentRadius = Math.sqrt(dx * dx + dy * dy)
              if (currentRadius > 0) {
                const currentAngle = Math.atan2(dy, dx)
                const geometry = modifyGeometry.geometry0.clone()
                geometry.scale(currentRadius / initialRadius, undefined, center)
                geometry.rotate(currentAngle - initialAngle, center)
                modifyGeometry.geometry = geometry
              }
            }
          }
        })
        return defaultModifyStyle(feature, resolution)
      }
    })

    console.log('Rectangle interactions created:', {
      select: selectInteraction,
      translate: translateInteraction,
      modify: modifyInteraction
    })

    // Add event listeners
    selectInteraction.on('select', (event) => {
      console.log('Feature selected:', event.selected)
    })

    translateInteraction.on('translatestart', (event) => {
      console.log('Moving rectangle...', event)
    })

    translateInteraction.on('translateend', async (event) => {
      console.log('Translate end event:', event)
      const translatedFeature = event.features.getArray()[0]
      const geometry = translatedFeature.getGeometry()

      console.log('Translated feature:', translatedFeature)
      console.log('Translated geometry:', geometry)
      console.log('Translated geometry type:', geometry.getType())

      // Ensure the geometry is still a polygon after translation
      if (geometry.getType() !== 'Polygon') {
        console.error('Geometry is not a polygon after translation:', geometry.getType())
        return
      }

      // Recalculate dimensions after translation
      const extent = geometry.getExtent()
      const { width, height } = await calculatePolygonDimensions(extent)
      const area = getArea(geometry)

      polygonWidth.value = width
      polygonHeight.value = height
      polygonArea.value = area

      console.log('Rectangle moved:', { width, height, area })
    })

    modifyInteraction.on('modifystart', (event) => {
      console.log('Modifying rectangle...', event)
      event.features.forEach(function (feature) {
        feature.set('modifyGeometry', { geometry: feature.getGeometry().clone() }, true)
      })
    })

    modifyInteraction.on('modifyend', async (event) => {
      console.log('Modify end event:', event)
      event.features.forEach(function (feature) {
        const modifyGeometry = feature.get('modifyGeometry')
        if (modifyGeometry) {
          feature.setGeometry(modifyGeometry.geometry)
          feature.unset('modifyGeometry', true)
        }
      })

      // Get the modified feature and recalculate dimensions
      const modifiedFeature = event.features.getArray()[0]
      const geometry = modifiedFeature.getGeometry()

      console.log('Modified feature:', modifiedFeature)
      console.log('Modified geometry:', geometry)
      console.log('Modified geometry type:', geometry.getType())

      // Validate that the geometry is still a polygon
      if (geometry.getType() !== 'Polygon') {
        console.error('Geometry is not a polygon after modification:', geometry.getType())
        return
      }

      // Get the current extent and convert to lat/lng
      const extent = geometry.getExtent()
      const sw = toLonLat([extent[0], extent[1]])
      const ne = toLonLat([extent[2], extent[3]])

      // Calculate center point
      const centerLon = (sw[0] + ne[0]) / 2
      const centerLat = (sw[1] + ne[1]) / 2

      // Calculate current dimensions
      const currentWidth = calculateDistance(centerLat, sw[0], centerLat, ne[0])
      const currentHeight = calculateDistance(sw[1], centerLon, ne[1], centerLon)

      console.log('Current dimensions:', { width: currentWidth, height: currentHeight })

      // Check size constraints
      const maxSize = settingsStore.maxExtentSize + 200 // Allow some buffer
      const isTooLarge = currentWidth > maxSize || currentHeight > maxSize

      if (isTooLarge) {
        console.log('Rectangle too large, constraining to 1km x 1km')

        // Calculate the exact degrees for 1km at this latitude
        const latDegrees = 1 / 111 // 1km in latitude degrees
        const lonDegrees = 1 / (111 * Math.cos(centerLat * Math.PI / 180)) // 1km in longitude degrees

        const halfLat = latDegrees / 2
        const halfLon = lonDegrees / 2

        // Create a constrained 1km x 1km rectangle
        const constrainedCoords = [
          [
            [centerLon - halfLon, centerLat - halfLat],
            [centerLon + halfLon, centerLat - halfLat],
            [centerLon + halfLon, centerLat + halfLat],
            [centerLon - halfLon, centerLat + halfLat],
            [centerLon - halfLon, centerLat - halfLat] // Close the polygon
          ]
        ]

        // Convert to map projection coordinates
        const projectedCoords = constrainedCoords[0].map(coord => fromLonLat(coord))
        const constrainedGeometry = new Polygon([projectedCoords])

        // Update the feature with the constrained geometry
        modifiedFeature.setGeometry(constrainedGeometry)

        // Recalculate dimensions for the constrained polygon
        const constrainedExtent = constrainedGeometry.getExtent()
        const constrainedDimensions = await calculatePolygonDimensions(constrainedExtent)
        const constrainedArea = getArea(constrainedGeometry)

        polygonWidth.value = constrainedDimensions.width
        polygonHeight.value = constrainedDimensions.height
        polygonArea.value = constrainedArea
        isPolygonValid.value = true

        console.log('Rectangle constrained to:', {
          width: constrainedDimensions.width,
          height: constrainedDimensions.height,
          area: constrainedArea
        })

        // Show user feedback
        alert('Rectangle size constrained to maximum 1km x 1km')
      } else {
        // Simply update the dimensions
        const rectangularExtent = geometry.getExtent()
        const rectangularDimensions = await calculatePolygonDimensions(rectangularExtent)
        const rectangularArea = getArea(geometry)

        polygonWidth.value = rectangularDimensions.width
        polygonHeight.value = rectangularDimensions.height
        polygonArea.value = rectangularArea
        isPolygonValid.value = true

        console.log('Rectangle scaled:', {
          width: rectangularDimensions.width,
          height: rectangularDimensions.height,
          area: rectangularArea
        })
      }
    })

    // Add interactions to the map
    map.addInteraction(selectInteraction)
    map.addInteraction(translateInteraction)
    map.addInteraction(modifyInteraction)

    console.log('All rectangle interactions added to map')
    console.log('Map interactions:', map.getInteractions().getArray())
    console.log('Features in source:', source.getFeatures())
    console.log('Features collection:', source.getFeaturesCollection())

    // Test if the feature is selectable
    const testFeature = source.getFeatures()[0]
    if (testFeature) {
      console.log('Test feature found:', testFeature)
      console.log('Test feature geometry:', testFeature.getGeometry())
      console.log('Test feature extent:', testFeature.getGeometry().getExtent())
    } else {
      console.warn('No features found in source!')
    }

  } catch (error) {
    console.error('Error adding rectangle interactions:', error)
  }
}

// Calculate polygon dimensions from extent
const calculatePolygonDimensions = async (extent) => {
  const [minX, minY, maxX, maxY] = extent

  // Convert to lat/lng for distance calculation
  const { toLonLat } = await import('ol/proj')
  const minCoord = toLonLat([minX, minY])
  const maxCoord = toLonLat([maxX, maxY])

  // Calculate width (longitude difference at the latitude)
  const width = calculateDistance(minCoord[1], minCoord[0], minCoord[1], maxCoord[0])

  // Calculate height (latitude difference)
  const height = calculateDistance(minCoord[1], minCoord[0], maxCoord[1], minCoord[0])

  return { width, height }
}

// Handle map creation
const handleMapCreated = (mapInstance) => {
  console.log('ExtentConfiguration: Map created by MapComponent')
  console.log('ExtentConfiguration: Map instance:', mapInstance)
}

// Handle map ready
const handleMapReady = (mapInstance) => {
  console.log('ExtentConfiguration: Map is ready')
  console.log('ExtentConfiguration: Map instance:', mapInstance)
  // Create default polygon when map is ready
  createDefaultRectangle()
}

// Handle map error
const handleMapError = (error) => {
  console.error('ExtentConfiguration: Map error:', error)
}

// Handle setting the current extent
const handleSetExtent = async () => {
  if (!mapComponent.value || !mapComponent.value.map) {
    alert('Map not available')
    return
  }

  if (!isPolygonValid.value) {
    alert('Please draw a valid rectangle (max 1km x 1km) before setting the extent')
    return
  }

  if (!locationName.value.trim()) {
    locationNameError.value = 'Location name is required'
    return
  }

  try {
    isSaving.value = true

    // Get extent from the current rectangle in the vector source
    const features = vectorSource.value.getFeatures()
    if (features.length === 0) {
      alert('No rectangle found on the map')
      return
    }

    const rectangleFeature = features[0]
    const geometry = rectangleFeature.getGeometry()
    const extent = geometry.getExtent()

    // Convert to lat/lng
    const { toLonLat } = await import('ol/proj')
    const sw = toLonLat([extent[0], extent[1]])
    const ne = toLonLat([extent[2], extent[3]])
    const bbox = [sw[0], sw[1], ne[0], ne[1]] // [minLon, minLat, maxLon, maxLat]

    // Generate PMTiles file
    const pmtiles_url = await generatepmtilesUrl(bbox)

    // Save location to database
    const locationId = await powerSyncStore.addNewLocation({
      name: locationName.value.trim(),
      bbox,
      minZoom: selectedMinZoom.value,
      maxZoom: selectedMaxZoom.value,
      pmtiles_url,
      isPublic: isPublic.value
    })

    // Save the extent configuration
    await mapStore.finishExtentConfiguration(bbox)

    // Navigate to map view
    router.push('/')

  } catch (error) {
    console.error('Error saving location:', error)
    alert('Failed to save location: ' + (error.message || 'Unknown error'))
  } finally {
    isSaving.value = false
  }
}

// Handle navigation to map
const handleGoToMap = () => {
  router.push('/')
}

// Handle saving the location (for modal)
const handleSaveLocation = async () => {
  if (!locationName.value.trim()) {
    locationNameError.value = 'Location name is required'
    return
  }

  if (locationName.value.trim().length < 3) {
    locationNameError.value = 'Location name must be at least 3 characters long'
    return
  }

  locationNameError.value = ''
  isSavingLocation.value = true
  pmtilesStatus.value = 'generating'

  try {
    if (!currentExtent.value) {
      throw new Error('No extent available to save')
    }

    const bbox = currentExtent.value

    // Generate PMTiles file using the simplified system
    const pmtiles_url = await generatepmtilesUrl(bbox)

    // Save location to database with PMTiles data
    const locationId = await powerSyncStore.addNewLocation({
      name: locationName.value.trim(),
      bbox,
      minZoom: selectedMinZoom.value,
      maxZoom: selectedMaxZoom.value,
      pmtiles_url,
      isPublic: isPublic.value
    })

    // Save the extent configuration
    await mapStore.finishExtentConfiguration(bbox)

    pmtilesStatus.value = 'success'

    // Close modal and navigate to map view
    setTimeout(() => {
      closeSaveLocationModal()
      router.push('/')
    }, 1500)
  } catch (error) {
    console.error('Error saving location:', error)
    pmtilesStatus.value = 'error'
    locationNameError.value = 'Failed to save location: ' + (error.message || 'Unknown error')
  } finally {
    isSavingLocation.value = false
  }
}



// Generate PMTiles data using the simplified system
const generatepmtilesUrl = async (bbox) => {
  try {
    const response = await fetch('/api/clip', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bbox,
        minZoom: selectedMinZoom.value,
        maxZoom: selectedMaxZoom.value,
        name: locationName.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`PMTiles generation failed: ${errorText}`)
    }

    const url = await response.text();
    return url;
  } catch (error) {
    console.error('Error generating PMTiles data:', error)
    throw error
  }
}

// Close the save location modal
const closeSaveLocationModal = () => {
  showSaveLocationModal.value = false
  currentExtent.value = null
  locationName.value = ''
  locationNameError.value = ''
  isPublic.value = true
  pmtilesStatus.value = ''
}

// Lifecycle
onMounted(async () => {
  // Set a timeout to prevent infinite loading
  const timeoutId = setTimeout(() => {
    isCheckingExtent.value = false
  }, 10000) // 10 second timeout

  try {
    // Initialize PowerSync first
    if (!powerSyncStore.isInitialized) {
      await powerSyncStore.initialize()
    }

    // Ensure extent configuration is loaded
    await mapStore.loadExtentConfiguration()

    // Load locations for PMTiles support
    await locationsStore.loadLocations()

    // Check if extent is already configured, then redirect to map
    if (isExtentConfigured.value) {
      clearTimeout(timeoutId)
      router.push('/')
      return
    }

    // Extent not configured, show the configuration interface
    clearTimeout(timeoutId)
    isCheckingExtent.value = false
  } catch (error) {
    console.error('Error initializing extent configuration:', error)
    // Show the configuration interface even if there's an error
    clearTimeout(timeoutId)
    isCheckingExtent.value = false
  }
})

// Watch for extent configuration completion
watch(isExtentConfigured, (extentConfigured) => {
  if (extentConfigured) {
    isCheckingExtent.value = true // Show loading state during redirect
    router.push('/')
  }
})

onUnmounted(() => {
  if (mapComponent.value) {
    mapComponent.value = null
  }
})
</script>