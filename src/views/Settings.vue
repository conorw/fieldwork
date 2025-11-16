<template>
  <div class="h-full overflow-y-auto p-4 space-y-4">
    <!-- Header Card -->
    <Card>
      <template #content>
        <div class="space-y-3">
          <div>
            <h1 class="text-xl font-semibold text-surface-900">Settings</h1>
            <p class="text-sm text-surface-600">
              Manage app settings and facility selection
            </p>
          </div>

          <div class="flex items-center justify-between">
            <div class="text-sm">
              <span class="font-medium">Status:</span>
              <Chip :label="connectionStatus" :severity="connectionStatusSeverity" size="small" />
            </div>
          </div>
        </div>
      </template>
    </Card>

    <!-- Mobile-Friendly Accordion Layout -->
    <Accordion :multiple="true">
      <!-- Facility Selection -->
      <AccordionTab>
        <template #header>
          <div class="flex items-center justify-between w-full">
            <span>Facility Selection</span>
            <div class="text-sm text-surface-500">
              {{ locations.length }} facilities
            </div>
          </div>
        </template>

        <!-- Current Selection -->
        <Message v-if="selectedLocation" severity="info" :closable="false" class="mb-4">
          <template #icon>
            <i class="pi pi-building"></i>
          </template>
          <div class="space-y-2">
            <h3 class="font-medium text-sm">Current Facility</h3>
            <p class="text-sm">{{ selectedLocation.name }}</p>
            <div class="flex items-center justify-between text-xs">
              <span>Created: {{ formatDate(selectedLocation.dateCreated) }}</span>
              <Chip v-if="selectedLocation.isPublic" label="Public" severity="success" size="small" />
              <Chip v-else label="Private" severity="secondary" size="small" />
            </div>
            <div class="text-xs">
              Zoom: {{ selectedLocation.minZoom }} - {{ selectedLocation.maxZoom }}
            </div>
          </div>
        </Message>

        <!-- Facility List -->
        <div v-if="loading" class="text-center py-6">
          <ProgressSpinner />
          <p class="text-sm mt-2">Loading facilities...</p>
        </div>

        <Message v-else-if="locations.length === 0" severity="warn" :closable="false">
          <template #icon>
            <i class="pi pi-exclamation-triangle"></i>
          </template>
          No facilities available
        </Message>

        <div v-else class="space-y-3">
          <!-- Search -->
          <InputText v-model="searchQuery" placeholder="Search facilities..." class="w-full" />

          <!-- Facility Cards -->
          <div class="space-y-2">
            <Card v-for="location in filteredLocations" :key="location.id" @click="selectLocation(location.id)" :class="[
              'cursor-pointer',
              selectedLocationId === location.id ? 'p-highlight' : ''
            ]">
              <template #content>
                <div class="space-y-2">
                  <div class="flex items-start justify-between">
                    <h3 class="font-medium text-sm">{{ location.name }}</h3>
                    <Chip v-if="location.isPublic" label="Public" severity="success" size="small" />
                    <Chip v-else label="Private" severity="secondary" size="small" />
                  </div>

                  <div class="text-xs space-y-1">
                    <div class="flex items-center">
                      <i class="pi pi-search mr-2 text-xs"></i>
                      <span>Zoom: {{ location.minZoom }} - {{ location.maxZoom }}</span>
                    </div>

                    <div class="flex items-center">
                      <i class="pi pi-calendar mr-2 text-xs"></i>
                      <span>{{ formatDate(location.dateCreated) }}</span>
                    </div>
                  </div>
                </div>
              </template>

              <template #footer>
                <div class="flex items-center justify-between">
                  <Chip v-if="selectedLocationId === location.id" label="Selected" severity="success" size="small" />
                  <div v-else></div>

                  <Button @click.stop="confirmDeleteLocation(location)" :disabled="deletingLocationId === location.id"
                    severity="danger" size="small" icon="pi pi-trash" :loading="deletingLocationId === location.id"
                    v-tooltip.top="deletingLocationId === location.id ? 'Deleting...' : 'Delete facility'" />
                </div>
              </template>
            </Card>
          </div>
        </div>
      </AccordionTab>


      <!-- Storage Information -->
      <AccordionTab>
        <template #header>
          <div class="flex items-center justify-between w-full">
            <span>Storage Information</span>
            <Button @click="refreshStorageInfo" :disabled="storageLoading" severity="secondary" size="small" text>
              <template #icon>
                <svg class="w-4 h-4" :class="{ 'animate-spin': storageLoading }" fill="none" stroke="currentColor"
                  viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </template>
            </Button>
          </div>
        </template>

        <div class="space-y-3">
          <!-- Total Storage -->
          <Card>
            <template #content>
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-medium">Total Storage</p>
                  <p class="text-lg font-bold">{{ formatBytes(storageSummary.totalSize) }}</p>
                </div>
                <Avatar icon="pi pi-database" size="large"
                  style="background-color: var(--primary-color); color: var(--primary-color-text);" />
              </div>
            </template>
          </Card>

          <!-- Storage Breakdown -->
          <div class="grid grid-cols-2 gap-3">
            <Card>
              <template #content>
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-xs font-medium">Database</p>
                    <p class="text-sm font-bold">{{ formatBytes(storageSummary.breakdown.database.size) }}</p>
                  </div>
                  <Avatar icon="pi pi-database" size="normal"
                    style="background-color: var(--green-500); color: white;" />
                </div>
              </template>
            </Card>

            <Card>
              <template #content>
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-xs font-medium">Images</p>
                    <p class="text-sm font-bold">{{ formatBytes(storageSummary.breakdown.images.size) }}</p>
                  </div>
                  <Avatar icon="pi pi-image" size="normal" style="background-color: var(--purple-500); color: white;" />
                </div>
              </template>
            </Card>

            <Card v-if="storageSummary.breakdown.tiles.size > 0">
              <template #content>
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-xs font-medium">Map Tiles</p>
                    <p class="text-sm font-bold">{{ formatBytes(storageSummary.breakdown.tiles.size) }}</p>
                  </div>
                  <Avatar icon="pi pi-map" size="normal" style="background-color: var(--blue-500); color: white;" />
                </div>
              </template>
            </Card>

            <Card v-if="storageSummary.breakdown.cache.size > 0">
              <template #content>
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-xs font-medium">Cache</p>
                    <p class="text-sm font-bold">{{ formatBytes(storageSummary.breakdown.cache.size) }}</p>
                  </div>
                  <Avatar icon="pi pi-clock" size="normal" style="background-color: var(--orange-500); color: white;" />
                </div>
              </template>
            </Card>
          </div>
        </div>
      </AccordionTab>

      <!-- Analysis Settings -->
      <AccordionTab>
        <template #header>
          <div class="flex items-center justify-between w-full">
            <span>AI Analysis Settings</span>
            <Chip :label="settingsStore.analysisMode === 'openai' ? 'OpenAI' : 'Local'" 
                  :severity="settingsStore.analysisMode === 'openai' ? 'info' : 'success'" 
                  size="small" />
          </div>
        </template>

        <div class="space-y-4">
          <Message severity="info" :closable="false">
            <template #icon>
              <i class="pi pi-info-circle"></i>
            </template>
            <div class="space-y-2">
              <p class="text-sm font-medium">Analysis Mode</p>
              <p class="text-xs">
                Choose between OpenAI API (cloud-based, requires internet) or Local browser inference (works offline, uses device resources).
              </p>
            </div>
          </Message>

          <Card>
            <template #content>
              <div class="space-y-4">
                <div>
                  <label class="block text-sm font-medium mb-2">Analysis Provider</label>
                  <div class="space-y-2">
                    <div class="flex items-center space-x-2 p-3 border rounded-lg cursor-pointer hover:bg-surface-50"
                         :class="{ 'border-primary bg-primary-50': settingsStore.analysisMode === 'openai' }"
                         @click="settingsStore.setAnalysisMode('openai')">
                      <input type="radio" :checked="settingsStore.analysisMode === 'openai'" 
                             @change="settingsStore.setAnalysisMode('openai')" 
                             class="mr-2" />
                      <div class="flex-1">
                        <div class="font-medium text-sm">OpenAI API</div>
                        <div class="text-xs text-surface-600">Cloud-based analysis using GPT-4 Vision. Requires internet connection.</div>
                      </div>
                    </div>

                    <div class="flex items-center space-x-2 p-3 border rounded-lg cursor-pointer hover:bg-surface-50"
                         :class="{ 'border-primary bg-primary-50': settingsStore.analysisMode === 'local' }"
                         @click="settingsStore.setAnalysisMode('local')">
                      <input type="radio" :checked="settingsStore.analysisMode === 'local'" 
                             @change="settingsStore.setAnalysisMode('local')" 
                             class="mr-2" />
                      <div class="flex-1">
                        <div class="font-medium text-sm">Local Browser Model</div>
                        <div class="text-xs text-surface-600">Runs analysis locally in your browser. Works offline but may be slower.</div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Model Loading Status -->
                <div v-if="settingsStore.analysisMode === 'local'" class="space-y-2">
                  <div v-if="localModelState.isLoading" class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div class="flex items-start space-x-2">
                      <i class="pi pi-spin pi-spinner text-blue-600 mt-0.5"></i>
                      <div class="flex-1 text-xs text-blue-800">
                        <p class="font-medium mb-1">Downloading model...</p>
                        <p>Progress: {{ localModelState.loadProgress.toFixed(0) }}%</p>
                        <p class="text-blue-600 mt-1">This may take a few minutes on first use. The model will be cached for future use.</p>
                      </div>
                    </div>
                  </div>

                  <div v-else-if="localModelState.isLoaded" class="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div class="flex items-start space-x-2">
                      <i class="pi pi-check-circle text-green-600 mt-0.5"></i>
                      <div class="flex-1 text-xs text-green-800">
                        <p class="font-medium mb-1">Model Ready</p>
                        <p>The local model is loaded and ready for analysis.</p>
                      </div>
                    </div>
                  </div>

                  <div v-else-if="localModelState.error" class="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div class="flex items-start space-x-2">
                      <i class="pi pi-exclamation-triangle text-red-600 mt-0.5"></i>
                      <div class="flex-1 text-xs text-red-800">
                        <p class="font-medium mb-1">Model Loading Error</p>
                        <p>{{ localModelState.error }}</p>
                        <p class="mt-2" v-if="localModelState.error.includes('Unauthorized') || localModelState.error.includes('401')">
                          <strong>Note:</strong> The selected model is not publicly available. The app will automatically fall back to OpenAI API when analyzing images. Consider switching to OpenAI mode for reliable analysis.
                        </p>
                        <p class="mt-2" v-else-if="localModelState.error.includes('404') || localModelState.error.includes('Not Found') || localModelState.error.includes('Model not found')">
                          <strong>Model Not Found:</strong> The selected model does not have the required ONNX files or may not exist. The app will automatically fall back to OpenAI API when analyzing images. Consider switching to OpenAI mode for reliable analysis.
                        </p>
                        <p class="mt-2" v-else-if="localModelState.error.includes('Network error') || localModelState.error.includes('ERR_NAME_NOT_RESOLVED') || localModelState.error.includes('Failed to fetch')">
                          <strong>Network Issue:</strong> Unable to download models from Hugging Face. Please check your internet connection. The app will automatically fall back to OpenAI API when analyzing images. You can try again later or switch to OpenAI mode.
                        </p>
                        <p class="mt-2" v-else-if="localModelState.error.includes('403') || localModelState.error.includes('Forbidden')">
                          <strong>Access Denied:</strong> The model requires special permissions. The app will automatically fall back to OpenAI API when analyzing images. Consider switching to OpenAI mode for reliable analysis.
                        </p>
                        <p class="mt-2" v-else>
                          The model will attempt to load when you perform your first analysis, or will fall back to OpenAI API.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div v-else class="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div class="flex items-start space-x-2">
                      <i class="pi pi-info-circle text-yellow-600 mt-0.5"></i>
                      <div class="flex-1 text-xs text-yellow-800">
                        <p class="font-medium mb-1">Model Not Loaded</p>
                        <p>The model will download automatically when you perform your first headstone analysis.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </Card>
        </div>
      </AccordionTab>
    </Accordion>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useOnline } from '@vueuse/core'
import { usePowerSyncStore } from '../stores/powersync'
import { useLocationsStore } from '../stores/locations'
import { useSettingsStore } from '../stores/settings'
import { storageAnalytics } from '../utils/storageAnalytics'
import type { StorageSummary } from '../utils/storageAnalytics'
import { localLLMService } from '../services/localLLMService'

// PrimeVue imports
import InputText from 'primevue/inputtext'


const powerSyncStore = usePowerSyncStore()
const locationsStore = useLocationsStore()
const settingsStore = useSettingsStore()
const isOnline = useOnline()

// State
const loading = ref(false)
const storageLoading = ref(false)
const searchQuery = ref('')
const deletingLocationId = ref<string | null>(null)
const localModelState = ref(localLLMService.getState())

// Map settings (reactive copy)
const mapSettings = ref({ ...settingsStore.mapSettings })

// Storage analytics state
const storageSummary = ref<StorageSummary>({
  totalSize: 0,
  totalItems: 0,
  breakdown: {
    cache: { size: 0, items: 0 },
    database: { size: 0, items: 0 },
    assets: { size: 0, items: 0 },
    tiles: { size: 0, items: 0 },
    images: { size: 0, items: 0 },
    other: { size: 0, items: 0 }
  },
  items: []
})

// Computed properties
const connectionStatus = computed(() => {
  if (!isOnline.value) return 'Offline'
  if (!powerSyncStore.isInitialized) return 'Initializing'
  if (!powerSyncStore.powerSync) return 'Server Unavailable'
  return 'Connected'
})

const connectionStatusSeverity = computed(() => {
  if (!isOnline.value) return 'danger'
  if (!powerSyncStore.isInitialized) return 'warning'
  if (!powerSyncStore.powerSync) return 'warning'
  return 'success'
})

const locations = computed(() => locationsStore.locations)
const selectedLocation = computed(() => locationsStore.selectedLocation)
const selectedLocationId = computed(() => locationsStore.selectedLocationId)

const filteredLocations = computed(() => {
  if (!searchQuery.value) return locations.value
  return locations.value.filter(location =>
    location.name.toLowerCase().includes(searchQuery.value.toLowerCase())
  )
})

// Watch for model state changes
watch(() => settingsStore.analysisMode, () => {
  // Update model state when mode changes
  localModelState.value = localLLMService.getState()
  
  // Poll for state updates if loading
  if (settingsStore.analysisMode === 'local' && localModelState.value.isLoading) {
    const pollInterval = setInterval(() => {
      localModelState.value = localLLMService.getState()
      if (!localModelState.value.isLoading) {
        clearInterval(pollInterval)
      }
    }, 500)
    
    // Clean up after 5 minutes
    setTimeout(() => clearInterval(pollInterval), 5 * 60 * 1000)
  }
}, { immediate: true })

// Methods
const refreshData = async () => {
  loading.value = true
  try {
    await Promise.all([
      locationsStore.loadLocations(),
      refreshStorageInfo()
    ])
  } catch (error) {
    console.error('Error refreshing data:', error)
  } finally {
    loading.value = false
  }
}

const selectLocation = (locationId: string) => {
  locationsStore.selectLocation(locationId)
}

const refreshStorageInfo = async () => {
  storageLoading.value = true
  try {
    storageAnalytics.setPowerSyncStore(powerSyncStore)
    storageSummary.value = await storageAnalytics.getStorageSummary()
  } catch (error) {
    console.error('Error loading storage info:', error)
  } finally {
    storageLoading.value = false
  }
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatDate = (dateString: string): string => {
  if (!dateString) return 'Unknown'
  return new Date(dateString).toLocaleDateString()
}


const confirmDeleteLocation = async (location: any) => {
  const confirmed = confirm(
    `Are you sure you want to delete "${location.name}"?\n\n` +
    `This will permanently delete:\n` +
    `• The facility and all its data\n` +
    `• All plots in this facility\n` +
    `• All persons associated with those plots\n` +
    `• All images (plot and person images)\n\n` +
    `This action cannot be undone.`
  )

  if (!confirmed) return

  await deleteLocation(location.id)
}

const deleteLocation = async (locationId: string) => {
  deletingLocationId.value = locationId

  try {
    console.log(`🗑️ Starting deletion of location ${locationId}`)
    await locationsStore.deleteLocation(locationId)

    // Show success message
    alert(`✅ Facility has been successfully deleted.`)

    // Refresh the data
    await refreshData()

  } catch (error) {
    console.error('Error deleting location:', error)
    alert(`❌ Failed to delete facility: ${error instanceof Error ? error.message : 'Unknown error'}`)
  } finally {
    deletingLocationId.value = null
  }
}

// Watch for changes in settings store
watch(() => settingsStore.mapSettings, (newSettings) => {
  mapSettings.value = { ...newSettings }
}, { deep: true })

onMounted(async () => {
  await refreshData()
})
</script>
