/**
 * Shared utilities for location-related operations
 */

export interface Location {
  latitude: number
  longitude: number
  accuracy?: number
  timestamp?: number
}

export interface Bounds {
  minLon: number
  minLat: number
  maxLon: number
  maxLat: number
}

/**
 * Check if a location is within the specified bounds
 * @param location - The location to check
 * @param extent - The bounds extent [minLon, minLat, maxLon, maxLat]
 * @returns true if location is within bounds, false otherwise
 */
export const isLocationWithinBounds = (location: Location | null, extent: number[] | null): boolean => {
  if (!extent || !location) {
    return true // No bounds restriction or no location
  }
  
  const [minLon, minLat, maxLon, maxLat] = extent
  const { longitude, latitude } = location
  
  return longitude >= minLon && longitude <= maxLon && latitude >= minLat && latitude <= maxLat
}

/**
 * Convert location to bounds format
 * @param location - The location to convert
 * @returns bounds object
 */
export const locationToBounds = (location: Location): Bounds => {
  return {
    minLon: location.longitude,
    minLat: location.latitude,
    maxLon: location.longitude,
    maxLat: location.latitude
  }
}

/**
 * Create a default location (Ballycastle, Northern Ireland)
 * @returns default location object
 */
export const getDefaultLocation = (): Location => {
  return {
    longitude: -6.2389,
    latitude: 55.2044,
    accuracy: 0
  }
}

/**
 * Generate plot geometry from location, size, and direction
 */
export const generatePlotGeometry = (
  location: Location,
  plotSize: { width: number, height: number },
  direction: number = 0
): string => {
  // Validate inputs
  if (!location) {
    throw new Error('Location is required to generate plot geometry')
  }
  
  if (!location.latitude || !location.longitude) {
    throw new Error('Location must have valid latitude and longitude')
  }
  
  if (!plotSize || !plotSize.width || !plotSize.height) {
    throw new Error('Plot size is required to generate plot geometry')
  }
  
  // Convert feet to meters
  const widthMeters = plotSize.width * 0.3048
  const heightMeters = plotSize.height * 0.3048
  
  // Convert meters to degrees (approximate)
  const latDegreesPerMeter = 1 / 111320
  const lonDegreesPerMeter = 1 / (111320 * Math.cos(location.latitude * Math.PI / 180))
  
  const widthDegrees = widthMeters * lonDegreesPerMeter
  const heightDegrees = heightMeters * latDegreesPerMeter
  
  // Create rectangle corners in lat/lng
  const halfWidth = widthDegrees / 2
  const halfHeight = heightDegrees / 2
  
  let corners = [
    [location.longitude - halfWidth, location.latitude - halfHeight], // Bottom-left
    [location.longitude + halfWidth, location.latitude - halfHeight], // Bottom-right
    [location.longitude + halfWidth, location.latitude + halfHeight], // Top-right
    [location.longitude - halfWidth, location.latitude + halfHeight], // Top-left
    [location.longitude - halfWidth, location.latitude - halfHeight]  // Close polygon
  ]
  
  // Apply rotation if direction is not 0
  if (direction !== 0) {
    const centerLon = location.longitude
    const centerLat = location.latitude
    const angleRad = (direction * Math.PI) / 180
    
    corners = corners.map(([lon, lat]) => {
      // Translate to origin
      const x = lon - centerLon
      const y = lat - centerLat
      
      // Rotate
      const rotatedX = x * Math.cos(angleRad) - y * Math.sin(angleRad)
      const rotatedY = x * Math.sin(angleRad) + y * Math.cos(angleRad)
      
      // Translate back
      return [rotatedX + centerLon, rotatedY + centerLat]
    })
  }
  
  // Convert to GeoJSON Polygon format
  const polygon = {
    type: 'Polygon',
    coordinates: [corners]
  }
  
  return JSON.stringify(polygon)
}
