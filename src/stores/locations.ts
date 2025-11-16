import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { usePowerSyncStore } from './powersync'
import type { LocationRecord } from '../powersync-schema'
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
  const powerSyncStore = usePowerSyncStore()

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
    
    // Wait for PowerSync to be ready
    if (!powerSyncStore.powerSync) {
      const isConnecting = powerSyncStore.isConnecting || (powerSyncStore as any).isInitialized === false
      
      if (isConnecting || !powerSyncStore.isInitialized) {
        // Wait up to 10 seconds for PowerSync to initialize
        let waitCount = 0
        while ((isConnecting || !powerSyncStore.isInitialized) && !powerSyncStore.powerSync && waitCount < 100) {
          await new Promise(resolve => setTimeout(resolve, 100))
          waitCount++
          if (powerSyncStore.powerSync) break
        }
      }
    }
    
    if (!powerSyncStore.powerSync) {
      console.error('LocationsStore: PowerSync client not initialized')
      error.value = 'PowerSync client not initialized'
      return
    }

    isLoading.value = true
    error.value = null

    try {
      const queryStart = performance.now()
      const results = await powerSyncStore.powerSync.getAll('SELECT * FROM locations')
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
    if (!powerSyncStore.powerSync) {
      throw new Error('PowerSync client not initialized')
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

    await powerSyncStore.powerSync?.execute(
      'UPDATE locations SET name = ?, bbox = ?, min_zoom = ?, max_zoom = ?, pmtiles_url = ?, date_modified = ?, is_public = ? WHERE id = ?',
      [updatedLocation.name, updatedLocation.bbox, updatedLocation.min_zoom, updatedLocation.max_zoom, updatedLocation.pmtiles_url, updatedLocation.date_modified, updatedLocation.is_public, id]
    )

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
    if (!powerSyncStore.powerSync) {
      throw new Error('PowerSync client not initialized')
    }

    console.log(`🗑️ Deleting location ${id} and all associated data...`)

    try {
      // Start a transaction to ensure all deletions succeed or none do
      await powerSyncStore.powerSync.writeTransaction(async (tx) => {
        // 1. Get all plots for this location
        const plots = await tx.getAll('SELECT id FROM plots WHERE location_id = ?', [id])
        console.log(`🗑️ Found ${plots.length} plots to delete for location ${id}`)

        // 2. For each plot, delete associated data
        for (const plot of plots) {
          const plotId = (plot as any).id
          console.log(`🗑️ Deleting data for plot ${plotId}...`)

          // Delete plot images
          await tx.execute('DELETE FROM plot_images WHERE plot_id = ?', [plotId])
          console.log(`🗑️ Deleted plot images for plot ${plotId}`)

          // Get all persons for this plot
          const persons = await tx.getAll('SELECT id FROM persons WHERE plot_id = ?', [plotId])
          console.log(`🗑️ Found ${persons.length} persons to delete for plot ${plotId}`)

          // Delete person images for each person
          for (const person of persons) {
            const personId = (person as any).id
            await tx.execute('DELETE FROM person_images WHERE person_id = ?', [personId])
            console.log(`🗑️ Deleted person images for person ${personId}`)
          }

          // Delete all persons for this plot
          await tx.execute('DELETE FROM persons WHERE plot_id = ?', [plotId])
          console.log(`🗑️ Deleted persons for plot ${plotId}`)
        }

        // 3. Delete all plots for this location
        await tx.execute('DELETE FROM plots WHERE location_id = ?', [id])
        console.log(`🗑️ Deleted plots for location ${id}`)

        // 4. Finally, delete the location itself
        await tx.execute('DELETE FROM locations WHERE id = ?', [id])
        console.log(`🗑️ Deleted location ${id}`)
      })

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