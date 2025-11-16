// Example usage of the PMTiles hybrid caching system
import { useLocationsStore } from '../stores/locations'
import { createBestTileSource } from '../utils/tileSource'


/**
 * Example: Create a map with PMTiles tile source
 */
export const createMapWithPMTiles = async (locationId: string) => {
  const locationsStore = useLocationsStore()

  try {
    // Load location data
    await locationsStore.loadLocations()
    const location = locationsStore.getLocationById(locationId)

    if (!location) {
      throw new Error(`Location ${locationId} not found`)
    }

    // Convert to PMTilesLocation format
    const pmtilesLocation = {
      id: location.id,
      name: location.name,
      bbox: location.bbox,
      minZoom: location.minZoom,
      maxZoom: location.maxZoom,
      pmtilesUrl: location.pmtilesUrl
    }

    // Create the best available tile source
    const tileSource = createBestTileSource(pmtilesLocation, 'ExampleMap')

    console.log('Created tile source for map:', {
      location: location.name,
      sourceType: tileSource.constructor.name
    })

    return tileSource
  } catch (error) {
    console.error('Error creating map with PMTiles:', error)
    throw error
  }
}

/**
 * Example: Preload PMTiles for multiple locations
 */
export const preloadMultipleLocations = async (locationIds: string[]) => {
  const locationsStore = useLocationsStore()

  try {
    console.log(`Preloading PMTiles for ${locationIds.length} locations...`)

    // Load all locations
    await locationsStore.loadLocations()

    // Preload each location
    const preloadPromises = locationIds.map(async (locationId) => {
      try {
        await locationsStore.preloadLocationPMTiles(locationId)
        console.log(`Preloaded PMTiles for location ${locationId}`)
      } catch (error) {
        console.error(`Failed to preload location ${locationId}:`, error)
      }
    })

    await Promise.allSettled(preloadPromises)
    console.log('Preloading completed')
  } catch (error) {
    console.error('Error preloading locations:', error)
  }
}