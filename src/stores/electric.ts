import { defineStore } from 'pinia'
import { ref, computed, watch, type Ref, type ComputedRef, unref } from 'vue'
import { ShapeStream, Shape, FetchError } from '@electric-sql/client'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { 
  PlotRecord, 
  PlotImageRecord, 
  LocationRecord,
  PersonImageRecord
} from '../electric-schema'
import { useLocationsStore } from './locations'

export const useElectricStore = defineStore('electric', () => {
  // Electric Cloud URL - use env var or default to local proxy endpoint
  // The proxy endpoint handles CORS and adds the source secret securely
  const envUrl = import.meta.env.VITE_ELECTRIC_URL
  let baseUrl = envUrl || '/api/electric-shape'
  
  // Convert relative URLs to absolute URLs (ShapeStream requires absolute URLs)
  if (baseUrl.startsWith('/')) {
    // Get the current origin (e.g., http://localhost:5173 or https://yourdomain.com)
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'
    baseUrl = `${origin}${baseUrl}`
  }
  
  const electricUrl = ref<string>(baseUrl)
  
  // Warn if using direct Electric Cloud URL (will cause CORS issues)
  if (electricUrl.value.includes('api.electric-sql.cloud')) {
    console.warn('⚠️ [Electric Store] Using direct Electric Cloud URL. This will cause CORS errors!')
    console.warn('⚠️ [Electric Store] Please set VITE_ELECTRIC_URL=/api/electric-shape in your .env file')
  } else {
    console.log('✅ [Electric Store] Using proxy endpoint:', electricUrl.value)
  }
  
  // Electric Cloud source ID
  const sourceId = ref<string>(import.meta.env.VITE_ELECTRIC_SOURCE_ID || '')
  const isInitialized = ref(false)
  const isConnecting = ref(false)
  const error = ref<string | null>(null)

  // Supabase client for mutations and auth
  const supabaseClient: SupabaseClient = createClient(
    import.meta.env.VITE_SUPABASE_URL || '',
    import.meta.env.VITE_SUPABASE_ANON_KEY || '',
    {
      auth: {
        persistSession: true
      }
    }
  )

  // Get Supabase session token for Electric authentication
  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession()
      if (session?.access_token) {
        return {
          Authorization: `Bearer ${session.access_token}`
        }
      }
    } catch (err) {
      console.warn('Failed to get Supabase session:', err)
    }
    return {}
  }

  // Initialize Electric connection
  const initialize = async () => {
    if (isInitialized.value) {
      return
    }

    if (isConnecting.value) {
      // Wait for existing initialization
      while (isConnecting.value && !isInitialized.value) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      return
    }

    isConnecting.value = true
    error.value = null

    try {
      // Test connection by creating a simple shape stream
      const headers = await getAuthHeaders()
      new ShapeStream({
        url: electricUrl.value,
        params: addSourceIdToParams({
          table: 'locations',
          where: '1 = 0' // Empty query to test connection
        }),
        headers,
        onError: async (err: any) => {
          if (err instanceof FetchError && err.status === 401) {
            // Try to refresh token
            const newHeaders = await getAuthHeaders()
            if (newHeaders.Authorization) {
              return { headers: newHeaders }
            }
          }
          return {} // Retry with same params
        }
      })

      isInitialized.value = true
      console.log('✅ Electric SQL initialized')
    } catch (err) {
      console.error('Failed to initialize Electric SQL:', err)
      error.value = err instanceof Error ? err.message : 'Unknown error'
      isInitialized.value = false
    } finally {
      isConnecting.value = false
    }
  }

  // Helper function to add source_id to shape params
  // Note: When using a proxy endpoint, source_id is added server-side
  // This is kept for backwards compatibility but may not be needed with proxy
  const addSourceIdToParams = (params: any): any => {
    const paramsWithSource = { ...params }
    // Only add source_id if we're using Electric Cloud directly (not via proxy)
    // The proxy endpoint adds it server-side
    if (sourceId.value && electricUrl.value.includes('api.electric-sql.cloud')) {
      paramsWithSource.source_id = sourceId.value
    }
    return paramsWithSource
  }

  // Cleanup
  const cleanup = () => {
    console.log('Cleaning up Electric store...')
    isInitialized.value = false
    isConnecting.value = false
    error.value = null
  }

  // Plot operations
  const createNewPlot = async (plotData: Partial<PlotRecord>): Promise<PlotRecord> => {
    if (!isInitialized.value) {
      await initialize()
    }

    // Generate a unique ID for the plot
    const plotId = `plot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Ensure geometry is properly serialized as GeoJSON format
    let serializedGeometry: string | null = null
    if (plotData.geometry) {
      try {
        if (typeof plotData.geometry === 'string') {
          const parsed = JSON.parse(plotData.geometry)
          serializedGeometry = JSON.stringify(parsed)
        } else {
          serializedGeometry = JSON.stringify({
            type: 'Polygon',
            coordinates: [plotData.geometry]
          })
        }
      } catch (error) {
        console.error('Error serializing geometry:', error)
        throw new Error('Invalid geometry format')
      }
    }

    if (!serializedGeometry) {
      throw new Error('Geometry is required to create a plot')
    }

    // Only include fields that exist in the database schema
    // Filter out any camelCase or invalid fields (like createdAt, type, depth, location)
    const validFields: (keyof PlotRecord)[] = [
      'id', 'geometry', 'section', 'row', 'number', 'status', 
      'location_id', 'temp_plot_id', 'date_created', 'date_modified', 
      'created_by', 'modified_by', 'notes'
    ]
    
    const newPlot: Partial<PlotRecord> = {
      id: plotId,
      geometry: serializedGeometry,
      date_created: new Date().toISOString(),
      date_modified: new Date().toISOString(),
      created_by: 'anonymous',
      modified_by: 'anonymous'
    }
    
    // Only copy valid fields from plotData (exclude invalid fields like createdAt, type, depth, location)
    for (const key of validFields) {
      if (key in plotData && plotData[key as keyof typeof plotData] !== undefined) {
        newPlot[key] = plotData[key as keyof typeof plotData] as any
      }
    }
    
    // Ensure required fields have defaults
    if (!newPlot.section) newPlot.section = ''
    if (!newPlot.row) newPlot.row = ''
    if (!newPlot.number) newPlot.number = ''
    if (!newPlot.status) newPlot.status = ''
    if (!newPlot.location_id) newPlot.location_id = ''
    if (newPlot.notes === undefined) newPlot.notes = null
    if (newPlot.temp_plot_id === undefined) newPlot.temp_plot_id = null

    try {
      const { data, error: insertError } = await supabaseClient
        .from('plots')
        .insert(newPlot)
        .select()
        .single()

      if (insertError) throw insertError

      console.log('✅ Plot created successfully')
      console.log('📋 Plot data returned from Supabase:', data)
      
      // Ensure geometry is a string if it's not already
      const plotRecord = data as PlotRecord
      if (plotRecord.geometry && typeof plotRecord.geometry !== 'string') {
        plotRecord.geometry = JSON.stringify(plotRecord.geometry)
      }
      
      return plotRecord
    } catch (err) {
      console.error('Error creating plot:', err)
      throw err
    }
  }

  const updateExistingPlot = async (id: string, plotData: Partial<PlotRecord>): Promise<PlotRecord> => {
    // Get existing plot to preserve geometry if not provided
    const { data: existingPlot, error: fetchError } = await supabaseClient
      .from('plots')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !existingPlot) {
      throw new Error(`Plot with id ${id} not found`)
    }

    const updatedPlot = {
      ...plotData,
      id,
      date_modified: new Date().toISOString(),
      modified_by: 'anonymous',
      geometry: plotData.geometry ?? existingPlot.geometry
    }

    const { data, error: updateError } = await supabaseClient
      .from('plots')
      .update(updatedPlot)
      .eq('id', id)
      .select()
      .single()

    if (updateError) throw updateError

    return data as PlotRecord
  }

  const updatePlotGeometry = async (plotId: string, newGeometry: string): Promise<void> => {
    if (!isInitialized.value) {
      await initialize()
    }

    try {
      const { error: updateError } = await supabaseClient
        .from('plots')
        .update({
          geometry: newGeometry,
          date_modified: new Date().toISOString()
        })
        .eq('id', plotId)

      if (updateError) throw updateError

      console.log('✅ Plot geometry updated successfully')
    } catch (err) {
      console.error('Error updating plot geometry:', err)
      throw err
    }
  }

  const deletePlot = async (plotId: string): Promise<void> => {
    if (!isInitialized.value) {
      await initialize()
    }

    try {
      const { error: deleteError } = await supabaseClient
        .from('plots')
        .delete()
        .eq('id', plotId)

      if (deleteError) throw deleteError

      console.log('Plot deleted successfully')
    } catch (err) {
      console.error('Error deleting plot:', err)
      throw err
    }
  }

  const getPlotsByLocation = async (locationId: string): Promise<PlotRecord[]> => {
    if (!isInitialized.value) {
      await initialize()
    }

    const { data, error: fetchError } = await supabaseClient
      .from('plots')
      .select('*')
      .eq('location_id', locationId)
      .order('date_created', { ascending: false })

    if (fetchError) throw fetchError

    return (data || []) as PlotRecord[]
  }

  const findPlotByTempId = async (tempPlotId: string): Promise<PlotRecord | null> => {
    if (!isInitialized.value) {
      await initialize()
    }

    const { data, error: fetchError } = await supabaseClient
      .from('plots')
      .select('*')
      .eq('temp_plot_id', tempPlotId)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        // No rows returned
        return null
      }
      throw fetchError
    }

    return data as PlotRecord
  }

  const generateNextPlotNumber = async (): Promise<string> => {
    if (!isInitialized.value) {
      await initialize()
    }

    try {
      const { data: plots, error: fetchError } = await supabaseClient
        .from('plots')
        .select('number')

      if (fetchError) throw fetchError

      const existingNumbers = (plots || []).map((p: any) => parseInt(p.number) || 0)
      const maxNumber = Math.max(0, ...existingNumbers)
      const nextNumber = (maxNumber + 1).toString()

      return nextNumber
    } catch (error) {
      console.error('Error generating plot number:', error)
      // Fallback to localStorage-based number generation
      try {
        const stored = localStorage.getItem('lastPlotNumber')
        const lastNumber = stored ? parseInt(stored) : 0
        const nextNumber = (lastNumber + 1).toString()
        localStorage.setItem('lastPlotNumber', nextNumber)
        return nextNumber
      } catch (err) {
        // Ultimate fallback - use timestamp
        return Date.now().toString().slice(-6)
      }
    }
  }

  const addNewLocation = async (locationData: Omit<LocationRecord, 'id'>): Promise<LocationRecord> => {
    if (!isInitialized.value) {
      await initialize()
    }

    const locationId = `loc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const newLocation = {
      id: locationId,
      name: locationData.name,
      bbox: typeof locationData.bbox === 'string' ? locationData.bbox : JSON.stringify(locationData.bbox),
      min_zoom: '8',
      max_zoom: '18',
      pmtiles_url: locationData.pmtiles_url || null,
      date_created: new Date().toISOString(),
      date_modified: new Date().toISOString(),
      created_by: 'anonymous',
      is_public: locationData.is_public || 'false'
    }

    try {
      const { data, error: insertError } = await supabaseClient
        .from('locations')
        .insert(newLocation)
        .select()
        .single()

      if (insertError) throw insertError

      // Refresh the locations store
      const locationsStore = useLocationsStore()
      await locationsStore.loadLocations()
      locationsStore.selectLocation(data.id)

      return data as LocationRecord
    } catch (err) {
      console.error('Error creating location:', err)
      throw err
    }
  }

  const addPlotImage = async (
    plotId: string, 
    imageBlob: Blob, 
    fileName: string, 
    options: { analyzeForHeadstone?: boolean } = {}
  ): Promise<PlotImageRecord> => {
    if (!isInitialized.value) {
      await initialize()
    }

    const imageId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    try {
      // Import image processing service
      const { imageProcessingService } = await import('../utils/imageProcessingService')

      const file = new File([imageBlob], fileName, {
        type: imageBlob.type || 'image/jpeg',
        lastModified: Date.now()
      })

      // Process the image
      const processedImage = await imageProcessingService.processImage(file)

      const plotImage = {
        id: imageId,
        plot_id: plotId,
        file_name: fileName,
        data: '',
        thumbnail_data: processedImage.thumbnail,
        cloud_url: processedImage.cloudUrl,
        original_size: processedImage.metadata.originalSize.toString(),
        thumbnail_size: processedImage.metadata.thumbnailSize.toString(),
        dimensions: JSON.stringify(processedImage.metadata.dimensions),
        format: processedImage.metadata.format,
        date_created: new Date().toISOString(),
        created_by: 'anonymous'
      }

      const { data, error: insertError } = await supabaseClient
        .from('plot_images')
        .insert(plotImage)
        .select()
        .single()

      if (insertError) throw insertError

      // Trigger headstone analysis if requested
      if (options.analyzeForHeadstone && data) {
        try {
          const { headstoneAnalysisService } = await import('../utils/headstoneAnalysisService')
          const analysisResult = await headstoneAnalysisService.analyzeHeadstoneImage(file, plotId)

          if (analysisResult.success) {
            window.dispatchEvent(new CustomEvent('headstone-analysis-completed', {
              detail: { 
                plotId, 
                imageId: data.id,
                persons: analysisResult.persons,
                metadata: analysisResult.metadata
              }
            }))
          } else {
            window.dispatchEvent(new CustomEvent('headstone-analysis-failed', {
              detail: { 
                plotId, 
                imageId: data.id,
                error: analysisResult.error
              }
            }))
          }
        } catch (analysisError) {
          window.dispatchEvent(new CustomEvent('headstone-analysis-error', {
            detail: { 
              plotId, 
              imageId: data.id,
              error: analysisError instanceof Error ? analysisError.message : 'Unknown error'
            }
          }))
        }
      }

      return data as PlotImageRecord
    } catch (error) {
      console.error('Error processing image:', error)
      throw error
    }
  }

  const addPersonImage = async (personId: string, imageBlob: Blob, fileName: string): Promise<PersonImageRecord> => {
    if (!isInitialized.value) {
      await initialize()
    }

    const imageId = `person_img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    try {
      const { imageProcessingService } = await import('../utils/imageProcessingService')

      const file = new File([imageBlob], fileName, {
        type: imageBlob.type || 'image/jpeg',
        lastModified: Date.now()
      })

      const processedImage = await imageProcessingService.processImage(file)

      const personImage = {
        id: imageId,
        person_id: personId,
        file_name: fileName,
        data: '',
        thumbnail_data: processedImage.thumbnail,
        cloud_url: processedImage.cloudUrl,
        original_size: processedImage.metadata.originalSize.toString(),
        thumbnail_size: processedImage.metadata.thumbnailSize.toString(),
        dimensions: JSON.stringify(processedImage.metadata.dimensions),
        format: processedImage.metadata.format,
        date_created: new Date().toISOString(),
        created_by: 'anonymous'
      }

      const { data, error: insertError } = await supabaseClient
        .from('person_images')
        .insert(personImage)
        .select()
        .single()

      if (insertError) throw insertError

      return data as PersonImageRecord
    } catch (error) {
      console.error('Error processing person image:', error)
      throw error
    }
  }

  return {
    electricUrl: computed(() => electricUrl.value),
    sourceId: computed(() => sourceId.value),
    isInitialized: computed(() => isInitialized.value),
    isConnecting: computed(() => isConnecting.value),
    error: computed(() => error.value),
    supabaseClient,
    initialize,
    cleanup,
    addSourceIdToParams,
    createNewPlot,
    updateExistingPlot,
    updatePlotGeometry,
    deletePlot,
    generateNextPlotNumber,
    findPlotByTempId,
    getPlotsByLocation,
    addPlotImage,
    addPersonImage,
    addNewLocation,
    getAuthHeaders
  }
})

// Helper composables for reactive data using Electric SQL shapes
export const usePlots = () => {
  const electricStore = useElectricStore()
  const locationStore = useLocationsStore()
  const data = ref<PlotRecord[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  
  const selectedLocationId = computed(() => locationStore.selectedLocationId)
  
  const startWatch = async () => {
    if (!electricStore.isInitialized) {
      await electricStore.initialize()
    }
    
    const locationId = selectedLocationId.value
    if (!locationId) {
      data.value = []
      loading.value = false
      return
    }
    
    loading.value = true
    error.value = null
    
    // Check if offline - fall back to direct Supabase query
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine
    if (isOffline) {
      console.log('📊 [usePlots] Offline detected, falling back to Supabase query')
      try {
        const { data: plots, error: queryError } = await electricStore.supabaseClient
          .from('plots')
          .select('*')
          .eq('location_id', locationId)
        
        if (queryError) {
          throw queryError
        }
        
        data.value = (plots || []) as PlotRecord[]
        loading.value = false
        console.log('📊 [usePlots] Loaded plots from Supabase (offline):', data.value.length)
        return
      } catch (err) {
        console.error('❌ [usePlots] Error loading plots from Supabase (offline):', err)
        error.value = err instanceof Error ? err.message : 'Failed to load plots offline'
        loading.value = false
        // Keep existing data if available
        return
      }
    }
    
    try {
      const headers = await electricStore.getAuthHeaders()
      const electricUrl = electricStore.electricUrl
      
      console.log('📊 [usePlots] Creating ShapeStream:', {
        url: electricUrl,
        locationId,
        hasAuth: !!headers.Authorization,
        envUrl: import.meta.env.VITE_ELECTRIC_URL,
        usingProxy: electricUrl.includes('/api/')
      })
      
      const stream = new ShapeStream({
        url: electricUrl,
        params: electricStore.addSourceIdToParams({
          table: 'plots',
          where: `location_id = $1`,
          params: { '1': String(locationId) }
        }),
        headers,
        onError: async (err: any) => {
          // Check if error is due to network/offline
          const isNetworkError = err instanceof FetchError && 
            (err.message.includes('ERR_INTERNET_DISCONNECTED') || 
             err.message.includes('Failed to fetch') ||
             err.status === 0)
          
          if (isNetworkError) {
            console.log('📊 [usePlots] Network error detected, falling back to Supabase query')
            try {
              const { data: plots, error: queryError } = await electricStore.supabaseClient
                .from('plots')
                .select('*')
                .eq('location_id', locationId)
              
              if (queryError) {
                throw queryError
              }
              
              data.value = (plots || []) as PlotRecord[]
              loading.value = false
              console.log('📊 [usePlots] Loaded plots from Supabase (fallback):', data.value.length)
              return {}
            } catch (fallbackErr) {
              console.error('❌ [usePlots] Error loading plots from Supabase (fallback):', fallbackErr)
              error.value = 'Offline - unable to load plots'
              loading.value = false
              return {}
            }
          }
          
          console.error('❌ [usePlots] ShapeStream error:', err)
          console.error('❌ [usePlots] Error details:', {
            message: err instanceof Error ? err.message : String(err),
            status: err instanceof FetchError ? err.status : undefined,
            stack: err instanceof Error ? err.stack : undefined,
            url: electricUrl,
            locationId
          })
          if (err instanceof FetchError && err.status === 401) {
            console.log('📊 [usePlots] 401 error, refreshing auth token')
            const newHeaders = await electricStore.getAuthHeaders()
            if (newHeaders.Authorization) {
              return { headers: newHeaders }
            }
          }
          error.value = err instanceof Error ? err.message : 'Unknown error'
          loading.value = false
          return {}
        }
      })
      
      console.log('📊 [usePlots] ShapeStream created, creating Shape...')
      
      const shape = new Shape(stream)
      
      console.log('📊 [usePlots] Setting up shape subscription for location:', locationId)
      
      shape.subscribe((shapeData: any) => {
        console.log('📊 [usePlots] Shape data received:', shapeData, 'Type:', typeof shapeData, 'Is array:', Array.isArray(shapeData))
        
        // Electric SQL materializes the shape into an object
        // The shape data structure depends on Electric's response format
        // Typically it's an object with table names as keys
        if (shapeData && Array.isArray(shapeData)) {
          console.log('📊 [usePlots] Shape data is array, setting plots:', shapeData.length)
          data.value = shapeData
        } else if (shapeData?.plots) {
          console.log('📊 [usePlots] Shape data has plots property, setting plots:', shapeData.plots.length)
          data.value = shapeData.plots
        } else if (shapeData && typeof shapeData === 'object') {
          // Try to extract plots from various possible structures
          const plots = Object.values(shapeData).find((val: any) => Array.isArray(val)) as PlotRecord[] | undefined
          if (plots) {
            console.log('📊 [usePlots] Found plots in shape data object, setting plots:', plots.length)
            data.value = plots
          } else {
            console.warn('📊 [usePlots] Shape data is object but no plots array found:', Object.keys(shapeData))
          }
        } else {
          console.warn('📊 [usePlots] Unexpected shape data format:', shapeData)
        }
        loading.value = false
      })
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Watch failed'
      loading.value = false
      console.error('❌ [usePlots] Error setting up plots watch:', err)
      console.error('❌ [usePlots] Error details:', {
        message: err instanceof Error ? err.message : 'Unknown error',
        stack: err instanceof Error ? err.stack : undefined,
        locationId
      })
    }
  }
  
  watch([selectedLocationId, () => electricStore.isInitialized], async ([locationId, initialized]) => {
    console.log('📊 [usePlots] Watcher triggered:', { locationId, initialized })
    if (initialized && locationId) {
      console.log('📊 [usePlots] Starting watch for location:', locationId)
      await startWatch()
    } else {
      console.log('📊 [usePlots] Clearing data - locationId:', locationId, 'initialized:', initialized)
      data.value = []
    }
  }, { immediate: true })
  
  return {
    data: computed(() => data.value),
    loading: computed(() => loading.value),
    error: computed(() => error.value),
    refetch: startWatch
  }
}

export const usePlot = (id: string | Ref<string> | ComputedRef<string>) => {
  const electricStore = useElectricStore()
  const data = ref<PlotRecord | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  
  const plotIdRef = typeof id === 'string' ? ref(id) : id
  
  const startWatch = async () => {
    if (!electricStore.isInitialized) {
      await electricStore.initialize()
    }
    
    const currentPlotId = unref(plotIdRef)
    if (!currentPlotId) {
      data.value = null
      loading.value = false
      return
    }
    
    loading.value = true
    error.value = null
    
    try {
      const headers = await electricStore.getAuthHeaders()
      
      const stream = new ShapeStream({
        url: electricStore.electricUrl,
        params: electricStore.addSourceIdToParams({
          table: 'plots',
          where: `id = $1::text`,
          params: { '1': String(currentPlotId) }
        }),
        headers,
        onError: async (err: any) => {
          if (err instanceof FetchError && err.status === 401) {
            const newHeaders = await electricStore.getAuthHeaders()
            if (newHeaders.Authorization) {
              return { headers: newHeaders }
            }
          }
          error.value = err instanceof Error ? err.message : 'Unknown error'
          return {}
        }
      })
      
      const shape = new Shape(stream)
      
      shape.subscribe((shapeData: any) => {
        if (shapeData && Array.isArray(shapeData) && shapeData.length > 0) {
          data.value = shapeData[0] as PlotRecord
        } else if (shapeData?.plots && Array.isArray(shapeData.plots) && shapeData.plots.length > 0) {
          data.value = shapeData.plots[0] as PlotRecord
        } else {
          data.value = null
        }
        loading.value = false
      })
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Watch failed'
      loading.value = false
      console.error('Error setting up plot watch:', err)
    }
  }
  
  watch([plotIdRef, () => electricStore.isInitialized], async ([plotId, initialized]) => {
    if (initialized && plotId) {
      await startWatch()
    } else {
      data.value = null
    }
  }, { immediate: true })
  
  return {
    data: computed(() => data.value),
    loading: computed(() => loading.value),
    error: computed(() => error.value),
    refetch: startWatch
  }
}

export const usePlotImages = (plotId: string | Ref<string> | ComputedRef<string>) => {
  const electricStore = useElectricStore()
  const data = ref<PlotImageRecord[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  
  const plotIdRef = typeof plotId === 'string' ? ref(plotId) : plotId
  
  const startWatch = async () => {
    if (!electricStore.isInitialized) {
      await electricStore.initialize()
    }
    
    const currentPlotId = unref(plotIdRef)
    if (!currentPlotId) {
      data.value = []
      loading.value = false
      return
    }
    
    
    loading.value = true
    error.value = null
    
    try {
      const headers = await electricStore.getAuthHeaders()
      
      const stream = new ShapeStream({
        url: electricStore.electricUrl,
        params: electricStore.addSourceIdToParams({
          table: 'plot_images',
          where: `plot_id = $1::text`,
          params: { '1': String(currentPlotId) }
        }),
        headers,
        onError: async (err: any) => {
          if (err instanceof FetchError && err.status === 401) {
            const newHeaders = await electricStore.getAuthHeaders()
            if (newHeaders.Authorization) {
              return { headers: newHeaders }
            }
          }
          error.value = err instanceof Error ? err.message : 'Unknown error'
          return {}
        }
      })
      
      const shape = new Shape(stream)
      
      shape.subscribe((shapeData: any) => {
        if (shapeData && Array.isArray(shapeData)) {
          data.value = shapeData as PlotImageRecord[]
        } else if (shapeData?.plot_images) {
          data.value = shapeData.plot_images as PlotImageRecord[]
        } else if (shapeData && typeof shapeData === 'object') {
          const images = Object.values(shapeData).find((val: any) => Array.isArray(val)) as PlotImageRecord[] | undefined
          if (images) {
            data.value = images
          }
        }
        loading.value = false
      })
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Watch failed'
      loading.value = false
      console.error('Error setting up plot images watch:', err)
    }
  }
  
  watch([plotIdRef, () => electricStore.isInitialized], async ([plotId, initialized]) => {
    if (initialized && plotId) {
      await startWatch()
    } else {
      data.value = []
    }
  }, { immediate: true })
  
  return {
    data: computed(() => data.value),
    loading: computed(() => loading.value),
    error: computed(() => error.value),
    refetch: startWatch
  }
}

