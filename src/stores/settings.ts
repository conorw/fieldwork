import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'

export type AnalysisMode = 'openai' | 'local'

export const useSettingsStore = defineStore('settings', () => {
  // Default map configuration values
  const defaultMapConfig = {
    minZoom: 8,
    maxZoom: 23, // Allow higher zoom levels for PMTiles data - UPDATED
    defaultZoom: 12,
    // Default center (Ballycastle, Northern Ireland) - will be updated with GPS if available
    defaultCenter: [-6.238, 55.204],
    // Default max extent size (1km x 1km)
    maxExtentSize: 1000 // 1km in meters
  }

  // Reactive map settings
  const mapSettings = ref({
    minZoom: defaultMapConfig.minZoom,
    maxZoom: defaultMapConfig.maxZoom,
    defaultZoom: defaultMapConfig.defaultZoom,
    defaultCenter: defaultMapConfig.defaultCenter,
    maxExtentSize: defaultMapConfig.maxExtentSize
  })

  // Tile download state
  const tileDownloadState = ref({
    isDownloading: false,
    progress: 0,
    totalTiles: 0,
    downloadedTiles: 0,
    currentZoom: 0,
    extent: null,
    minZoom: 0,
    maxZoom: 0,
    startTime: null,
    estimatedTimeRemaining: null,
    error: null
  })

  // Analysis mode setting (OpenAI API or local browser inference)
  const analysisMode = useStorage<AnalysisMode>('analysisMode', 'openai')

  // Computed properties for easy access
  const minZoom = computed(() => mapSettings.value.minZoom)
  const maxZoom = computed(() => mapSettings.value.maxZoom)
  const defaultZoom = computed(() => mapSettings.value.defaultZoom)
  const defaultCenter = computed(() => mapSettings.value.defaultCenter)
  const maxExtentSize = computed(() => mapSettings.value.maxExtentSize)

  // Analysis mode getter/setter
  const setAnalysisMode = (mode: AnalysisMode) => {
    analysisMode.value = mode
    console.log('Analysis mode set to:', mode)
    
    // Pre-initialize local model if switching to local mode
    if (mode === 'local') {
      console.log('🔄 Pre-initializing local LLM model...')
      // Import and initialize asynchronously to avoid blocking
      import('../services/localLLMService').then(({ localLLMService }) => {
        localLLMService.initialize().catch((error) => {
          console.warn('⚠️ Failed to pre-initialize local model (will load on first use):', error)
        })
      })
    }
  }

  const getAnalysisMode = (): AnalysisMode => {
    return analysisMode.value
  }

  // Watch for analysis mode changes and pre-initialize local model
  watch(analysisMode, (newMode) => {
    if (newMode === 'local') {
      console.log('🔄 Analysis mode changed to local, pre-initializing model...')
      import('../services/localLLMService').then(({ localLLMService }) => {
        localLLMService.initialize().catch((error) => {
          console.warn('⚠️ Failed to pre-initialize local model (will load on first use):', error)
        })
      })
    }
  })

  // Function to get current GPS location
  const getCurrentLocation = () => {
    return new Promise((resolve, _reject) => {
      if (!navigator.geolocation) {
        console.log('Geolocation not supported, using default center')
        resolve(defaultMapConfig.defaultCenter)
        return
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords
          //console.log('GPS location obtained:', { latitude, longitude })
          resolve([longitude, latitude]) // OpenLayers uses [lon, lat] format
        },
        (error) => {
          console.warn('Failed to get GPS location:', error.message)
          console.log('Using default center (Ballycastle)')
          resolve(defaultMapConfig.defaultCenter)
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000 // Cache for 1 minute
        }
      )
    })
  }

  // Initialize settings with GPS location
  const initializeWithGPS = async () => {
    try {
      console.log('Initializing settings with GPS location...')
      const gpsCenter = await getCurrentLocation()
      
      // Update the default center with GPS location
      mapSettings.value.defaultCenter = gpsCenter as number[]
      // Save the updated settings
      saveSettings()

    } catch (error) {
      console.error('Error initializing settings with GPS:', error)
      // Keep the default center if GPS fails
    }
  }

  // Refresh GPS location and update center
  const refreshGPSLocation = async () => {
    try {
      console.log('Refreshing GPS location...')
      const gpsCenter = await getCurrentLocation()
      
      // Update the default center with new GPS location
      mapSettings.value.defaultCenter = gpsCenter as number[]
      
      // Save the updated settings
      saveSettings()
      
      console.log('GPS location refreshed:', gpsCenter)
      return gpsCenter
    } catch (error) {
      console.error('Error refreshing GPS location:', error)
      throw error
    }
  }

  // Actions to update settings
  const updateMapSettings = (newSettings: any) => {
    mapSettings.value = { ...mapSettings.value, ...newSettings }
    console.log('Map settings updated:', mapSettings.value)
  }

  const resetToDefaults = () => {
    mapSettings.value = { ...defaultMapConfig }
    console.log('Map settings reset to defaults:', mapSettings.value)
  }

  // Load settings from localStorage on initialization
  const loadSettings = () => {
    try {
      const savedSettings = localStorage.getItem('mapSettings')
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings)
        
        // Check if we need to migrate from old zoom levels
        if (parsed.minZoom >= 16 || parsed.maxZoom >= 19) {
          console.log('Migrating from old zoom levels to new PMTiles-compatible levels')
          // Reset to defaults for PMTiles compatibility
          mapSettings.value = { ...defaultMapConfig }
          saveSettings() // Save the new defaults
        } else {
          mapSettings.value = { ...defaultMapConfig, ...parsed }
        }
        
        //console.log('Map settings loaded from localStorage:', mapSettings.value)
      }
    } catch (error) {
      console.error('Error loading map settings:', error)
      // Fall back to defaults
      mapSettings.value = { ...defaultMapConfig }
    }
  }

  // Save settings to localStorage
  const saveSettings = () => {
    try {
      localStorage.setItem('mapSettings', JSON.stringify(mapSettings.value))
      //console.log('Map settings saved to localStorage:', mapSettings.value)
    } catch (error) {
      console.error('Error saving map settings:', error)
    }
  }

  // Tile download management functions
  const startTileDownload = (extent: any, minZoom: number, maxZoom: number) => {
    console.log('startTileDownload called with:', { extent, minZoom, maxZoom })
    
    tileDownloadState.value = {
      isDownloading: true,
      progress: 0,
      totalTiles: 0,
      downloadedTiles: 0,
      currentZoom: minZoom,
      extent: extent,
      minZoom: minZoom,
      maxZoom: maxZoom,
      startTime: Date.now() as any,
      estimatedTimeRemaining: null,
      error: null
    }
    
    // Save download state to localStorage for resume capability
    localStorage.setItem('tileDownloadState', JSON.stringify(tileDownloadState.value))
    
    console.log('Tile download started:', tileDownloadState.value)
  }

  const updateTileDownloadProgress = (progress: number, downloadedTiles: number, totalTiles: number, currentZoom: number) => {
    tileDownloadState.value.progress = progress
    tileDownloadState.value.downloadedTiles = downloadedTiles
    tileDownloadState.value.totalTiles = totalTiles
    tileDownloadState.value.currentZoom = currentZoom
    
    // Calculate estimated time remaining
    if (tileDownloadState.value.startTime && progress > 0) {
      const elapsed = Date.now() - tileDownloadState.value.startTime
      const estimatedTotal = (elapsed / progress) * 100
      tileDownloadState.value.estimatedTimeRemaining = Math.max(0, estimatedTotal - elapsed) as any
    }
    
    // Save progress to localStorage
    localStorage.setItem('tileDownloadState', JSON.stringify(tileDownloadState.value))
  }

  const completeTileDownload = () => {
    tileDownloadState.value.isDownloading = false
    tileDownloadState.value.progress = 100
    tileDownloadState.value.error = null
    
    // Clear download state from localStorage
    localStorage.removeItem('tileDownloadState')
    
    console.log('Tile download completed successfully')
  }

  const failTileDownload = (error: any) => {
    tileDownloadState.value.isDownloading = false
    tileDownloadState.value.error = error
    
    // Keep download state in localStorage for resume capability
    localStorage.setItem('tileDownloadState', JSON.stringify(tileDownloadState.value))
    
    console.error('Tile download failed:', error)
  }

  const resumeTileDownload = () => {
    try {
      const savedState = localStorage.getItem('tileDownloadState')
      if (savedState) {
        const state = JSON.parse(savedState)
        if (state.isDownloading && state.extent) {
          tileDownloadState.value = state
          console.log('Resuming tile download from saved state:', state)
          return true
        }
      }
    } catch (error) {
      console.error('Error resuming tile download:', error)
    }
    return false
  }

  const clearTileDownloadState = () => {
    tileDownloadState.value = {
      isDownloading: false,
      progress: 0,
      totalTiles: 0,
      downloadedTiles: 0,
      currentZoom: 0,
      extent: null,
      minZoom: 0,
      maxZoom: 0,
      startTime: null,
      estimatedTimeRemaining: null,
      error: null
    }
    localStorage.removeItem('tileDownloadState')
  }

  // Initialize settings on store creation
  loadSettings()
  
  // Initialize with GPS location after loading saved settings
  initializeWithGPS()

  return {
    // State
    mapSettings,
    tileDownloadState,
    analysisMode,
    
    // Computed properties
    minZoom,
    maxZoom,
    defaultZoom,
    defaultCenter,
    maxExtentSize,
    
    // Actions
    updateMapSettings,
    resetToDefaults,
    loadSettings,
    saveSettings,
    getCurrentLocation,
    initializeWithGPS,
    refreshGPSLocation,
    startTileDownload,
    updateTileDownloadProgress,
    completeTileDownload,
    failTileDownload,
    resumeTileDownload,
    clearTileDownloadState,
    setAnalysisMode,
    getAnalysisMode
  }
}) 