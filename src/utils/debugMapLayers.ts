/**
 * Debug utilities for map layer issues
 */

export const debugMapLayers = {
  /**
   * Check if a map has visible layers
   */
  checkMapLayers(map: any, componentName: string) {
    if (!map) {
      console.log(`🔍 ${componentName}: No map instance`)
      return
    }

    const layers = map.getLayers()
    console.log(`🔍 ${componentName}: Map has ${layers.getLength()} layers`)
    
    layers.forEach((layer: any, index: number) => {
      console.log(`  Layer ${index}:`, {
        type: layer.constructor.name,
        visible: layer.getVisible(),
        opacity: layer.getOpacity(),
        source: layer.getSource()?.constructor.name,
        sourceUrl: layer.getSource()?.getUrl?.()
      })
    })
  },

  /**
   * Monitor layer changes
   */
  monitorLayerChanges(map: any, componentName: string) {
    if (!map) return

    const layers = map.getLayers()
    
    // Monitor layer add/remove events
    layers.on('add', (event: any) => {
      console.log(`🔍 ${componentName}: Layer added:`, event.element.constructor.name)
    })
    
    layers.on('remove', (event: any) => {
      console.log(`🔍 ${componentName}: Layer removed:`, event.element.constructor.name)
    })
  },

  /**
   * Check tile source validity
   */
  checkTileSourceValidity(tileSource: any, componentName: string) {
    if (!tileSource) {
      console.log(`🔍 ${componentName}: No tile source`)
      return false
    }

    console.log(`🔍 ${componentName}: Tile source check:`, {
      type: tileSource.constructor.name,
      visible: tileSource.getVisible(),
      opacity: tileSource.getOpacity(),
      source: tileSource.getSource()?.constructor.name,
      sourceUrl: tileSource.getSource()?.getUrl?.(),
      sourceReady: tileSource.getSource()?.getState?.() || 'unknown'
    })

    const source = tileSource.getSource()
    if (source && typeof source.getUrl === 'function') {
      const url = source.getUrl()
      if (url && url.startsWith('blob:')) {
        try {
          new URL(url)
          console.log(`🔍 ${componentName}: Blob URL is valid`)
          return true
        } catch (error) {
          console.log(`🔍 ${componentName}: Blob URL is invalid:`, error)
          return false
        }
      }
    }

    return true
  }
}

// Make available globally in development
if (import.meta.env.DEV) {
  (window as any).debugMapLayers = debugMapLayers
  console.log('🔧 Map layer debug utilities available as window.debugMapLayers')
}
