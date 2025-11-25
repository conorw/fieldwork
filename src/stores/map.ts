
import { ref, watch } from 'vue'
import { useGeolocation } from '@vueuse/core'
import { usePowerSyncStore } from './powersync'
import { defineStore } from 'pinia'
import { useLocationsStore } from './locations'
import { usePersonsStore } from './persons'
import { CapacitorGeolocationService } from '../services/capacitorGeolocation'

// Static imports for OpenLayers modules - loaded once at module level
import Feature from 'ol/Feature'
import Polygon from 'ol/geom/Polygon'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { fromLonLat, toLonLat } from 'ol/proj'
import Style from 'ol/style/Style'
import Fill from 'ol/style/Fill'
import Stroke from 'ol/style/Stroke'
import Select from 'ol/interaction/Select'

export const useMapStore = defineStore('map', () => {
  const map = ref<import('ol/Map').default | null>(null)
  const locationsStore = useLocationsStore()
  const personsStore = usePersonsStore()
  const capacitorGeolocation = CapacitorGeolocationService.getInstance()
  const currentLocation = ref<{
    latitude: number
    longitude: number
    accuracy: number
    timestamp: number
  } | null>(null)
  const drawingMode = ref(false)
  const editingMode = ref(false)
  const selectedPlot = ref<any>(null)
  const selectedPlotPersons = ref<any[]>([])
  const currentModifyInteraction = ref(null)
  const currentSelectInteraction = ref(null) // Store Select interaction used for Transform
  const originalInteractions = ref<any[]>([])
  const isDrawing = ref(false)
  const initialized = ref(false)

  // State for plot editing (in-place)
  const editingPlot = ref<any>(null)


  // Single layer for all plots
  const plotsLayer = ref<VectorLayer<any> | null>(null)

  // Initialize the plots layer
  const initializePlotsLayer = (): void => {
    if (!map.value) return

    // Remove existing plots layer if it exists
    if (plotsLayer.value) {
      map.value.removeLayer(plotsLayer.value as any)
    }

    // Create new plots layer
    plotsLayer.value = new VectorLayer({
      source: new VectorSource({
        features: []
      }),
      style: getPlotStyle
    })

    // Add name to identify this layer
    plotsLayer.value.set('name', 'plots')

    // Add to map
    map.value.addLayer(plotsLayer.value as any)
  }




  // Dynamic style function for plot selection
  const getPlotStyle = (feature: any) => {
    const plot = feature.get('plot')
    if (!plot) return plotStyle

    const isSelected = selectedPlot.value?.id === plot.id
    return isSelected ? selectedPlotStyle : plotStyle
  }


  // Cached style objects - created once and reused
  const plotStyle = [
    // Shadow layer for depth
    new Style({
      fill: new Fill({
        color: 'rgba(0, 0, 0, 0.2)' // Dark shadow
      }),
      stroke: new Stroke({
        color: 'rgba(0, 0, 0, 0.3)',
        width: 2
      }),
      zIndex: 0
    }),
    // Main plot style
    new Style({
      fill: new Fill({
        color: 'rgba(59, 130, 246, 0.5)' // More opaque blue
      }),
      stroke: new Stroke({
        color: 'rgb(29, 78, 216)', // Darker blue border
        width: 3,
        lineDash: [5, 5] // Dashed border for better visibility
      }),
      zIndex: 1
    })
  ]

  const selectedPlotStyle = [
    // Shadow layer for depth
    new Style({
      fill: new Fill({
        color: 'rgba(0, 0, 0, 0.3)' // Darker shadow for selected
      }),
      stroke: new Stroke({
        color: 'rgba(0, 0, 0, 0.4)',
        width: 3
      }),
      zIndex: 0
    }),
    // Main selected plot style
    new Style({
      fill: new Fill({
        color: 'rgba(34, 197, 94, 0.7)' // More opaque green
      }),
      stroke: new Stroke({
        color: 'rgb(21, 128, 61)', // Darker green border
        width: 4,
        lineDash: [8, 4] // Thicker dashed border
      }),
      zIndex: 1
    })
  ]

  // Hover style for better interactivity
  const hoverPlotStyle = [
    // Shadow layer
    new Style({
      fill: new Fill({
        color: 'rgba(0, 0, 0, 0.25)'
      }),
      stroke: new Stroke({
        color: 'rgba(0, 0, 0, 0.35)',
        width: 2
      }),
      zIndex: 0
    }),
    // Main hover style
    new Style({
      fill: new Fill({
        color: 'rgba(168, 85, 247, 0.6)' // Purple with transparency
      }),
      stroke: new Stroke({
        color: 'rgb(147, 51, 234)', // Purple border
        width: 3,
        lineDash: [3, 3] // Dotted border
      }),
      zIndex: 1
    })
  ]

  // Map extent configuration
  const mapExtent = ref<[number, number, number, number] | null>(null)
  const isExtentConfigured = ref(false)
  const isConfiguringExtent = ref(false)
  const tileSource = ref(null)

  const mapBounds = ref([
    [-6.25, 55.18], // Southwest - Ballycastle area
    [-6.20, 55.22]  // Northeast - Ballycastle area
  ])

  // Map configuration
  const mapConfig = ref({
    maxZoom: 23,
    minZoom: 17,
    defaultZoom: 16
  })

  // Persistent zoom level management
  const ZOOM_STORAGE_KEY = 'fieldwork_map_zoom_level'
  const DEFAULT_ZOOM = 16
  const MIN_ZOOM = 1
  const MAX_ZOOM = 20

  // Save current zoom level to localStorage
  const saveZoomLevel = (zoom: number): void => {
    try {
      const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom))
      localStorage.setItem(ZOOM_STORAGE_KEY, clampedZoom.toString())
    } catch (error) {
      console.warn('MapStore: Failed to save zoom level:', error)
    }
  }

  // Load saved zoom level from localStorage
  const loadZoomLevel = (): number => {
    try {
      const saved = localStorage.getItem(ZOOM_STORAGE_KEY)
      if (saved) {
        const zoom = parseFloat(saved)
        if (!isNaN(zoom) && zoom >= MIN_ZOOM && zoom <= MAX_ZOOM) {
          return zoom
        }
      }
    } catch (error) {
      console.warn('MapStore: Failed to load zoom level:', error)
    }
    return DEFAULT_ZOOM
  }

  // Get current zoom level from map
  const getCurrentZoom = (): number | null => {
    if (!map.value) return null
    const zoom = map.value.getView().getZoom()
    return zoom !== undefined ? zoom : null
  }

  // Set zoom level on map
  const setZoomLevel = (zoom: number): void => {
    if (!map.value) return

    const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom))
    map.value.getView().setZoom(clampedZoom)
  }

  // Restore saved zoom level (useful when returning to map view)
  const restoreZoomLevel = (): void => {
    if (!map.value) return

    const savedZoom = loadZoomLevel()
    setZoomLevel(savedZoom)
  }

  // Reset zoom level to default
  const resetZoomLevel = (): void => {
    if (!map.value) return

    setZoomLevel(DEFAULT_ZOOM)
    saveZoomLevel(DEFAULT_ZOOM)
  }

  // GPS tracking
  const { coords, error: locationError } = useGeolocation({
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 300000 // 5 minutes
  })

  // Watch for location changes
  const watchLocation = () => {
    if (coords.value) {
      // Validate coordinates before setting
      const { latitude, longitude, accuracy } = coords.value
      if (latitude && longitude &&
        !isNaN(latitude) && !isNaN(longitude) &&
        latitude >= -90 && latitude <= 90 &&
        longitude >= -180 && longitude <= 180) {

        currentLocation.value = {
          latitude,
          longitude,
          accuracy: accuracy || 5,
          timestamp: Date.now()
        }
      } else {
        console.warn('Invalid GPS coordinates received:', coords.value)
      }
    }
  }

  // Watch for GPS coordinate changes
  watch(coords, (newCoords) => {
    if (newCoords) {
      watchLocation()
    }
  }, { immediate: true })

  // Watch for location errors
  watch(locationError, (error) => {
    if (error) {
      console.warn('GPS location error:', error)
    }
  })

  const loadExtentConfiguration = async (): Promise<void> => {
    try {
      const selectedLocation = locationsStore.selectedLocation
      if (selectedLocation) {
        mapExtent.value = selectedLocation.bbox
        isExtentConfigured.value = true
      }
    } catch (error) {
      console.error('Error loading extent configuration:', error)
    }
  }


  // Start extent configuration mode
  const startExtentConfiguration = () => {
    isConfiguringExtent.value = true
  }

  // Finish extent configuration
  const finishExtentConfiguration = async (extent: [number, number, number, number]): Promise<void> => {
    try {
      await locationsStore.updateLocation(locationsStore.selectedLocationId, { bbox: extent })
      isConfiguringExtent.value = false
    } catch (error) {
      console.error('Error finishing extent configuration:', error, JSON.stringify(error))
      // Check if this is just a sync error - if so, don't fail the operation
      if (typeof error === 'object' && error !== null) {
        const err: any = error
        if (err.type === 'sync_failed' && err.localSaveSuccessful) {
          isConfiguringExtent.value = false
          return // Don't throw the error
        }
      }
      // Keep configuration mode active if save failed
      throw error
    }
  }

  // Cancel extent configuration
  const cancelExtentConfiguration = () => {
    isConfiguringExtent.value = false
  }

  // Clear extent configuration
  const clearExtentConfiguration = async (): Promise<void> => {
    try {
      const powerSyncStore = usePowerSyncStore()

      if (!powerSyncStore.powerSync) {
        console.error('Zero.dev not initialized, cannot clear extent')
        return
      }

      // Find and delete the settings
      const existingSettings2 = await powerSyncStore.powerSync.getAll(
        'SELECT * FROM settings WHERE type = ?',
        ['mapExtent']
      )

      if (existingSettings2 && existingSettings2.length > 0) {
        const existingSetting = existingSettings2[0] as any
        await powerSyncStore.powerSync.execute('DELETE FROM settings WHERE id = ?', [existingSetting.id])

        // Trigger sync to save changes (optional - don't fail if sync fails)
        try {
          // PowerSync handles sync automatically
        } catch (syncError) {
          console.warn('Map extent deleted locally but server sync failed:', syncError)
          // Don't throw the error - local deletion was successful
        }
      }

      // Update local state
      mapExtent.value = null
      isExtentConfigured.value = false
    } catch (error) {
      console.error('Error clearing map extent configuration:', error, JSON.stringify(error))
      throw error
    }
  }

  // Get current map extent for display
  const getCurrentMapExtent = (): [number, number, number, number] | null => {
    if (!map.value) return null

    try {
      const view = map.value.getView()
      const extent = view.calculateExtent()

      // Convert extent from map projection to lat/lng
      const sw = toLonLat([extent[0], extent[1]])
      const ne = toLonLat([extent[2], extent[3]])

      return [sw[0], sw[1], ne[0], ne[1]] // [minLon, minLat, maxLon, maxLat]
    } catch (error) {
      console.error('Error getting current map extent:', error, JSON.stringify(error))
      return null
    }
  }

  // Manually get GPS location using Capacitor for high accuracy
  const getGPSLocation = (): Promise<{
    latitude: number
    longitude: number
    accuracy: number
    timestamp: number
  }> => {
    return new Promise(async (resolve, reject) => {
      try {
        // Check permissions first
        const permissions = await capacitorGeolocation.checkPermissions()
        if (permissions.location !== 'granted') {
          const newPermissions = await capacitorGeolocation.requestPermissions()
          if (newPermissions.location !== 'granted') {
            reject(new Error('Geolocation permission denied'))
            return
          }
        }

        // Get high accuracy position
        const location = await capacitorGeolocation.getCurrentPosition()
        
        const result = {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          timestamp: location.timestamp
        }

        // Update current location
        currentLocation.value = result
        resolve(result)
      } catch (error) {
        console.error('MapStore: Capacitor GPS location error:', error)
        
        // Fallback to web geolocation API
        if (!navigator.geolocation) {
          reject(new Error('Geolocation not supported'))
          return
        }

        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude, accuracy } = position.coords
            const location = {
              latitude,
              longitude,
              accuracy: accuracy || 5,
              timestamp: Date.now()
            }

            // Update current location
            currentLocation.value = location
            resolve(location)
          },
          (error) => {
            console.error('MapStore: Fallback GPS location error:', error)
            reject(error)
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000 // 1 minute
          }
        )
      }
    })
  }

  // Get current location (from cache or GPS)
  const getCurrentLocation = async (): Promise<{
    latitude: number
    longitude: number
    accuracy: number
    timestamp: number
  }> => {
    // If we have a recent location (less than 5 minutes old), use it
    if (currentLocation.value &&
      (Date.now() - currentLocation.value.timestamp) < 300000) {
      return currentLocation.value
    }

    // Otherwise, get fresh GPS location
    try {
      const location = await getGPSLocation()
      return location
    } catch (error) {
      console.error('Failed to get GPS location:', error)
      // Return cached location if available, even if old
      if (currentLocation.value) {
        return currentLocation.value
      }
      throw error
    }
  }

  // Set map instance (called by component)
  const setMap = (mapInstance: import('ol/Map').default): void => {
    map.value = mapInstance

    // Add Select interaction for plot selection with hover effects
    const selectInteraction = new Select({
      layers: (layer) => {
        // Only select from vector layers (plot layers)
        return layer instanceof VectorLayer
      },
      style: (feature) => {
        // Use the same dynamic style function as the layer
        return getPlotStyle(feature)
      }
    })

    // Add hover interaction for better visual feedback
    const hoverInteraction = new Select({
      layers: (layer) => {
        return layer instanceof VectorLayer
      },
      style: (feature) => {
        const plot = feature.get('plot')
        if (!plot) return hoverPlotStyle

        // Use normal hover style for all plots
        return hoverPlotStyle
      },
      condition: (event) => {
        // Only trigger on pointer move, not click
        return event.type === 'pointermove'
      }
    })

    selectInteraction.on('select', async (event: any) => {
      const selectedFeatures = event.selected
      if (selectedFeatures.length > 0) {
        const feature = selectedFeatures[0]
        const plot = feature.get('plot')
        if (plot) {
          console.log('Plot selected:', plot)
          selectedPlot.value = plot

          // Load persons for the selected plot
          try {
            const persons = await personsStore.loadPersonsByPlot(plot.id)
            selectedPlotPersons.value = persons
          } catch (error) {
            console.error('Error loading persons for plot:', error)
            selectedPlotPersons.value = []
          }
          
          // Force a small delay to ensure reactive queries update
          // This helps when a plot is just created and data might not be immediately available
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      } else {
        // No plot selected, clear both plot and persons
        selectedPlot.value = null
        selectedPlotPersons.value = []
      }
    })

    // Add hover effects
    hoverInteraction.on('select', (_event: any) => {
      // Optional: Add hover effects here if needed
      // For now, the visual styling is handled by the style function
    })

    mapInstance.addInteraction(selectInteraction)
    mapInstance.addInteraction(hoverInteraction)

    // Initialize the plots layer
    initializePlotsLayer()

    // Restore saved zoom level
    const savedZoom = loadZoomLevel()
    setZoomLevel(savedZoom)

    // Set up map event listeners
    if (mapInstance) {
      // Map click handler
      mapInstance.on('click', async (event: any) => {
        const coordinate = event.coordinate
        const [longitude, latitude] = toLonLat(coordinate)


        // Emit click event for other components
        window.dispatchEvent(new CustomEvent('map-click', {
          detail: { coordinate, longitude, latitude }
        }))
      })

      // Zoom change handler - save zoom level when user zooms
      mapInstance.getView().on('change:resolution', () => {
        const currentZoom = getCurrentZoom()
        if (currentZoom !== null) {
          saveZoomLevel(currentZoom)
        }

        // Refresh plot styles to update image scales based on new zoom level
        refreshPlotStyles()
      })

    }
  }

  // Center map on current location
  const centerOnLocation = (): void => {
    if (map.value && currentLocation.value) {
      const center = fromLonLat([currentLocation.value.longitude, currentLocation.value.latitude])

      // Get current zoom level to preserve it
      const currentZoom = map.value.getView().getZoom()

      map.value.getView().setCenter(center)
      // Only set zoom if we don't have a current zoom level (shouldn't happen in normal usage)
      if (currentZoom === undefined || currentZoom === null) {
        map.value.getView().setZoom(18) // Fallback zoom level
      }

    } else {
      console.warn('Cannot center on location: map or location not available')
    }
  }

  // Drawing mode management
  const toggleDrawingMode = (): void => {
    drawingMode.value = !drawingMode.value
  }

  const cancelDrawing = (): void => {
    drawingMode.value = false
    isDrawing.value = false
  }

  // Plot editing management
  const enablePlotEditing = (plot: any): void => {
    editingMode.value = true
    selectedPlot.value = plot
  }

  const disablePlotEditing = async (): Promise<void> => {
    editingMode.value = false
    selectedPlot.value = null
  }

  const updatePlot = (updatedPlot: any): void => {
    selectedPlot.value = updatedPlot
    console.log('Plot updated:', updatedPlot)
  }

  // Zoom to a specific plot and select it
  const zoomToPlot = async (plot: any): Promise<void> => {

    if (!map.value || !plot.geometry) {
      console.warn('Cannot zoom to plot: map or plot geometry not available')
      return
    }

    try {

      // Parse geometry
      const geometry = JSON.parse(plot.geometry) as { coordinates: number[][][] }
      const coordinates: number[][] = geometry.coordinates[0]

      // Check if coordinates are already in map projection or need conversion
      // Map projection coordinates (EPSG:3857) are typically much larger than lat/lng
      const isMapProjection = coordinates.some((coord: number[]) =>
        Math.abs(coord[0]) > 1000000 || Math.abs(coord[1]) > 1000000
      )

      let mapCoordinates
      if (isMapProjection) {
        mapCoordinates = coordinates
      } else {
        mapCoordinates = coordinates.map((coord: number[]) => fromLonLat(coord as [number, number]))
      }

      // Create a temporary polygon to get its extent
      const tempPolygon = new Polygon([mapCoordinates])
      const extent = tempPolygon.getExtent()

      // Fit the map view to the plot extent with some padding
      map.value.getView().fit(extent, {
        padding: [50, 50, 50, 50],
        duration: 500 // Reduced from 1000ms to 500ms for faster response
      })

      // Select the plot to show the popup
      selectedPlot.value = plot

      // Load persons for the selected plot
      try {
        const persons = await personsStore.loadPersonsByPlot(plot.id)
        selectedPlotPersons.value = persons
      } catch (error) {
        console.error('MapStore: Error loading persons for plot:', error)
        selectedPlotPersons.value = []
      }
      
      // Dispatch event to trigger image refetch for newly created plots
      // This ensures images appear in the popup even if they were just created
      window.dispatchEvent(new CustomEvent('plot-selected', {
        detail: { plotId: plot.id, plot }
      }))
      
      // Force a small delay to ensure reactive queries update
      // This helps when a plot is just created and data might not be immediately available
      await new Promise(resolve => setTimeout(resolve, 200))
    } catch (error) {
      console.error('MapStore: Error zooming to plot:', error)
    }
  }

  // Plot marker management
  const addPlotMarker = (plot: any): void => {
    if (!map.value || !plot.geometry) {
      console.warn('Cannot add plot marker: map or plot geometry not available')
      return
    }

    try {
      // Initialize plots layer if it doesn't exist
      if (!plotsLayer.value) {
        initializePlotsLayer()

        if (!plotsLayer.value) {
          console.error('❌ MapStore: Failed to create plots layer')
          return
        }
      }

      // Check if plot already exists in the layer
      const source = plotsLayer.value?.getSource()
      if (source) {
        const existingFeatures = source.getFeatures()
        const existingPlot = existingFeatures.find((feature: any) => feature.get('plot')?.id === plot.id)

        if (existingPlot) {
          return
        }
      }

      // Parse geometry
      const geometry = JSON.parse(plot.geometry) as { coordinates: number[][][] }
      const coordinates: number[][] = geometry.coordinates[0]

      // Check if coordinates are already in map projection (EPSG:3857) or need conversion from lat/lng (EPSG:4326)
      const isMapProjection = coordinates.some((coord: number[]) =>
        Math.abs(coord[0]) > 1000000 || Math.abs(coord[1]) > 1000000
      )

      let mapCoordinates
      if (isMapProjection) {
        mapCoordinates = coordinates
      } else {
        mapCoordinates = coordinates.map((coord: number[]) => fromLonLat(coord as [number, number]))
      }

      const plotFeature = new Feature({
        geometry: new Polygon([mapCoordinates]),
        plot: plot
      })

      if (plotsLayer.value) {
        const source = plotsLayer.value.getSource()
        source.addFeature(plotFeature)
      }

    } catch (error) {
      console.error('Error adding plot marker:', error)
    }
  }

  // Optimized version for batch loading (skips duplicate check)
  const addPlotMarkerOptimized = (plot: any): void => {
    if (!map.value || !plot.geometry || !plotsLayer.value) {
      return
    }

    try {
      // Parse geometry
      const geometry = JSON.parse(plot.geometry) as { coordinates: number[][][] }
      const coordinates: number[][] = geometry.coordinates[0]

      // Check if coordinates are already in map projection
      const isMapProjection = coordinates.some((coord: number[]) =>
        Math.abs(coord[0]) > 1000000 || Math.abs(coord[1]) > 1000000
      )

      let mapCoordinates
      if (isMapProjection) {
        mapCoordinates = coordinates
      } else {
        mapCoordinates = coordinates.map((coord: number[]) => fromLonLat(coord as [number, number]))
      }

      const plotFeature = new Feature({
        geometry: new Polygon([mapCoordinates]),
        plot: plot
      })

      const source = plotsLayer.value.getSource()
      source.addFeature(plotFeature)

    } catch (error) {
      console.error('Error adding plot marker:', error)
    }
  }

  // Remove plot marker from map
  const removePlotMarker = (plotId: string): void => {
    if (!plotsLayer.value) {
      console.warn('Cannot remove plot marker: plots layer not available')
      return
    }

    try {
      const source = plotsLayer.value.getSource()
      const features = source.getFeatures()
      const plotFeature = features.find((feature: any) => feature.get('plot')?.id === plotId)
      
      if (plotFeature) {
        source.removeFeature(plotFeature)
        
        // Clear selection if this plot was selected
        if (selectedPlot.value?.id === plotId) {
          selectedPlot.value = null
          selectedPlotPersons.value = []
        }
      }
    } catch (error) {
      console.error('Error removing plot marker:', error)
    }
  }

  // Enable in-place plot editing using Modify interaction
  const enableInPlacePlotEditing = async (plot: any) => {
    if (!map.value) return

    // Remove any existing modify interaction
    if (currentModifyInteraction.value) {
      map.value.removeInteraction(currentModifyInteraction.value)
      currentModifyInteraction.value = null
    }
    
    // No separate Select interaction to remove

    // Find the plot feature
    const layers = map.value.getLayers().getArray()
    let plotFeature = null
    let allFeatures: any[] = []

    for (const layer of layers) {
      if (layer.get('name') === 'plots') {
        const vectorLayer = layer as any
        const source = vectorLayer.getSource()
        const features = source.getFeatures()
        allFeatures = features // Store for error logging
        plotFeature = features.find((f: any) => {
          const plotData = f.get('plot')
          return plotData?.id === plot.id
        })
        if (plotFeature) {
          break
        }
      }
    }

    if (!plotFeature) {
      console.error('MapStore: Could not find plot feature for plot id:', plot.id)
      console.error('MapStore: Available plot features:', allFeatures.map((f: any) => f.get('plot')?.id))
      console.error('MapStore: Looking for plot id:', plot.id)
      return
    }

    // Disable the map's default Select interaction to prevent interference
    const interactions = map.value.getInteractions()
    const selectInteractions = interactions.getArray().filter(interaction => 
      interaction.constructor.name === 'Select'
    )
    
    // Store original Select interactions for restoration
    originalInteractions.value = selectInteractions.slice()
    
    // Disable Select interactions
    selectInteractions.forEach(interaction => {
      if (interaction.setActive) {
        interaction.setActive(false)
      }
    })

    // Import Transform interaction for scaling and rotating (ol-ext is optional, keep lazy)
    const { default: Transform } = await import('ol-ext/interaction/Transform') as any
    
    // Create a Select interaction to manage feature selection for Transform
    // Transform interaction works best when paired with a Select interaction
    const selectInteraction = new Select({
      hitTolerance: 5
    })
    
    // Add the feature to Select's features collection BEFORE creating Transform
    selectInteraction.getFeatures().push(plotFeature)
    
    // Store the Select interaction so we can remove it later
    currentSelectInteraction.value = selectInteraction as any
    
    // Get the features collection from Select (this is what Transform will use)
    const transformFeaturesCollection = selectInteraction.getFeatures()
    
    // Create Transform interaction using Select's features collection
    // This is the recommended pattern for ol-ext Transform
    const transformInteraction = new Transform({
      features: transformFeaturesCollection, // Use Select's features collection
      enableRotation: true,         // Enable rotation
      scale: true,                  // Allow scaling
      rotate: true,                 // Allow rotation
      translate: true,              // Allow translation/moving
      stretch: false,               // Disable stretching (individual vertex movement)
      pixelTolerance: 10,           // Pixel tolerance for interaction
      hitTolerance: 5,              // Hit tolerance for better interaction
      keepAspectRatio: false,       // Allow free scaling
      noFlip: false                 // Allow flipping
    })
    
    // If Transform didn't get the features, add them directly to Transform's collection
    if (transformInteraction.getFeatures().getLength() === 0) {
      transformInteraction.getFeatures().push(plotFeature)
    }
    
    // Ensure the Transform interaction is active
    setTimeout(() => {
      transformInteraction.setActive(true)
      if (map.value) {
        map.value.render()
      }
    }, 100)

    // Handle transform completion
    transformInteraction.on('transformend', async (event: any) => {
      // Get the transformed feature
      const transformedFeature = event.features.item(0)
      const transformedGeometry = transformedFeature.getGeometry()

      // Convert coordinates back to lat/lng (WGS84)
      // toLonLat returns [longitude, latitude] which is correct for GeoJSON
      const coordinates = transformedGeometry.getCoordinates()[0]
      const latLngCoordinates = coordinates.map((coord: number[]) => {
        const [lon, lat] = toLonLat(coord)
        return [lon, lat] // Ensure [lon, lat] format for GeoJSON
      })

      // Save the updated coordinates
      await saveInPlacePlotCoordinates(latLngCoordinates, plot.id)

      // Update the plot data in the feature to reflect the new geometry
      // This ensures the plot data stays in sync with the feature geometry
      const plotData = transformedFeature.get('plot')
      if (plotData) {
        plotData.geometry = JSON.stringify({
          type: 'Polygon',
          coordinates: [latLngCoordinates]
        })
        transformedFeature.set('plot', plotData)
      }
    })

    // Update editing state
    editingPlot.value = plot
    selectedPlot.value = plot
    editingMode.value = true
    currentModifyInteraction.value = transformInteraction as any

    // Add both Select and Transform interactions to the map
    // Select interaction is needed for Transform to work properly
    map.value.addInteraction(selectInteraction)
    map.value.addInteraction(transformInteraction)
    
    // Ensure the feature is selected and visible
    transformInteraction.setActive(true)
    
    // Force a map render to ensure the interaction is visible
    map.value.render()
    
    // Try to zoom to the feature to make sure it's visible
    const featureExtent = plotFeature.getGeometry().getExtent()
    const view = map.value.getView()
    view.fit(featureExtent, { padding: [50, 50, 50, 50], duration: 500 })
  }

  // Save plot coordinates after in-place editing
  const saveInPlacePlotCoordinates = async (newCoordinates: number[][], plotId: string): Promise<void> => {
    try {
      // Import required modules
      const { usePowerSyncStore } = await import('./powersync')

      // Create geometry from coordinates - store in lat/lng format (WGS84)
      // newCoordinates are already in [lon, lat] format from toLonLat conversion
      const geometry = {
        type: 'Polygon',
        coordinates: [newCoordinates] // Store directly as lat/lng, don't convert to map projection
      }

      const geometryString = JSON.stringify(geometry)

      // Update the plot in the database
      const powerSyncStore = usePowerSyncStore()
      await powerSyncStore.updatePlotGeometry(plotId, geometryString)
    } catch (error) {
      console.error('❌ MapStore: Error saving in-place plot coordinates:', error)
      throw error
    }
  }

  // Disable in-place plot editing
  const disableInPlacePlotEditing = async (): Promise<void> => {
    if (map.value) {
      // Remove Transform interaction
      if (currentModifyInteraction.value) {
        map.value.removeInteraction(currentModifyInteraction.value)
        currentModifyInteraction.value = null
      }
      
      // Remove Select interaction that was added for Transform
      if (currentSelectInteraction.value) {
        map.value.removeInteraction(currentSelectInteraction.value)
        currentSelectInteraction.value = null
      }
    }

    // Re-enable Select interactions
    if (originalInteractions.value.length > 0) {
      originalInteractions.value.forEach(interaction => {
        if (interaction.setActive) {
          interaction.setActive(true)
        }
      })
    }

    // Reset editing state
    editingPlot.value = null
    editingMode.value = false
    originalInteractions.value = []
  }

  // Refresh a specific plot layer after geometry update
  const refreshPlotLayer = async (plotId: string): Promise<void> => {
    if (!plotsLayer.value) {
      return
    }

    try {
      // Find and remove the specific plot feature
      const source = plotsLayer.value.getSource()
      const features = source.getFeatures()
      const plotFeature = features.find((feature: any) => feature.get('plot')?.id === plotId)

      if (plotFeature) {
        source.removeFeature(plotFeature)
      }

      // Re-add the plot with updated geometry
      const { usePlots } = await import('./powersync')
      const plotsStore = usePlots()

      if (plotsStore.data.value) {
        const updatedPlot = plotsStore.data.value.find(p => p.id === plotId)
        if (updatedPlot) {
          addPlotMarker(updatedPlot)
        }
      }
    } catch (error) {
      console.error('MapStore: Error refreshing plot layer:', error)
    }
  }


  // Refresh plot styles when selection changes
  const refreshPlotStyles = (): void => {
    if (!plotsLayer.value) return

    // Use dynamic style function that handles selection
    plotsLayer.value.setStyle(getPlotStyle)
  }

  // Watch for selectedPlot changes to update styles
  watch(selectedPlot, async (_newPlot) => {
    refreshPlotStyles()
  })

  // Initialize the store
  const initialize = async (): Promise<void> => {
    if (initialized.value) {
      return
    }
    await loadExtentConfiguration()
    watchLocation()
    initialized.value = true
  }

  // Clear selected plot and persons
  const clearSelectedPlot = () => {
    selectedPlot.value = null
    selectedPlotPersons.value = []
  }

  return {
    // State
    map,
    currentLocation,
    drawingMode,
    editingMode,
    selectedPlot,
    selectedPlotPersons,
    currentModifyInteraction,
    isDrawing,
    initialized,
    mapExtent,
    isExtentConfigured,
    isConfiguringExtent,
    mapBounds,
    mapConfig,
    tileSource,
    // Plot editing state
    editingPlot,
    // Actions
    setMap,
    centerOnLocation,
    toggleDrawingMode,
    cancelDrawing,
    enablePlotEditing,
    disablePlotEditing,
    updatePlot,
    zoomToPlot,
    addPlotMarker,
    addPlotMarkerOptimized,
    removePlotMarker,
    refreshPlotStyles,
    loadExtentConfiguration,
    startExtentConfiguration,
    finishExtentConfiguration,
    cancelExtentConfiguration,
    clearExtentConfiguration,
    getCurrentMapExtent,
    getGPSLocation,
    getCurrentLocation,
    // Plot editing actions  
    enableInPlacePlotEditing,
    disableInPlacePlotEditing,
    saveInPlacePlotCoordinates,
    refreshPlotLayer,
    clearSelectedPlot,
    // Zoom management
    getCurrentZoom,
    setZoomLevel,
    restoreZoomLevel,
    resetZoomLevel,
    saveZoomLevel,
    loadZoomLevel,
    // Style functions
    getPlotStyle,
    // Layer management
    initializePlotsLayer,
    plotsLayer,
    initialize
  }
}) 