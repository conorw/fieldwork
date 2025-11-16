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
  console.log('createMapView: Starting map view creation...')
  console.log('createMapView: Options:', options)
  const {
    center = [-6.238, 55.204], // Default to Ballycastle
    zoom = 16,
    maxZoom = 23,
    minZoom = 17,
    viewName = 'Unknown',
    isLatLng = true,
    extent = null,
    restrictExtent = true
  } = options

  console.log(`${viewName}: Creating map view with options:`, {
    center,
    zoom,
    maxZoom,
    minZoom,
    isLatLng,
    extent,
    restrictExtent
  })

  const { default: View } = await import('ol/View')
  
  let viewCenter: number[] = center as number[]
  let viewExtent: number[] | null = extent as number[] | null
  
  if (isLatLng) {
    const { fromLonLat } = await import('ol/proj')
    viewCenter = fromLonLat(center as [number, number])
    
    // Convert extent to map coordinates if provided
    if (extent) {
      const ll = fromLonLat((extent as number[]).slice(0, 2) as [number, number])
      const ur = fromLonLat((extent as number[]).slice(2, 4) as [number, number])
      viewExtent = [...ll, ...ur]
    }
    
    console.log(`${viewName}: Converted lat/lng to map coordinates:`, {
      originalCenter: center,
      convertedCenter: viewCenter,
      originalExtent: extent,
      convertedExtent: viewExtent
    })
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
    console.log(`${viewName}: Added extent constraint:`, viewExtent)
  }

  const view = new View(viewOptions)

  // Ensure extent constraint is properly applied
  if (viewExtent && restrictExtent) {
    console.log(`${viewName}: Verifying extent constraint:`, {
      viewExtent: viewExtent,
      viewHasExtent: !!view.get('extent'),
      viewExtentValue: view.get('extent')
    })
    
    // Set extent if not already set
    // OpenLayers v8 View does not expose setExtent directly for types; rely on constructor option and runtime check
    
    // Add a view change listener to enforce extent
    view.on('change:center', () => {
      const center = view.getCenter()
      if (center) {
        const [x, y] = center
        if (x < viewExtent[0] || x > viewExtent[2] || y < viewExtent[1] || y > viewExtent[3]) {
          console.log(`${viewName}: Center outside extent, constraining...`, { center, viewExtent })
          // Constrain the center to the extent
          const constrainedX = Math.max(viewExtent[0], Math.min(viewExtent[2], x))
          const constrainedY = Math.max(viewExtent[1], Math.min(viewExtent[3], y))
          view.setCenter([constrainedX, constrainedY])
        }
      }
    })
    
    console.log(`${viewName}: Added extent enforcement listener`)
  }

  console.log(`${viewName}: Map view created successfully:`, {
    center: view.getCenter(),
    zoom: view.getZoom(),
    maxZoom: view.getMaxZoom(),
    minZoom: view.getMinZoom(),
    extent: viewExtent
  })

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
      const currentZoom = view.getZoom()
      console.log(`${options.viewName || 'Map'}: Zoom changed to:`, currentZoom)
      enforceZoomLimits(view)
    })
    
    console.log(`${options.viewName || 'Map'}: Zoom enforcement added to view`)
  }

  return view
}