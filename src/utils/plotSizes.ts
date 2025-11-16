/**
 * Shared plot size configurations to reduce duplication
 */

export interface PlotSize {
  id: string
  name: string
  width: number
  height: number
  description?: string
}

export const PLOT_SIZES: PlotSize[] = [
  {
    id: '9x4',
    name: 'Single',
    width: 9,
    height: 4,
    description: 'Standard single grave plot'
  },
  {
    id: '9x8',
    name: 'Double',
    width: 9,
    height: 8,
    description: 'Double grave plot'
  },
  {
    id: '2x2',
    name: 'Urn',
    width: 2,
    height: 2,
    description: 'Small plot for urns'
  }
]

export const DEFAULT_PLOT_SIZE: PlotSize = PLOT_SIZES[0] // Single plot

/**
 * Get plot size by ID
 */
export const getPlotSizeById = (id: string): PlotSize | undefined => {
  return PLOT_SIZES.find(size => size.id === id)
}

/**
 * Get plot size by dimensions
 */
export const getPlotSizeByDimensions = (width: number, height: number): PlotSize | undefined => {
  return PLOT_SIZES.find(size => size.width === width && size.height === height)
}

/**
 * Convert plot size to meters
 */
export const plotSizeToMeters = (plotSize: PlotSize) => {
  return {
    widthMeters: plotSize.width * 0.3048, // feet to meters
    heightMeters: plotSize.height * 0.3048
  }
}

/**
 * Convert plot size to degrees (approximate)
 */
export const plotSizeToDegrees = (plotSize: PlotSize, latitude: number = 55.2) => {
  const meters = plotSizeToMeters(plotSize)
  
  // Approximate conversion from meters to degrees
  // 1 degree latitude ≈ 111,320 meters
  // 1 degree longitude ≈ 111,320 * cos(latitude) meters
  const latDegreesPerMeter = 1 / 111320
  const lonDegreesPerMeter = 1 / (111320 * Math.cos(latitude * Math.PI / 180))
  
  return {
    widthDegrees: meters.widthMeters * lonDegreesPerMeter,
    heightDegrees: meters.heightMeters * latDegreesPerMeter
  }
}

/**
 * Get simplified plot sizes for UI (all 3 options)
 */
export const getSimplifiedPlotSizes = (): PlotSize[] => {
  return PLOT_SIZES
}
