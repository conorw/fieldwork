// Static imports for OpenLayers (already in bundle via manualChunks)
import View from 'ol/View'
import { fromLonLat } from 'ol/proj'

/**
 * Creates a shared OpenLayers View with consistent configuration
 * @param {Object} options - View configuration options
 * @param {Array} options.center - Center coordinates [lon, lat] or [x, y]
 * @param {number} options.zoom - Initial zoom level
 * @param {number} options.maxZoom - Maximum zoom level
 * @param {number} options.minZoom - Minimum zoom level
 * @param {string} options.viewName - Name for logging purposes
 * @param {boolean} options.isLatLng - Whether center coordinates are in lat/lng format
 * @param {Array} options.extent - Optional extent constraint [minX, minY, maxX, maxY] in the same coordinate system as center
 * @param {boolean} options.restrictExtent - Whether to restrict the view to the extent (default: true if extent is provided)
 * @returns {Promise<View>} Configured OpenLayers View
 */
type CreateMapViewOptions = {
  center?: [number, number] | number[]
  zoom?: number
  maxZoom?: number
  minZoom?: number
  viewName?: string
  isLatLng?: boolean
  extent?: [number, number, number, number] | number[] | null
  restrictExtent?: boolean
}

export const createMapView = async (options: CreateMapViewOptions) => {
  const {
    center = [-6.238, 55.204], // Default to Ballycastle
    zoom = 16,
    maxZoom = 23,
    minZoom = 17,
    isLatLng = true,
    extent = null,
    restrictExtent = true
  } = options

  let viewCenter: number[] = center as number[]
  let viewExtent: number[] | null = extent as number[] | null
  
  if (isLatLng) {
    viewCenter = fromLonLat(center as [number, number])
    
    // Convert extent to map coordinates if provided
    if (extent) {
      const ll = fromLonLat((extent as number[]).slice(0, 2) as [number, number])
      const ur = fromLonLat((extent as number[]).slice(2, 4) as [number, number])
      viewExtent = [...ll, ...ur]
    }
  }

  const viewOptions: any = {
    center: viewCenter,
    zoom: zoom,
    maxZoom: maxZoom,
    minZoom: minZoom
  }

  // Add extent constraint if provided
  if (viewExtent && restrictExtent) {
    ;(viewOptions as any).extent = viewExtent
  }

  const view = new View(viewOptions)

  // Ensure extent constraint is properly applied
  if (viewExtent && restrictExtent) {
    // Add a view change listener to enforce extent
    view.on('change:center', () => {
      const center = view.getCenter()
      if (center) {
        const [x, y] = center
        if (x < viewExtent[0] || x > viewExtent[2] || y < viewExtent[1] || y > viewExtent[3]) {
          // Constrain the center to the extent
          const constrainedX = Math.max(viewExtent[0], Math.min(viewExtent[2], x))
          const constrainedY = Math.max(viewExtent[1], Math.min(viewExtent[3], y))
          view.setCenter([constrainedX, constrainedY])
        }
      }
    })
  }

  return view
}

/**
 * Creates a shared map view with zoom enforcement
 * @param {Object} options - View configuration options
 * @param {Function} enforceZoomLimits - Function to enforce zoom limits
 * @returns {Promise<View>} Configured OpenLayers View with zoom enforcement
 */
export const createMapViewWithZoomEnforcement = async (
  options: CreateMapViewOptions,
  enforceZoomLimits: (view: any) => void
) => {
  const view = await createMapView(options)
  
  if (enforceZoomLimits) {
    // Add zoom change listener to enforce limits
    view.on('change:resolution', () => {
      enforceZoomLimits(view)
    })
  }

  return view
}