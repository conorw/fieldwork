<template>
  <div class="layer-control">
    <!-- Layer Control Toggle Button -->
    <button @click="togglePanel" class="layer-control-toggle" :class="{ 'active': isOpen }"
      :title="isOpen ? 'Hide Layer Controls' : 'Show Layer Controls'">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    </button>

    <!-- Layer Control Panel -->
    <div v-if="isOpen" class="layer-control-panel">
      <div class="layer-control-header">
        <h3 class="text-sm font-medium text-gray-900">Map Layers</h3>
        <button @click="togglePanel" class="text-gray-400 hover:text-gray-600">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="layer-control-content">
        <!-- Base Layer -->
        <div class="layer-group">
          <h4 class="layer-group-title">Base Layer</h4>
          <div class="layer-item">
            <label class="layer-checkbox">
              <input type="checkbox" :checked="baseLayerVisible" @change="toggleBaseLayer" class="sr-only" />
              <div class="checkbox-custom" :class="{ 'checked': baseLayerVisible }">
                <svg v-if="baseLayerVisible" class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clip-rule="evenodd" />
                </svg>
              </div>
              <span class="layer-label">Map Tiles</span>
            </label>
          </div>
        </div>

        <!-- Feature Layers -->
        <div class="layer-group">
          <h4 class="layer-group-title">Feature Layers</h4>
          <div v-for="layer in availableLayers" :key="layer.id" class="layer-item">
            <label class="layer-checkbox">
              <input type="checkbox" :checked="layer.visible" @change="toggleLayer(layer.id)" class="sr-only" />
              <div class="checkbox-custom" :class="{ 'checked': layer.visible }">
                <svg v-if="layer.visible" class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clip-rule="evenodd" />
                </svg>
              </div>
              <span class="layer-label">{{ layer.name }}</span>
            </label>
            <div class="layer-preview" :style="{ backgroundColor: layer.color }"></div>
          </div>
        </div>

        <!-- Layer Actions -->
        <div class="layer-actions">
          <button @click="showAllLayers" class="layer-action-btn">
            Show All
          </button>
          <button @click="hideAllLayers" class="layer-action-btn">
            Hide All
          </button>
          <button @click="debugLayerState" class="layer-action-btn">
            Debug
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { updateLayerVisibility, refreshMapLayers, getLayerVisibility } from '../utils/tileSource'

const props = defineProps({
  mapInstance: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['layer-visibility-changed'])

// State
const isOpen = ref(false)
const baseLayerVisible = ref(true)
const layerVisibility = ref({
  buildings: true,
  earth: true,
  landuse: true,
  pois: false,
  roads: true,
  water: true
})

// Available layers configuration
const availableLayers = computed(() => [
  { id: 'buildings', name: 'Buildings', color: '#8B4513', visible: layerVisibility.value.buildings },
  { id: 'earth', name: 'Earth', color: '#8B7355', visible: layerVisibility.value.earth },
  { id: 'landuse', name: 'Land Use', color: '#90EE90', visible: layerVisibility.value.landuse },
  { id: 'pois', name: 'Points of Interest', color: '#FF6B6B', visible: layerVisibility.value.pois },
  { id: 'roads', name: 'Roads', color: '#666666', visible: layerVisibility.value.roads },
  { id: 'water', name: 'Water', color: '#4A90E2', visible: layerVisibility.value.water }
])

// Methods
const togglePanel = () => {
  isOpen.value = !isOpen.value
}

const toggleBaseLayer = () => {
  baseLayerVisible.value = !baseLayerVisible.value
  updateMapLayers()
}

const toggleLayer = (layerId) => {
  console.log(`🔍 LayerControl: Toggling layer ${layerId}`)
  console.log(`🔍 LayerControl: Current state:`, layerVisibility.value)
  
  layerVisibility.value[layerId] = !layerVisibility.value[layerId]
  
  console.log(`🔍 LayerControl: New state:`, layerVisibility.value)
  console.log(`🔍 LayerControl: Layer ${layerId} is now:`, layerVisibility.value[layerId])
  
  updateMapLayers()
}

const showAllLayers = () => {
  baseLayerVisible.value = true
  Object.keys(layerVisibility.value).forEach(key => {
    layerVisibility.value[key] = true
  })
  updateMapLayers()
}

const hideAllLayers = () => {
  baseLayerVisible.value = false
  Object.keys(layerVisibility.value).forEach(key => {
    layerVisibility.value[key] = false
  })
  updateMapLayers()
}

const updateMapLayers = () => {
  console.log('🔍 LayerControl: updateMapLayers called')
  console.log('🔍 LayerControl: mapInstance available:', !!props.mapInstance)
  
  if (!props.mapInstance) {
    console.warn('⚠️ LayerControl: No map instance available')
    return
  }

  try {
    const layers = props.mapInstance.getLayers()
    console.log(`🔍 LayerControl: Found ${layers.getLength()} layers`)
    
    layers.forEach((layer, index) => {
      console.log(`🔍 LayerControl: Processing layer ${index}:`, {
        type: layer.constructor.name,
        hasSource: !!layer.getSource(),
        hasStyle: !!layer.getStyle(),
        sourceType: layer.getSource()?.constructor.name
      })
      
      // Handle base layer (tile layer)
      if (layer.getSource && layer.getSource().getUrl) {
        console.log(`🔍 LayerControl: Setting base layer visibility to:`, baseLayerVisible.value)
        layer.setVisible(baseLayerVisible.value)
      }
    })

    // Update global layer visibility state
    console.log('🔍 LayerControl: Updating global layer visibility:', layerVisibility.value)
    updateLayerVisibility(layerVisibility.value)
    
    // Refresh map layers to apply changes
    console.log('🔍 LayerControl: Refreshing map layers...')
    refreshMapLayers(props.mapInstance)

    // Emit event for parent components
    emit('layer-visibility-changed', {
      baseLayer: baseLayerVisible.value,
      featureLayers: { ...layerVisibility.value }
    })

    console.log('✅ LayerControl: Layer visibility updated successfully:', {
      baseLayer: baseLayerVisible.value,
      featureLayers: layerVisibility.value
    })
  } catch (error) {
    console.error('❌ LayerControl: Error updating map layers:', error)
  }
}

// Initialize layer visibility from map
const initializeLayerVisibility = () => {
  if (!props.mapInstance) return

  try {
    const layers = props.mapInstance.getLayers()

    layers.forEach((layer) => {
      // Check base layer visibility
      if (layer.getSource && layer.getSource().getUrl) {
        baseLayerVisible.value = layer.getVisible()
      }
    })
  } catch (error) {
    console.error('Error initializing layer visibility:', error)
  }
}

// Watch for map instance changes
const watchMapInstance = () => {
  if (props.mapInstance) {
    initializeLayerVisibility()
  }
}

onMounted(() => {
  watchMapInstance()
})

// Watch for map instance prop changes
watch(() => props.mapInstance, (newMapInstance, oldMapInstance) => {
  if (newMapInstance && !oldMapInstance) {
    initializeLayerVisibility()
  }
})

// Debug function to check layer state (only logs in development)
const debugLayerState = async () => {
  if (import.meta.env.DEV) {
    console.log('🔍 LayerControl: Debug Layer State')
    if (props.mapInstance) {
      const layers = props.mapInstance.getLayers()
      console.log(`🔍 LayerControl: Map has ${layers.getLength()} layers`)
    }
  }
}

// Expose methods for parent components
defineExpose({
  togglePanel,
  showAllLayers,
  hideAllLayers,
  updateMapLayers,
  debugLayerState
})
</script>

<style scoped>
.layer-control {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  z-index: 1000;
}

.layer-control-toggle {
  @apply bg-white hover:bg-gray-50 text-gray-700 hover:text-gray-900 p-2 rounded-lg shadow-md border border-gray-200 transition-all duration-200;
}

.layer-control-toggle.active {
  @apply bg-primary-50 text-primary-700 border-primary-200;
}

.layer-control-panel {
  @apply absolute bottom-12 right-0 bg-white rounded-lg shadow-lg border border-gray-200 w-64 z-50;
}

.layer-control-header {
  @apply flex items-center justify-between p-3 border-b border-gray-200;
}

.layer-control-content {
  @apply p-3 space-y-4;
}

.layer-group {
  @apply space-y-2;
}

.layer-group-title {
  @apply text-xs font-semibold text-gray-500 uppercase tracking-wide;
}

.layer-item {
  @apply flex items-center justify-between;
}

.layer-checkbox {
  @apply flex items-center space-x-2 cursor-pointer;
}

.checkbox-custom {
  @apply w-4 h-4 border-2 border-gray-300 rounded flex items-center justify-center transition-colors duration-200;
}

.checkbox-custom.checked {
  @apply bg-primary-600 border-primary-600;
}

.layer-label {
  @apply text-sm text-gray-700;
}

.layer-preview {
  @apply w-4 h-4 rounded border border-gray-200;
}

.layer-actions {
  @apply flex space-x-2 pt-2 border-t border-gray-200;
}

.layer-action-btn {
  @apply flex-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded transition-colors duration-200;
}
</style>
