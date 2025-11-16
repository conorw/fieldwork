import { defineStore } from 'pinia'
import { ref, computed, watch, type Ref, type ComputedRef, unref } from 'vue'
import { PowerSyncDatabase } from '@powersync/web'
import { AppSchema, type PlotRecord, type PlotImageRecord, type LocationRecord } from '../powersync-schema'
import { SupabaseConnector } from '../connectors/SupabaseConnector'
import { createBaseLogger, LogLevel } from '@powersync/web';
import { useLocationsStore } from './locations'

console.log('PowerSync: PowerSyncDatabase import:', PowerSyncDatabase)
console.log('PowerSync: AppSchema import:', AppSchema)

export const usePowerSyncStore = defineStore('powersync', () => {
  const powerSync = ref<PowerSyncDatabase | null>(null)
  const isInitialized = ref(false)
  const isConnecting = ref(false)
  const error = ref<string | null>(null)
  const lastSyncTime = ref<string | null>(null)
  const syncStatus = ref<string>('not_started')
  const pendingUploads = ref<number>(0)
  const locationStore = useLocationsStore()
  const logger = createBaseLogger();

  // Configure the logger to use the default console output
  logger.useDefaults();

  // Set the minimum log level to DEBUG to see all log messages
  // Available levels: DEBUG, INFO, WARN, ERROR, TRACE, OFF
  logger.setLevel(LogLevel.DEBUG);

  let db: PowerSyncDatabase | null = null
  let initializationPromise: Promise<PowerSyncDatabase | null> | null = null

  try {
    const dbCreationStart = performance.now()
    console.log(`[${new Date().toISOString()}] PowerSync: Creating database instance...`)
    console.log('PowerSync: PowerSyncDatabase constructor:', PowerSyncDatabase)
    console.log('PowerSync: AppSchema for database:', AppSchema)

    db = new PowerSyncDatabase({
      schema: AppSchema,
      database: {
        dbFilename: 'fieldwork-powersync.db',
        debugMode: true
      },
      flags: {
        // Use WebWorker for background sync operations https://docs.powersync.com/resources/troubleshooting
        enableMultiTabs: false,
        broadcastLogs: true
      }
    });
    const dbCreationEnd = performance.now()
    // Add ability to clear database on schema mismatch
    // Uncomment the next line to reset the database and clear the schema mismatch warning
    // db.close({ clearData: true }).then(() => {
    //   console.log('Database cleared due to schema mismatch')
    //   window.location.reload()
    // })
    console.log(`PowerSync: Database instance created in ${(dbCreationEnd - dbCreationStart).toFixed(2)}ms`)
    console.log('PowerSync: Database instance created successfully:', db)
    console.log('PowerSync: Database ready state:', db.ready)
    console.log('PowerSync: Database closed state:', db.closed)
  } catch (dbError) {
    console.error('PowerSync: Failed to create database instance:', dbError)
    console.error('PowerSync: Error details:', {
      message: dbError instanceof Error ? dbError.message : 'Unknown error',
      stack: dbError instanceof Error ? dbError.stack : undefined,
      name: dbError instanceof Error ? dbError.name : undefined
    })
    // Don't throw the error - let the app continue without PowerSync
    console.warn('PowerSync: Continuing without database - app will work in offline mode')
  }

  // Initialize PowerSync client
  const initialize = async () => {
    const callStack = new Error().stack?.split('\n')[2]?.trim() || 'unknown'
    console.log(`🔧 [PowerSync] initialize() called from: ${callStack}`)
    
    // If already initialized, return immediately
    if (isInitialized.value && powerSync.value) {
      console.log('✅ [PowerSync] Already initialized, returning existing instance')
      return powerSync.value
    }

    // If initialization is in progress, wait for it to complete
    if (isConnecting.value && initializationPromise) {
      console.log(`⏳ [PowerSync] Initialization in progress (called from ${callStack}), waiting for existing initialization to complete...`)
      return initializationPromise
    }

    // If no database instance, can't initialize
    if (!db) {
      console.warn('PowerSync: Database instance is null, cannot initialize - continuing in offline mode')
      error.value = 'Database instance is null - running in offline mode'
      // Set as initialized even without database so the app can continue
      isInitialized.value = true
      return null
    }

    console.log(`🚀 [PowerSync] Starting NEW initialization (called from ${callStack})`)
    
    // Set connecting flag BEFORE creating promise to prevent race condition
    isConnecting.value = true
    error.value = null
    
    // Create the initialization promise and store it
    initializationPromise = (async () => {

    try {
      const initStart = performance.now()
      console.log(`[${new Date().toISOString()}] Initializing PowerSync store...`)
      console.log('PowerSync: AppSchema:', AppSchema)
      console.log('PowerSync: Database instance before init:', db)
      // Initialize the database first
      console.log('PowerSync: Starting database initialization...')

      const connectorStart = performance.now()
      const connector = new SupabaseConnector();
      const connectorEnd = performance.now()
      console.log(`PowerSync: SupabaseConnector created in ${(connectorEnd - connectorStart).toFixed(2)}ms`, {
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
        powersyncUrl: import.meta.env.VITE_POWERSYNC_URL,
        hasAnonKey: !!import.meta.env.VITE_SUPABASE_ANON_KEY
      });
      const connectStart = performance.now()
      console.log(`[${new Date().toISOString()}] PowerSync: Connecting to Supabase...`);
      await db.connect(connector);
      const connectEnd = performance.now()
      console.log(`[${new Date().toISOString()}] PowerSync: Connected to Supabase successfully in ${(connectEnd - connectStart).toFixed(2)}ms`);
      console.log(`PowerSync: Connection breakdown - Total: ${(connectEnd - initStart).toFixed(2)}ms (Connector: ${(connectorEnd - connectorStart).toFixed(2)}ms, Connect: ${(connectEnd - connectStart).toFixed(2)}ms)`);
      
      // Add global error handler for JWT expiration
      // Note: PowerSyncDatabase doesn't have addEventListener, but the connector handles errors
      console.log('🔄 PowerSync: JWT refresh handling enabled via connector');
      
      // await db.init();
      // Check database ready state
      console.log('PowerSync: Database ready state check:', {
        db: !!db,
        ready: db?.ready,
        closed: db?.closed
      });
      // Create PowerSync database instance
      console.log('PowerSync: Creating database with schema:', AppSchema)
      console.log('PowerSync: Database instance created:', db)
      // Check if Supabase environment variables are available (but don't connect yet)
      const hasSupabaseConfig = import.meta.env.VITE_SUPABASE_URL &&
        import.meta.env.VITE_SUPABASE_ANON_KEY &&
        import.meta.env.VITE_POWERSYNC_URL;

      if (hasSupabaseConfig) {
        console.log('PowerSync: Supabase configuration available but not connecting yet')
      } else {
        console.log('PowerSync: Supabase configuration not available, running in offline mode only')
      }

      const finalCheckStart = performance.now()
      powerSync.value = db
      isInitialized.value = true
      lastSyncTime.value = new Date().toISOString()
      const finalCheckEnd = performance.now()

      // Pre-warm wa-sqlite with a simple query to avoid first-query penalty
      // This initializes the WASM module and IndexedDB connection
      try {
        const warmupStart = performance.now()
        console.log('🔥 [PowerSync] Pre-warming wa-sqlite with simple query...')
        await db.execute('SELECT 1')
        const warmupEnd = performance.now()
        console.log(`🔥 [PowerSync] wa-sqlite pre-warmed in ${(warmupEnd - warmupStart).toFixed(2)}ms`)
      } catch (warmupError) {
        console.warn('⚠️ [PowerSync] Pre-warm query failed (non-critical):', warmupError)
      }

      const totalTime = performance.now() - initStart
      console.log(`PowerSync: Final state setup took ${(finalCheckEnd - finalCheckStart).toFixed(2)}ms`)
      console.log(`[${new Date().toISOString()}] PowerSync store initialized successfully in ${totalTime.toFixed(2)}ms`)
      console.log(`PowerSync: Init breakdown - Connector: ${(connectorEnd - connectorStart).toFixed(2)}ms, Connect: ${(connectEnd - connectStart).toFixed(2)}ms, Final: ${(finalCheckEnd - finalCheckStart).toFixed(2)}ms, Total: ${totalTime.toFixed(2)}ms`)
      return db
    } catch (err) {
      console.error('Failed to initialize PowerSync store:', err)
      console.error('Error details:', {
        message: err instanceof Error ? err.message : 'Unknown error',
        stack: err instanceof Error ? err.stack : undefined,
        name: err instanceof Error ? err.name : undefined
      })
      error.value = err instanceof Error ? err.message : 'Unknown error'
      // Don't throw the error - let the app continue in offline mode
      console.warn('PowerSync initialization failed, continuing in offline mode')
      return null
    } finally {
      isConnecting.value = false
      // Clear the promise so future calls can create a new one if needed
      initializationPromise = null
    }
    })()

    // Return the promise so concurrent callers can wait for it
    return initializationPromise
  }

  // Cleanup
  const cleanup = () => {
    console.log('Cleaning up PowerSync store...')
    if (powerSync.value) {
      powerSync.value.disconnect()
    }
    powerSync.value = null
    isInitialized.value = false
    error.value = null
    lastSyncTime.value = null
  }

  // Clear all PowerSync data from browser
  const clearAllPowerSyncData = async () => {
    console.log('PowerSync: Clearing all PowerSync data from browser...')

    try {
      // Clear localStorage PowerSync data
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes('powersync')) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach(key => {
        console.log('PowerSync: Removing localStorage key:', key);
        localStorage.removeItem(key);
      });

      console.log('PowerSync: All PowerSync data cleared successfully');
      return true;
    } catch (error) {
      console.error('PowerSync: Error clearing PowerSync data:', error);
      return false;
    }
  }

  // Clear all data
  const clearAllData = async () => {
    if (!powerSync.value) return

    try {
      // Clear all tables
      await powerSync.value.execute('DELETE FROM plots')
      await powerSync.value.execute('DELETE FROM settings')
      await powerSync.value.execute('DELETE FROM plot_images')
      await powerSync.value.execute('DELETE FROM locations')
      console.log('All PowerSync data cleared')
    } catch (err) {
      console.error('Error clearing PowerSync data:', err)
      throw err
    }
  }

  // Plot operations
  const createNewPlot = async (plotData: Omit<PlotRecord, 'id'>): Promise<PlotRecord> => {
    console.log('PowerSync: createNewPlot called')
    console.log('PowerSync: powerSync.value:', powerSync.value)
    console.log('PowerSync: isInitialized:', isInitialized.value)

    if (!powerSync.value) {
      console.error('PowerSync: PowerSync not initialized')
      throw new Error('PowerSync not initialized')
    }

    // Generate a unique ID for the plot
    const plotId = `plot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Ensure geometry is properly serialized as GeoJSON format
    let serializedGeometry: string | null = null
    if (plotData.geometry) {
      try {
        // If geometry is already a string (JSON), parse and re-stringify to ensure valid format
        if (typeof plotData.geometry === 'string') {
          const parsed = JSON.parse(plotData.geometry)
          serializedGeometry = JSON.stringify(parsed)
        } else {
          // If geometry is an array of coordinates, wrap in GeoJSON Polygon format
          serializedGeometry = JSON.stringify({
            type: 'Polygon',
            coordinates: [plotData.geometry]
          })
        }
      } catch (error) {
        console.error('PowerSync: Error serializing geometry:', error)
        throw new Error('Invalid geometry format')
      }
    }
    
    if (!serializedGeometry) {
      throw new Error('Geometry is required to create a plot')
    }
    
    console.log('PowerSync: Original geometry type:', typeof plotData.geometry, 'isProxy:', plotData.geometry?.constructor?.name)
    console.log('PowerSync: Serialized geometry as JSON string:', serializedGeometry)
    
    const newPlot = {
      ...plotData,
      geometry: serializedGeometry,
      id: plotId,
      date_created: new Date().toISOString(),
      date_modified: new Date().toISOString(),
      created_by: 'anonymous',
      modified_by: 'anonymous'
    }

    console.log('PowerSync: Creating plot with ID:', plotId)
    console.log('PowerSync: Plot data:', newPlot)

    try {
      console.log('🔄 PowerSync: Starting plot creation process...')
      console.log('🔄 PowerSync: Plot data to insert:', {
        id: newPlot.id,
        section: newPlot.section,
        row: newPlot.row,
        number: newPlot.number,
        status: newPlot.status
      })

      // Include the ID in the INSERT statement
      // Note: photos column removed - use plot_images table instead
      await powerSync.value.execute(
        'INSERT INTO plots (id, geometry, section, row, number, status, location_id, temp_plot_id, date_created, date_modified, created_by, modified_by, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [newPlot.id, newPlot.geometry, newPlot.section, newPlot.row, newPlot.number, newPlot.status, newPlot.location_id || null, newPlot.temp_plot_id || null, newPlot.date_created, newPlot.date_modified, newPlot.created_by, newPlot.modified_by, newPlot.notes || '']
      )

      console.log('✅ PowerSync: Plot inserted into local database successfully')
      console.log('🔄 PowerSync: Plot will be queued for sync to remote database')

      // Update sync status
      syncStatus.value = 'local_saved'
      pendingUploads.value += 1

      // Get the created plot by ID
      const createdPlot = await powerSync.value.get('SELECT * FROM plots WHERE id = ?', [plotId]) as PlotRecord

      console.log('✅ PowerSync: Retrieved created plot from local database:', createdPlot)
      console.log('🔄 PowerSync: Plot is now ready for background sync')

      return createdPlot
    } catch (error) {
      console.error('❌ PowerSync: Error creating plot:', error)
      syncStatus.value = 'error'
      throw error
    }
  }

  const updateExistingPlot = async (id: string, plotData: Partial<PlotRecord>): Promise<PlotRecord> => {
    if (!powerSync.value) throw new Error('PowerSync not initialized')

    // Get existing plot to preserve geometry if not provided in update
    const existingPlot = await powerSync.value.get('SELECT * FROM plots WHERE id = ?', [id]) as PlotRecord | null
    if (!existingPlot) {
      throw new Error(`Plot with id ${id} not found`)
    }

    const updatedPlot: PlotRecord = {
      ...existingPlot, // Preserve all existing fields
      ...plotData, // Override with new data
      id,
      date_modified: new Date().toISOString(),
      modified_by: 'anonymous',
      // Ensure geometry is always set - use existing if not provided
      geometry: plotData.geometry ?? existingPlot.geometry
    } as PlotRecord

    // Note: photos column removed - use plot_images table instead
    await powerSync.value.execute(
      'UPDATE plots SET geometry = ?, section = ?, row = ?, number = ?, status = ?, location_id = ?, date_modified = ?, modified_by = ?, notes = ? WHERE id = ?',
      [updatedPlot.geometry, updatedPlot.section, updatedPlot.row, updatedPlot.number, updatedPlot.status, updatedPlot.location_id || null, updatedPlot.date_modified, updatedPlot.modified_by, updatedPlot.notes || '', id]
    )

    // Get the updated plot
    const result = await powerSync.value.get('SELECT * FROM plots WHERE id = ?', [id]) as PlotRecord
    return result
  }

  // Get plots by location
  const getPlotsByLocation = async (locationId: string): Promise<PlotRecord[]> => {
    if (!powerSync.value) throw new Error('PowerSync not initialized')

    const plots = await powerSync.value.getAll('SELECT * FROM plots WHERE location_id = ? ORDER BY date_created DESC', [locationId])
    return plots as PlotRecord[]
  }

  const findPlotByTempId = async (tempPlotId: string): Promise<PlotRecord | null> => {
    if (!powerSync.value) throw new Error('PowerSync not initialized')
    try {
      const plot = await powerSync.value.get('SELECT * FROM plots WHERE temp_plot_id = ?', [tempPlotId]) as PlotRecord
      return plot
    } catch (error) {
      // If result set is empty, return null instead of throwing
      if (error instanceof Error && error.message.includes('Result set is empty')) {
        return null
      }
      throw error
    }
  }

  const addNewLocation = async (locationData: Omit<LocationRecord, 'id'>): Promise<LocationRecord> => {
    if (!powerSync.value) throw new Error('PowerSync not initialized')

    const locationId = `loc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Ensure all data is properly serialized for PowerSync
    const newLocation = {
      id: locationId,
      name: locationData.name,
      bbox: typeof locationData.bbox === 'string' ? locationData.bbox : JSON.stringify(locationData.bbox),
      min_zoom: 8,
      max_zoom: 18,
      pmtiles_url: locationData.pmtiles_url || '',
      date_created: new Date().toISOString(),
      created_by: 'anonymous',
      is_public: locationData.is_public ? 'true' : 'false'
    }

    console.log('PowerSync: Inserting location into database:', newLocation);
    await powerSync.value.execute(
      'INSERT INTO locations (id, name, bbox, min_zoom, max_zoom, pmtiles_url, date_created, created_by, is_public) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [newLocation.id, newLocation.name, newLocation.bbox, newLocation.min_zoom, newLocation.max_zoom, newLocation.pmtiles_url, newLocation.date_created, newLocation.created_by, newLocation.is_public]
    )
    console.log('PowerSync: Location inserted successfully, checking sync status...');

    // Check if PowerSync is connected and ready to sync
    console.log('PowerSync: Database ready state:', powerSync.value.ready);
    console.log('PowerSync: Database closed state:', powerSync.value.closed);

    // Get the last inserted location (PowerSync auto-generates the ID)
    const createdLocation = await powerSync.value.get('SELECT * FROM locations ORDER BY id DESC LIMIT 1') as LocationRecord
    console.log('PowerSync: Retrieved created location:', createdLocation);

    // Refresh the locations store to include the new location
    await locationStore.loadLocations()

    locationStore.selectLocation(createdLocation.id)
    return createdLocation
  }

  const addPersonImage = async (personId: string, imageBlob: Blob, fileName: string): Promise<any> => {
    if (!powerSync.value) throw new Error('PowerSync not initialized')

    // Generate a unique ID for the image
    const imageId = `person_img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    console.log('🔄 PowerSync: Starting hybrid image processing for person...')
    console.log('🔄 PowerSync: Processing image:', fileName, imageBlob.size, 'bytes')

    try {
      // Import image processing service
      const { imageProcessingService } = await import('../utils/imageProcessingService')

      // Convert Blob to File object with proper properties
      const file = new File([imageBlob], fileName, {
        type: imageBlob.type || 'image/jpeg',
        lastModified: Date.now()
      })

      console.log('PowerSync: Created File object:', {
        name: file.name,
        size: file.size,
        type: file.type
      })

      // Process the image (create thumbnails and upload to cloud)
      const processedImage = await imageProcessingService.processImage(file)

      const personImage = {
        id: imageId,
        person_id: personId,
        file_name: fileName,
        data: '', // DO NOT store full-size images - use empty string instead of null (database constraint)
        thumbnail_data: processedImage.thumbnail,
        cloud_url: processedImage.cloudUrl,
        original_size: processedImage.metadata.originalSize.toString(),
        thumbnail_size: processedImage.metadata.thumbnailSize.toString(),
        dimensions: JSON.stringify(processedImage.metadata.dimensions),
        format: processedImage.metadata.format,
        date_created: new Date().toISOString(),
        created_by: 'anonymous'
      }

      console.log('🔄 PowerSync: Hybrid person image data to insert:', {
        id: personImage.id,
        person_id: personImage.person_id,
        file_name: personImage.file_name,
        thumbnail_size: personImage.thumbnail_size,
        original_size: personImage.original_size,
        cloud_url: personImage.cloud_url
      })

      await powerSync.value.execute(
        'INSERT INTO person_images (id, person_id, file_name, data, thumbnail_data, cloud_url, original_size, thumbnail_size, dimensions, format, date_created, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [personImage.id, personImage.person_id, personImage.file_name, personImage.data, personImage.thumbnail_data, personImage.cloud_url, personImage.original_size, personImage.thumbnail_size, personImage.dimensions, personImage.format, personImage.date_created, personImage.created_by]
      )

      console.log('✅ PowerSync: Hybrid person image inserted into local database successfully')
      console.log('🔄 PowerSync: Image will be queued for sync to remote database')

      // Update sync status
      pendingUploads.value += 1

      // Get the created image by ID
      const createdImage = await powerSync.value.get('SELECT * FROM person_images WHERE id = ?', [imageId]) as any

      console.log('✅ PowerSync: Retrieved created hybrid person image from local database:', {
        id: createdImage.id,
        person_id: createdImage.person_id,
        file_name: createdImage.file_name,
        has_thumbnail: !!createdImage.thumbnail_data,
        has_cloud_url: !!createdImage.cloud_url
      })
      console.log('🔄 PowerSync: Hybrid person image is now ready for background sync')

      return createdImage

    } catch (error) {
      console.error('❌ PowerSync: Error processing hybrid person image:', error)

      // DO NOT store full-size images even in error cases
      // Try to create at least a thumbnail, or store nothing
      console.log('🔄 PowerSync: Attempting to create thumbnail only (no full-size storage)...')

      try {
        // Try to create a thumbnail even if full processing failed
        const { imageProcessingService } = await import('../utils/imageProcessingService')
        
        // Create thumbnail only (this should be lightweight)
        const thumbnail = await imageProcessingService.createThumbnailFromBase64(
          await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => {
              const result = reader.result as string
              // Remove data URL prefix
              const base64 = result.includes(',') ? result.split(',')[1] : result
              resolve(base64)
            }
            reader.onerror = reject
            reader.readAsDataURL(imageBlob)
          })
        )

        const fallbackImage = {
          id: imageId,
          person_id: personId,
          file_name: fileName,
          data: '', // DO NOT store full-size - use empty string instead of null (database constraint)
          thumbnail_data: thumbnail,
          cloud_url: null, // Cloud upload failed, but we have thumbnail
          original_size: imageBlob.size.toString(),
          thumbnail_size: Math.floor(thumbnail.length * 0.75).toString(), // Estimate
          dimensions: '{}',
          format: imageBlob.type,
          date_created: new Date().toISOString(),
          created_by: 'anonymous'
        }

        await powerSync.value.execute(
          'INSERT INTO person_images (id, person_id, file_name, data, thumbnail_data, cloud_url, original_size, thumbnail_size, dimensions, format, date_created, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [fallbackImage.id, fallbackImage.person_id, fallbackImage.file_name, fallbackImage.data, fallbackImage.thumbnail_data, fallbackImage.cloud_url, fallbackImage.original_size, fallbackImage.thumbnail_size, fallbackImage.dimensions, fallbackImage.format, fallbackImage.date_created, fallbackImage.created_by]
        )

        console.log('✅ PowerSync: Stored person thumbnail only (no full-size data)')
        const createdImage = await powerSync.value.get('SELECT * FROM person_images WHERE id = ?', [imageId]) as any
        return createdImage
      } catch (thumbnailError) {
        // If even thumbnail creation fails, throw the original error
        console.error('❌ PowerSync: Failed to create person thumbnail:', thumbnailError)
        throw error
      }
    }
  }

  const addPlotImage = async (plotId: string, imageBlob: Blob, fileName: string, options: { analyzeForHeadstone?: boolean } = {}): Promise<PlotImageRecord> => {
    if (!powerSync.value) throw new Error('PowerSync not initialized')

    // Generate a unique ID for the image
    const imageId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    console.log('🔄 PowerSync: Starting hybrid image processing...')
    console.log('🔄 PowerSync: Processing image:', fileName, imageBlob.size, 'bytes')
    console.log('🔄 PowerSync: Headstone analysis requested:', options.analyzeForHeadstone)

    try {
      // Import image processing service
      const { imageProcessingService } = await import('../utils/imageProcessingService')

      // Convert Blob to File object with proper properties
      const file = new File([imageBlob], fileName, {
        type: imageBlob.type || 'image/jpeg',
        lastModified: Date.now()
      })

      console.log('PowerSync: Created File object:', {
        name: file.name,
        size: file.size,
        type: file.type
      })

      // Process the image (create thumbnails and upload to cloud)
      const processedImage = await imageProcessingService.processImage(file)

      const plotImage = {
        id: imageId,
        plot_id: plotId,
        file_name: fileName,
        data: '', // DO NOT store full-size images - use empty string instead of null (database constraint)
        thumbnail_data: processedImage.thumbnail,
        cloud_url: processedImage.cloudUrl,
        original_size: processedImage.metadata.originalSize.toString(),
        thumbnail_size: processedImage.metadata.thumbnailSize.toString(),
        dimensions: JSON.stringify(processedImage.metadata.dimensions),
        format: processedImage.metadata.format,
        date_created: new Date().toISOString(),
        created_by: 'anonymous'
      }

      console.log('🔄 PowerSync: Hybrid image data to insert:', {
        id: plotImage.id,
        plot_id: plotImage.plot_id,
        file_name: plotImage.file_name,
        thumbnail_size: plotImage.thumbnail_size,
        original_size: plotImage.original_size,
        cloud_url: plotImage.cloud_url
      })

      await powerSync.value.execute(
        'INSERT INTO plot_images (id, plot_id, file_name, data, thumbnail_data, cloud_url, original_size, thumbnail_size, dimensions, format, date_created, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [plotImage.id, plotImage.plot_id, plotImage.file_name, plotImage.data, plotImage.thumbnail_data, plotImage.cloud_url, plotImage.original_size, plotImage.thumbnail_size, plotImage.dimensions, plotImage.format, plotImage.date_created, plotImage.created_by]
      )

      console.log('✅ PowerSync: Hybrid image inserted into local database successfully')
      console.log('🔄 PowerSync: Image will be queued for sync to remote database')

      // Update sync status
      pendingUploads.value += 1

      // Get the created image by ID
      const createdImage = await powerSync.value.get('SELECT * FROM plot_images WHERE id = ?', [imageId]) as PlotImageRecord

      console.log('✅ PowerSync: Retrieved created hybrid image from local database:', {
        id: createdImage.id,
        plot_id: createdImage.plot_id,
        file_name: createdImage.file_name,
        has_thumbnail: !!createdImage.thumbnail_data,
        has_cloud_url: !!createdImage.cloud_url
      })
      console.log('🔄 PowerSync: Hybrid image is now ready for background sync')

      // Perform headstone analysis if requested
      if (options.analyzeForHeadstone) {
        console.log('🔄 PowerSync: Starting headstone analysis...')
        try {
          const { headstoneAnalysisService } = await import('../utils/headstoneAnalysisService')
          
          const analysisResult = await headstoneAnalysisService.analyzeHeadstoneImage(file, plotId)

          if (analysisResult.success) {
            console.log(`✅ PowerSync: Headstone analysis completed successfully - created ${analysisResult.persons.length} person(s)`)
            
            // Emit event to notify UI about new persons
            window.dispatchEvent(new CustomEvent('headstone-analysis-completed', {
              detail: { 
                plotId, 
                imageId: createdImage.id,
                persons: analysisResult.persons,
                metadata: analysisResult.metadata
              }
            }))
          } else {
            console.warn('⚠️ PowerSync: Headstone analysis failed:', analysisResult.error)
            
            // Emit event to notify UI about analysis failure
            window.dispatchEvent(new CustomEvent('headstone-analysis-failed', {
              detail: { 
                plotId, 
                imageId: createdImage.id,
                error: analysisResult.error
              }
            }))
          }
        } catch (analysisError) {
          console.error('❌ PowerSync: Error in headstone analysis:', analysisError)
          
          // Emit event to notify UI about analysis error
          window.dispatchEvent(new CustomEvent('headstone-analysis-error', {
            detail: { 
              plotId, 
              imageId: createdImage.id,
              error: analysisError instanceof Error ? analysisError.message : 'Unknown error'
            }
          }))
        }
      }

      return createdImage

    } catch (error) {
      console.error('❌ PowerSync: Error processing hybrid image:', error)

      // DO NOT store full-size images even in error cases
      // Try to create at least a thumbnail, or store nothing
      console.log('🔄 PowerSync: Attempting to create thumbnail only (no full-size storage)...')

      try {
        // Try to create a thumbnail even if full processing failed
        const { imageProcessingService } = await import('../utils/imageProcessingService')
        
        // Create thumbnail only (this should be lightweight)
        const thumbnail = await imageProcessingService.createThumbnailFromBase64(
          await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => {
              const result = reader.result as string
              // Remove data URL prefix
              const base64 = result.includes(',') ? result.split(',')[1] : result
              resolve(base64)
            }
            reader.onerror = reject
            reader.readAsDataURL(imageBlob)
          })
        )

        const fallbackImage = {
          id: imageId,
          plot_id: plotId,
          file_name: fileName,
          data: '', // DO NOT store full-size - use empty string instead of null (database constraint)
          thumbnail_data: thumbnail,
          cloud_url: null, // Cloud upload failed, but we have thumbnail
          original_size: imageBlob.size.toString(),
          thumbnail_size: Math.floor(thumbnail.length * 0.75).toString(), // Estimate
          dimensions: '{}',
          format: imageBlob.type,
          date_created: new Date().toISOString(),
          created_by: 'anonymous'
        }

        await powerSync.value.execute(
          'INSERT INTO plot_images (id, plot_id, file_name, data, thumbnail_data, cloud_url, original_size, thumbnail_size, dimensions, format, date_created, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [fallbackImage.id, fallbackImage.plot_id, fallbackImage.file_name, fallbackImage.data, fallbackImage.thumbnail_data, fallbackImage.cloud_url, fallbackImage.original_size, fallbackImage.thumbnail_size, fallbackImage.dimensions, fallbackImage.format, fallbackImage.date_created, fallbackImage.created_by]
        )

        console.log('✅ PowerSync: Stored thumbnail only (no full-size data)')
        const createdImage = await powerSync.value.get('SELECT * FROM plot_images WHERE id = ?', [imageId]) as PlotImageRecord
        return createdImage
      } catch (thumbnailError) {
        // If even thumbnail creation fails, throw the original error
        console.error('❌ PowerSync: Failed to create thumbnail:', thumbnailError)
        throw error
      }
    }
  }

  // Debug function to monitor sync status
  const getSyncStatus = () => {
    console.log('🔍 PowerSync Debug Status:', {
      isInitialized: isInitialized.value,
      isConnecting: isConnecting.value,
      syncStatus: syncStatus.value,
      pendingUploads: pendingUploads.value,
      lastSyncTime: lastSyncTime.value,
      error: error.value
    })
    return {
      isInitialized: isInitialized.value,
      isConnecting: isConnecting.value,
      syncStatus: syncStatus.value,
      pendingUploads: pendingUploads.value,
      lastSyncTime: lastSyncTime.value,
      error: error.value
    }
  }

  // Update plot geometry after editing
  const updatePlotGeometry = async (plotId: string, newGeometry: string): Promise<void> => {
    let powerSyncInstance = powerSync.value
    if (!powerSyncInstance) {
      await initialize()
      powerSyncInstance = powerSync.value
    }

    if (!powerSyncInstance) {
      throw new Error('PowerSync not initialized')
    }

    console.log('PowerSync: Updating plot geometry for plot:', plotId)
    console.log('PowerSync: New geometry:', newGeometry)

    try {
      await powerSyncInstance.execute(
        'UPDATE plots SET geometry = ?, date_modified = ? WHERE id = ?',
        [newGeometry, new Date().toISOString(), plotId]
      )
      
      console.log('✅ PowerSync: Plot geometry updated successfully')
    } catch (err) {
      console.error('❌ PowerSync: Error updating plot geometry:', err)
      throw err
    }
  }

  // Delete plot and all associated data
  const deletePlot = async (plotId: string): Promise<void> => {
    let powerSyncInstance = powerSync.value
    if (!powerSyncInstance) {
      await initialize()
      powerSyncInstance = powerSync.value
    }

    if (!powerSyncInstance) {
      throw new Error('PowerSync not initialized')
    }

    try {
      console.log('Deleting plot:', plotId)
      
      // Delete the plot record
      await powerSyncInstance.execute('DELETE FROM plots WHERE id = ?', [plotId])
      
      console.log('Plot deleted successfully')
    } catch (error) {
      console.error('Error deleting plot:', error)
      throw error
    }
  }

  // Generate next plot number
  const generateNextPlotNumber = async (): Promise<string> => {
    let powerSyncInstance = powerSync.value
    
    // If PowerSync is not available, try to get it
    if (!powerSyncInstance) {
      // If it's connecting, wait for it
      if (isConnecting.value) {
        console.log('PowerSync still connecting, waiting...')
        // Wait for initialization to complete (max 10 seconds)
        let waitCount = 0
        while (isConnecting.value && waitCount < 100) {
          await new Promise(resolve => setTimeout(resolve, 100))
          waitCount++
          powerSyncInstance = powerSync.value
          if (powerSyncInstance) break
        }
      }
      
      // If still not ready after waiting, check again
      if (!powerSyncInstance) {
        powerSyncInstance = powerSync.value
      }
      
      // Only initialize if truly not initialized and not connecting
      if (!powerSyncInstance && !isConnecting.value && !isInitialized.value) {
        console.log('PowerSync not initialized, initializing now...')
        const result = await initialize()
        if (result) {
          powerSyncInstance = result
        } else {
          powerSyncInstance = powerSync.value
        }
      }
    }

    if (!powerSyncInstance) {
      console.error('PowerSync client not initialized in generateNextPlotNumber')
      return generatePlotNumberFallback()
    }

    try {
      console.log('Generating plot number, querying plots...')
      const plots = await powerSyncInstance.getAll('SELECT * FROM plots')
      console.log('Retrieved plots for number generation:', plots.length)

      const existingNumbers = plots.map((p: any) => parseInt(p.number) || 0)
      const maxNumber = Math.max(0, ...existingNumbers)
      const nextNumber = (maxNumber + 1).toString()

      console.log('Generated plot number:', nextNumber)
      return nextNumber
    } catch (error) {
      console.error('Error generating plot number:', error)
      // Fallback to localStorage-based number generation
      return generatePlotNumberFallback()
    }
  }

  // Fallback function for generating plot numbers when PowerSync is not available
  const generatePlotNumberFallback = (): string => {
    try {
      const stored = localStorage.getItem('lastPlotNumber')
      const lastNumber = stored ? parseInt(stored) : 0
      const nextNumber = (lastNumber + 1).toString()
      
      localStorage.setItem('lastPlotNumber', nextNumber)
      console.log('Generated plot number (fallback):', nextNumber)
      return nextNumber
    } catch (error) {
      console.error('Error generating plot number fallback:', error)
      // Ultimate fallback - use timestamp
      const fallbackNumber = Date.now().toString().slice(-6)
      console.log('Using timestamp fallback plot number:', fallbackNumber)
      return fallbackNumber
    }
  }

  return {
    powerSync: computed(() => powerSync.value || db),
    isInitialized: computed(() => isInitialized.value),
    isConnecting: computed(() => isConnecting.value),
    error: computed(() => error.value),
    lastSyncTime: computed(() => lastSyncTime.value),
    syncStatus: computed(() => syncStatus.value),
    pendingUploads: computed(() => pendingUploads.value),
    getSyncStatus,
    initialize,
    cleanup,
    clearAllData,
    clearAllPowerSyncData,
    createNewPlot,
    updateExistingPlot,
    updatePlotGeometry,
    deletePlot,
    generateNextPlotNumber,
    findPlotByTempId,
    getPlotsByLocation,
    addPlotImage,
    addPersonImage,
    addNewLocation
  }
})

// Helper composables for reactive data
export const usePowerSyncQuery = (query: string, params: any[] = []) => {
  const powerSyncStore = usePowerSyncStore()
  const data = ref<any[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const execute = async () => {
    if (!powerSyncStore.powerSync) return

    loading.value = true
    error.value = null

    try {
      const result = await powerSyncStore.powerSync.getAll(query, params)
      data.value = result
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
    } finally {
      loading.value = false
    }
  }

  // Execute query when PowerSync is initialized
  watch(() => powerSyncStore.isInitialized, (initialized) => {
    if (initialized) {
      execute()
    }
  }, { immediate: true })

  return {
    data: computed(() => data.value),
    loading: computed(() => loading.value),
    error: computed(() => error.value),
    refetch: execute
  }
}

  // Global execution tracker to prevent duplicate queries across all instances
const globalQueryExecutions = new Map<string, boolean>()

// Debounce helper
const createDebouncedFn = <T extends (...args: any[]) => any>(fn: T, delay: number) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}

// Reactive version that supports reactive query and parameters
export const useReactivePowerSyncQuery = (query: Ref<string> | ComputedRef<string>, params: Ref<any[]> | ComputedRef<any[]> = ref([])) => {
  const powerSyncStore = usePowerSyncStore()
  const data = ref<any[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  let isExecuting = false

  const execute = async () => {
    if (!powerSyncStore.powerSync) return

    const queryString = unref(query)
    const queryParams = JSON.stringify(unref(params))
    const queryKey = `${queryString}:${queryParams}`
    
    // Prevent duplicate execution (both local and global)
    const alreadyExecuting = isExecuting || globalQueryExecutions.get(queryKey)
    if (alreadyExecuting) {
      // Silently skip duplicate
      return
    }

    isExecuting = true
    globalQueryExecutions.set(queryKey, true)
    loading.value = true
    error.value = null

    try {
      const actualParams = unref(params)
      
      const queryStart = performance.now()
      const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      console.log(`📊 [PowerSync Query] Starting query: ${queryString.substring(0, 100)}...`)
      console.log(`📊 [PowerSync Query] DB ready state: ${powerSyncStore.powerSync?.ready}, closed: ${powerSyncStore.powerSync?.closed}`)
      console.log(`📊 [PowerSync Query] Running on mobile: ${isMobile}`)
      
      // Add detailed timing diagnostics
      const beforeQuery = performance.now()
      const querySetupTime = beforeQuery - queryStart
      if (querySetupTime > 10) {
        console.warn(`📊 [PowerSync Query] ⚠️ Query setup took ${querySetupTime.toFixed(2)}ms (unexpected overhead)`)
      }
      
      // Check PowerSync state before query (might indicate sync operations)
      const dbState = {
        ready: powerSyncStore.powerSync?.ready,
        closed: powerSyncStore.powerSync?.closed,
        syncStatus: powerSyncStore.syncStatus,
        pendingUploads: powerSyncStore.pendingUploads,
        isConnecting: powerSyncStore.isConnecting
      }
      if (dbState.pendingUploads > 0 || dbState.isConnecting) {
        console.log(`📊 [PowerSync Query] DB state before query:`, dbState)
      }
      
      // Execute the actual query - this is where the IndexedDB/wa-sqlite overhead happens
      // PowerSync uses wa-sqlite (WebAssembly SQLite) on top of IndexedDB, which adds overhead:
      // - wa-sqlite WASM initialization: ~100-300ms on first query (pre-warmed during init)
      // - IndexedDB transaction overhead: ~50-200ms per query
      // - PowerSync reactive layer: ~50-100ms
      
      // Note: Index idx_plots_location_date should be used for this query pattern
      // If queries are slow, the index may not be applied or IndexedDB/wa-sqlite is the bottleneck
      
      const queryExecutionStart = performance.now()
      const result = await powerSyncStore.powerSync.getAll(queryString, actualParams)
      const queryExecutionEnd = performance.now()
      
      const queryEnd = performance.now()
      const queryExecutionTime = queryExecutionEnd - queryExecutionStart
      const totalTime = queryEnd - queryStart
      
      console.log(`📊 [PowerSync Query] Query execution: ${queryExecutionTime.toFixed(2)}ms, Total: ${totalTime.toFixed(2)}ms, Results: ${result.length}`)
      
      // wa-sqlite overhead analysis
      if (queryExecutionTime > 200 && !isMobile) {
        console.warn(`📊 [PowerSync Query] ⚠️ Slow query execution (${queryExecutionTime.toFixed(2)}ms)`)
        console.warn(`📊 [PowerSync Query] Breakdown: wa-sqlite (WASM SQLite) + IndexedDB + PowerSync reactive layer`)
        console.warn(`📊 [PowerSync Query] This is normal for PowerSync but indicates IndexedDB/wa-sqlite overhead`)
        
        // Check if this is likely wa-sqlite initialization (first query)
        if (queryExecutionTime > 500 && result.length > 0) {
          console.warn(`📊 [PowerSync Query] 💡 Tip: First queries after app load are slower due to wa-sqlite WASM initialization`)
        }
      }
      
      if (queryExecutionTime > 1000) {
        console.error(`📊 [PowerSync Query] ❌ VERY slow query (${queryExecutionTime.toFixed(2)}ms)`)
        console.error(`📊 [PowerSync Query] Possible causes: IndexedDB lock, sync conflict, or wa-sqlite initialization`)
        console.error(`📊 [PowerSync Query] DB state:`, dbState)
      }
      
      data.value = result
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      console.error(`📊 [PowerSync Query] Query failed:`, err)
    } finally {
      loading.value = false
      isExecuting = false
      globalQueryExecutions.delete(queryKey)
    }
  }

  // Create debounced execute function to prevent rapid-fire duplicate executions
  const debouncedExecute = createDebouncedFn(() => {
    if (!powerSyncStore.powerSync) return
    execute()
  }, 100) // 100ms debounce

  // Watch for changes in query or params, including PowerSync initialization
  watch([query, params, () => powerSyncStore.isInitialized], ([newQuery, newParams, initialized], [oldQuery, oldParams, wasInitialized]) => {
    if (initialized) {
      // Check if query/params actually changed or if PowerSync just initialized
      const queryChanged = oldQuery !== newQuery
      const paramsChanged = oldParams !== newParams
      const powerSyncJustInitialized = !wasInitialized && initialized
      
      if (queryChanged || paramsChanged || powerSyncJustInitialized) {
        debouncedExecute()
      }
    }
  }, { deep: true, immediate: false })

  return {
    data: computed(() => data.value),
    loading: computed(() => loading.value),
    error: computed(() => error.value),
    refetch: execute
  }
}

// Use PowerSync's watch() for automatic real-time updates
// This eliminates the need for manual refetching - watch() streams changes automatically
export const usePlots = () => {
  const locationStore = useLocationsStore()
  const powerSyncStore = usePowerSyncStore()
  const data = ref<any[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  
  // Watch for changes in selected location
  const selectedLocationId = computed(() => locationStore.selectedLocationId)
  
  // Use PowerSync's watch() to automatically get updates when plots change
  // This is more efficient than manual refetching - watch() streams changes in real-time
  let watchIterator: AsyncIterable<any> | null = null
  let watchActive = false
  
  const startWatch = async () => {
    if (!powerSyncStore.powerSync) {
      console.log('📊 [usePlots] PowerSync not initialized, skipping watch')
      return
    }
    
    const locationId = selectedLocationId.value
    if (!locationId) {
      console.log('📊 [usePlots] No location selected, clearing data')
      data.value = []
      loading.value = false
      return
    }
    
    // Stop existing watch if any
    watchActive = false
    
    loading.value = true
    error.value = null
    watchActive = true
    
    try {
      console.log(`📊 [usePlots] Starting watch for location: ${locationId}`)
      // Select all necessary fields for plot display, including section, row, number, status, notes
      const query = 'SELECT id, geometry, section, row, number, status, location_id, temp_plot_id, date_created, date_modified, created_by, modified_by, notes FROM plots WHERE location_id = ? ORDER BY date_created DESC'
      
      // Use PowerSync's watch() which automatically updates when plots table changes
      // watch() returns an async iterator that yields results whenever the watched data changes
      watchIterator = powerSyncStore.powerSync.watch(query, [locationId])
      
      // Process the async iterator - watch() streams updates automatically
      // This runs in the background and updates data.value whenever plots change
      ;(async () => {
        try {
          for await (const result of watchIterator!) {
            if (!watchActive) break // Stop if watch was cancelled
            
            const rows = result.rows?._array ?? []
            data.value = rows
            loading.value = false
            console.log(`📊 [usePlots] Watch updated: ${rows.length} plots`)
          }
        } catch (err: any) {
          if (watchActive) {
            console.error('📊 [usePlots] Watch stream error:', err)
            error.value = err instanceof Error ? err.message : 'Watch error'
            loading.value = false
          }
        }
      })()
      
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Watch failed'
      console.error('📊 [usePlots] Watch failed:', err)
      loading.value = false
      watchActive = false
    }
  }
  
  // Watch for location changes and PowerSync initialization
  watch([selectedLocationId, () => powerSyncStore.isInitialized], async ([newLocationId, initialized], [oldLocationId]) => {
    if (initialized && powerSyncStore.powerSync) {
      // Location changed or PowerSync just initialized - restart watch
      if (newLocationId !== oldLocationId || !watchIterator) {
        await startWatch()
      }
    }
  }, { immediate: true })
  
  return {
    data: computed(() => data.value),
    loading: computed(() => loading.value),
    error: computed(() => error.value),
    // No refetch needed - watch() handles updates automatically
    // But provide it for compatibility
    refetch: () => {
      console.log('📊 [usePlots] Refetch called (watch handles updates automatically, restarting watch)')
      startWatch()
    }
  }
}

export const usePlot = (id: string) => {
  console.log('usePlot: Called with id:', id)
  const queryResult = usePowerSyncQuery('SELECT * FROM plots WHERE id = ?', [id])

  return {
    data: computed(() => {
      const plots = queryResult.data.value
      console.log('usePlot: Query result for id', id, ':', plots)
      const result = plots && plots.length > 0 ? plots[0] : null
      console.log('usePlot: Returning plot:', result)
      return result
    }),
    loading: queryResult.loading,
    error: queryResult.error,
    refetch: queryResult.refetch
  }
}

export const usePlotImages = (plotId: string | Ref<string> | ComputedRef<string>) => {
  const powerSyncStore = usePowerSyncStore()
  const data = ref<any[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  
  // Support both string and reactive plotId
  const plotIdRef = typeof plotId === 'string' ? ref(plotId) : plotId
  let watchIterator: AsyncIterable<any> | null = null
  let watchActive = false
  
  const startWatch = async () => {
    if (!powerSyncStore.powerSync) {
      console.log('📊 [usePlotImages] PowerSync not initialized, skipping watch')
      return
    }
    
    const currentPlotId = unref(plotIdRef)
    if (!currentPlotId) {
      console.log('📊 [usePlotImages] No plot ID, clearing data')
      data.value = []
      loading.value = false
      return
    }
    
    // Stop existing watch if any
    watchActive = false
    
    loading.value = true
    error.value = null
    watchActive = true
    
    try {
      console.log(`📊 [usePlotImages] Starting watch for plot: ${currentPlotId}`)
      const queryString = 'SELECT * FROM plot_images WHERE plot_id = ? ORDER BY date_created DESC'
      
      // Do an initial query to get data immediately
      const initialResult = await powerSyncStore.powerSync.getAll(queryString, [currentPlotId])
      data.value = initialResult
      loading.value = false
      console.log(`📊 [usePlotImages] Initial query completed: ${initialResult.length} images`)
      
      // Use PowerSync's watch() which automatically updates when plot_images table changes
      watchIterator = powerSyncStore.powerSync.watch(queryString, [currentPlotId])
      
      // Process the async iterator - watch() streams updates automatically
      ;(async () => {
        try {
          for await (const result of watchIterator!) {
            if (!watchActive) break
            
            const rows = result.rows?._array ?? []
            data.value = rows
            loading.value = false
            console.log(`📊 [usePlotImages] Watch updated: ${rows.length} images`)
          }
        } catch (err: any) {
          if (watchActive) {
            console.error('📊 [usePlotImages] Watch stream error:', err)
            error.value = err instanceof Error ? err.message : 'Watch error'
            loading.value = false
          }
        }
      })()
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Watch failed'
      console.error('📊 [usePlotImages] Watch failed:', err)
      loading.value = false
      watchActive = false
    }
  }
  
  // Watch for plotId changes and PowerSync initialization
  watch([plotIdRef, () => powerSyncStore.isInitialized], async ([newPlotId, initialized], [oldPlotId]) => {
    if (initialized && powerSyncStore.powerSync) {
      // Plot ID changed or PowerSync just initialized - restart watch
      if (newPlotId !== oldPlotId || !watchIterator) {
        await startWatch()
      }
    }
  }, { immediate: true })
  
  return {
    data: computed(() => data.value),
    loading: computed(() => loading.value),
    error: computed(() => error.value),
    refetch: async () => {
      console.log('📊 [usePlotImages] Refetch called, restarting watch')
      await startWatch()
    }
  }
}

export const usePersonImages = (personId: string) => {
  return usePowerSyncQuery('SELECT * FROM person_images WHERE person_id = ? ORDER BY date_created DESC', [personId])
}