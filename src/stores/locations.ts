import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useElectricStore } from './electric'
import type { LocationRecord } from '../electric-schema'
import { pmtilesService, type PMTilesLocation } from '../utils/pmtilesService'
import { useStorage } from '@vueuse/core'

export interface LocationData {
  id: string
  name: string
  bbox: [number, number, number, number]
  minZoom: number
  maxZoom: number
  pmtilesUrl?: string
  dateCreated: string
  createdBy: string
  isPublic: boolean
}

export const useLocationsStore = defineStore('locations', () => {
  const electricStore = useElectricStore()

  // State
  const locations = ref<LocationData[]>([])
  const selectedLocation = ref<LocationData | null>(null)
  const selectedLocationId = useStorage('selectedLocationId', '')
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Computed
  const publicLocations = computed(() =>
    locations.value.filter(loc => loc.isPublic)
  )

  const userLocations = computed(() =>
    locations.value.filter(loc => loc.createdBy === 'anonymous')
  )

  // Actions
  const loadLocations = async () => {
    const startTime = performance.now()
    console.log('📍 [LocationsStore] Starting loadLocations, isLoading:', isLoading.value)
    
    // Prevent concurrent loading
    if (isLoading.value) {
      console.log('📍 [LocationsStore] Already loading, skipping')
      return
    }
    
    if (locations.value.length > 0) {
      return
    }
    
    // Wait for Electric SQL to be ready
    if (!electricStore.isInitialized) {
      const isConnecting = electricStore.isConnecting
      
      if (isConnecting || !electricStore.isInitialized) {
        // Wait up to 10 seconds for Electric SQL to initialize
        let waitCount = 0
        while ((isConnecting || !electricStore.isInitialized) && waitCount < 100) {
          await new Promise(resolve => setTimeout(resolve, 100))
          waitCount++
          if (electricStore.isInitialized) break
        }
      }
    }
    
    if (!electricStore.isInitialized) {
      console.error('LocationsStore: Electric SQL client not initialized')
      error.value = 'Electric SQL client not initialized'
      return
    }

    isLoading.value = true
    error.value = null

    try {
      const queryStart = performance.now()
      const { data: results, error: fetchError } = await electricStore.supabaseClient
        .from('locations')
        .select('*')
      
      if (fetchError) throw fetchError
      const queryEnd = performance.now()
      console.log(`📍 [LocationsStore] Query took ${(queryEnd - queryStart).toFixed(2)}ms, got ${results.length} locations`)
      
      const mapStart = performance.now()
      locations.value = results.map((loc: any) => ({
        ...loc,
        bbox: JSON.parse(loc.bbox),
        minZoom: parseInt(loc.minZoom),
        maxZoom: parseInt(loc.maxZoom),
        pmtilesUrl: loc.pmtiles_url || '',
        isPublic: loc.isPublic === 'true'
      }))
      const mapEnd = performance.now()
      console.log(`📍 [LocationsStore] Mapping took ${(mapEnd - mapStart).toFixed(2)}ms`)
      
      // Ensure selectedLocationId is set before selecting location
      // This ensures queries (like usePlots) have a valid location ID immediately
      if (selectedLocationId.value) {
        selectLocation(selectedLocationId.value)
      } else if (locations.value.length > 0) {
        // Auto-select first location if none selected
        selectLocation(locations.value[0].id)
      }
      
      const totalTime = performance.now() - startTime
      console.log(`📍 [LocationsStore] loadLocations completed in ${totalTime.toFixed(2)}ms`)
    } catch (err) {
      error.value = `Failed to load locations: ${err}`
      console.error('Error loading locations:', err)
    } finally {
      isLoading.value = false
    }
  }

  const selectLocation = (id: string) => {
    selectedLocationId.value = id
    selectedLocation.value = getLocationById(id) || null
    console.log('Selected location:', selectedLocationId.value)
  }

  const updateLocation = async (id: string, updates: Partial<LocationData>) => {
    if (!electricStore.isInitialized) {
      throw new Error('Electric SQL client not initialized')
    }

    const location = getLocationById(id)
    if (!location) {
      throw new Error(`Location ${id} not found`)
    }

    const getBboxString = (bbox: [number, number, number, number] | undefined, fallback: string) => {
      return bbox ? JSON.stringify(bbox) : fallback
    }

    const updatedLocation: LocationRecord = {
      id: location.id,
      name: updates.name || location.name,
      bbox: getBboxString(updates.bbox, JSON.stringify(location.bbox)),
      min_zoom: updates.minZoom ? updates.minZoom.toString() : location.minZoom.toString(),
      max_zoom: updates.maxZoom ? updates.maxZoom.toString() : location.maxZoom.toString(),
      pmtiles_url: updates.pmtilesUrl || location.pmtilesUrl || null,
      date_created: location.dateCreated,
      date_modified: new Date().toISOString(), // Add date_modified field
      created_by: location.createdBy,
      is_public: updates.isPublic !== undefined ? updates.isPublic.toString() : location.isPublic.toString(),
    }

    const { error: updateError } = await electricStore.supabaseClient
      .from('locations')
      .update({
        name: updatedLocation.name,
        bbox: updatedLocation.bbox,
        min_zoom: updatedLocation.min_zoom,
        max_zoom: updatedLocation.max_zoom,
        pmtiles_url: updatedLocation.pmtiles_url,
        date_modified: updatedLocation.date_modified,
        is_public: updatedLocation.is_public
      })
      .eq('id', id)
    
    if (updateError) throw updateError

    // Update local state
    const index = locations.value.findIndex(loc => loc.id === id)
    if (index !== -1) {
      locations.value[index] = {
        ...locations.value[index],
        ...updates
      }
    }
  }

  const deleteLocation = async (id: string) => {
    if (!electricStore.isInitialized) {
      throw new Error('Electric SQL client not initialized')
    }

    console.log(`🗑️ Deleting location ${id} and all associated data...`)

    try {
      // Get all plots for this location
      const { data: plots, error: plotsError } = await electricStore.supabaseClient
        .from('plots')
        .select('id')
        .eq('location_id', id)
      
      if (plotsError) throw plotsError
      console.log(`🗑️ Found ${plots?.length || 0} plots to delete for location ${id}`)

      // 2. For each plot, delete associated data
      if (plots) {
        for (const plot of plots) {
          const plotId = plot.id
          console.log(`🗑️ Deleting data for plot ${plotId}...`)

          // Delete plot images
          await electricStore.supabaseClient.from('plot_images').delete().eq('plot_id', plotId)
          console.log(`🗑️ Deleted plot images for plot ${plotId}`)

          // Get all persons for this plot
          const { data: persons, error: personsError } = await electricStore.supabaseClient
            .from('persons')
            .select('id')
            .eq('plot_id', plotId)
          
          if (personsError) throw personsError
          console.log(`🗑️ Found ${persons?.length || 0} persons to delete for plot ${plotId}`)

          // Delete person images for each person
          if (persons) {
            for (const person of persons) {
              const personId = person.id
              await electricStore.supabaseClient.from('person_images').delete().eq('person_id', personId)
              console.log(`🗑️ Deleted person images for person ${personId}`)
            }
          }

          // Delete all persons for this plot
          await electricStore.supabaseClient.from('persons').delete().eq('plot_id', plotId)
          console.log(`🗑️ Deleted persons for plot ${plotId}`)
        }
      }

      // 3. Delete all plots for this location
      await electricStore.supabaseClient.from('plots').delete().eq('location_id', id)
      console.log(`🗑️ Deleted plots for location ${id}`)

      // 4. Finally, delete the location itself
      await electricStore.supabaseClient.from('locations').delete().eq('id', id)
      console.log(`🗑️ Deleted location ${id}`)

      // Remove from local state
      const index = locations.value.findIndex(loc => loc.id === id)
      if (index !== -1) {
        locations.value.splice(index, 1)
      }

      // If this was the selected location, clear the selection
      if (selectedLocationId.value === id) {
        selectedLocationId.value = ''
        selectedLocation.value = null
      }

      console.log(`✅ Successfully deleted location ${id} and all associated data`)
    } catch (error) {
      console.error(`❌ Error deleting location ${id}:`, error)
      throw new Error(`Failed to delete location: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const getLocationById = (id: string): LocationData | undefined => {
    return locations.value.find(loc => loc.id === id)
  }

  const getPMTilesForLocation = async (locationId: string): Promise<{
    data: ArrayBuffer
    source: 'powersync' | 'generated' | 'local'
  }> => {
    const location = getLocationById(locationId)
    if (!location) {
      throw new Error(`Location ${locationId} not found`)
    }

    const pmtilesLocation: PMTilesLocation = {
      id: location.id,
      name: location.name,
      bbox: location.bbox,
      minZoom: location.minZoom,
      maxZoom: location.maxZoom,
      pmtilesUrl: location.pmtilesUrl
    }

    return await pmtilesService.getPMTiles(pmtilesLocation)
  }

  const preloadLocationPMTiles = async (locationId: string): Promise<void> => {
    const location = getLocationById(locationId)
    if (!location) return

    const pmtilesLocation: PMTilesLocation = {
      id: location.id,
      name: location.name,
      bbox: location.bbox,
      minZoom: location.minZoom,
      maxZoom: location.maxZoom,
      pmtilesUrl: location.pmtilesUrl
    }

    await pmtilesService.preloadPMTiles(pmtilesLocation)
  }

  return {
    // State
    locations,
    selectedLocation,
    selectedLocationId,
    isLoading,
    error,

    // Computed
    publicLocations,
    userLocations,

    // Actions
    loadLocations,
    selectLocation,
    updateLocation,
    deleteLocation,
    getLocationById,
    getPMTilesForLocation,
    preloadLocationPMTiles
  }
})