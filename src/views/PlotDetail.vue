<template>
  <div class="h-full overflow-y-auto">
    <div class="space-y-6 p-4">
      <!-- Header Card -->
      <Card>
        <template #content>
          <div class="flex items-center justify-between">
            <div>
              <h1 class="text-xl font-semibold text-surface-900">
                Plot {{ effectivePlot?.section }}-{{ effectivePlot?.row }}-{{ effectivePlot?.number }}
              </h1>
              <p class="text-sm text-surface-600">
                Created {{ effectivePlot ? formatDate(effectivePlot.date_created) : '' }}
              </p>
            </div>
            <div class="flex items-center space-x-4">
              <Chip v-if="plotSyncStatus === 'pending'" label="Pending Sync" severity="warning" size="small" />

              <!-- Edit/Save/Cancel Buttons -->
              <div v-if="!isEditing" class="flex space-x-2">
                <Button @click="startEditing" severity="primary" icon="pi pi-pencil" v-tooltip.top="'Edit Details'" />
                <Button @click="deletePlot" severity="danger" :loading="deleting" icon="pi pi-trash"
                  v-tooltip.top="deleting ? 'Deleting...' : 'Delete Plot'" />
              </div>

              <div v-else class="flex space-x-2">
                <Button @click="saveChanges" severity="primary" :loading="saving" icon="pi pi-check"
                  v-tooltip.top="saving ? 'Saving...' : 'Save Changes'" />
                <Button @click="cancelEditing" severity="secondary" :disabled="saving" icon="pi pi-times"
                  v-tooltip.top="'Cancel'" />
              </div>
            </div>
          </div>
        </template>
      </Card>

      <!-- Loading State -->
      <div v-if="loading" class="flex justify-center py-8">
        <div class="text-center">
          <ProgressSpinner />
          <p class="mt-2 text-sm">Loading plot details...</p>
        </div>
      </div>

      <!-- Error State -->
      <Message v-else-if="error" severity="error" :closable="false">
        <template #icon>
          <i class="pi pi-exclamation-triangle"></i>
        </template>
        <div>
          <h3 class="font-medium">Error loading plot</h3>
          <p class="text-sm mt-1">{{ error.message }}</p>
        </div>
      </Message>

      <!-- Not Found State -->
      <Message v-else-if="!effectivePlot" severity="warn" :closable="false">
        <template #icon>
          <i class="pi pi-info-circle"></i>
        </template>
        <div>
          <h3 class="font-medium">Plot not found</h3>
          <p class="text-sm mt-1">The requested plot could not be found.</p>
        </div>
      </Message>

      <!-- Plot Content -->
      <div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <!-- Plot Information -->
        <div class="lg:col-span-2 space-y-8">
          <!-- Basic Details -->
          <Card>
            <template #title>Plot Details</template>
            <template #content>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <label class="block text-sm font-medium mb-2">Section</label>
                  <InputText v-if="isEditing" v-model="editablePlot.section" placeholder="Enter section"
                    class="w-full" />
                  <p v-else class="text-sm">{{ effectivePlot.section }}</p>
                </div>
                <div>
                  <label class="block text-sm font-medium mb-2">Row</label>
                  <InputText v-if="isEditing" v-model="editablePlot.row" placeholder="Enter row" class="w-full" />
                  <p v-else class="text-sm">{{ effectivePlot.row }}</p>
                </div>
                <div>
                  <label class="block text-sm font-medium mb-2">Number</label>
                  <InputText v-if="isEditing" v-model="editablePlot.number" placeholder="Enter number" class="w-full" />
                  <p v-else class="text-sm">{{ effectivePlot.number }}</p>
                </div>
                <div>
                  <label class="block text-sm font-medium mb-2">Status</label>
                  <Dropdown v-if="isEditing" v-model="editablePlot.status" :options="statusOptions" option-label="label" option-value="value" class="w-full" />
                  <Chip v-else :label="effectivePlot.status" :severity="getStatusSeverity(effectivePlot.status)" />
                </div>
              </div>

              <div class="mt-6">
                <label class="block text-sm font-medium mb-2">People Buried in Plot</label>
                <p class="text-sm">{{ peopleNames }}</p>
              </div>

              <div class="mt-6">
                <label class="block text-sm font-medium mb-2">Notes</label>
                <Textarea v-if="isEditing" v-model="editablePlot.notes" rows="3" placeholder="Enter notes..."
                  class="w-full" />
                <p v-else class="text-sm">{{ effectivePlot.notes || 'No notes' }}</p>
              </div>
            </template>
          </Card>

          <!-- Photos -->
          <Card>
            <template #title>
              <div class="flex items-center justify-between">
                <span>Photos</span>
                <Button @click="capturePhoto" severity="primary" size="small" icon="pi pi-camera"
                  v-tooltip.top="'Add Photo'" />
              </div>
            </template>
            <template #content>
              <div v-if="(images?.length || 0) === 0" class="text-center py-8">
                <i class="pi pi-image text-4xl text-surface-400 mb-4"></i>
                <p class="text-sm">No photos yet</p>
              </div>

              <div v-else>
                <ThumbnailViewer :images="images"
                  :title="`Plot ${effectivePlot.section}-${effectivePlot.row}-${effectivePlot.number} Photos`"
                  :max-thumbnails="12"
                  :image-alt="`Plot ${effectivePlot.section}-${effectivePlot.row}-${effectivePlot.number} photo`"
                  :show-quality-indicator="true" :show-hover-actions="false" :show-delete-button="true"
                  :delete-confirm-message="`Are you sure you want to delete this photo from plot ${effectivePlot.section}-${effectivePlot.row}-${effectivePlot.number}?`"
                  @image-click="viewPhoto" @image-delete="handleImageDelete"
                  class="grid grid-cols-2 md:grid-cols-3 gap-6" />
              </div>
            </template>
          </Card>

          <!-- People Buried in Plot -->
          <Card>
            <template #title>
              <div class="flex items-center justify-between">
                <span>People Buried in Plot ({{ plotPersons.length }})</span>
                <Button @click="showAddPersonModal = true" severity="primary" size="small" icon="pi pi-plus"
                  v-tooltip.top="'Add Person'" />
              </div>
            </template>
            <template #content>
              <div v-if="plotPersons.length === 0" class="text-center py-8">
                <i class="pi pi-users text-4xl text-surface-400 mb-4"></i>
                <p class="text-sm">No people recorded for this plot</p>
              </div>

              <div v-else class="space-y-4">
                <Card v-for="person in plotPersons" :key="person.id" class="hover:shadow-md transition-shadow">
                  <template #content>
                    <div class="flex items-start justify-between">
                      <div class="flex-1">
                        <div class="flex items-center space-x-3 mb-3">
                          <h4 class="text-lg font-medium">{{ person.full_name }}</h4>
                          <Chip v-if="person.veteran" label="Veteran" severity="info" size="small" />
                          <Chip v-if="person.person_of_interest" label="Person of Interest" severity="warning"
                            size="small" />
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div v-if="person.date_of_birth">
                            <span class="font-medium">Born:</span> {{ formatDate(person.date_of_birth) }}
                          </div>
                          <div v-if="person.date_of_death">
                            <span class="font-medium">Died:</span> {{ formatDate(person.date_of_death) }}
                          </div>
                          <div v-if="person.age_at_death || (person.date_of_birth && person.date_of_death)">
                            <span class="font-medium">Age at Death:</span> {{ getAgeAtDeathDisplay(person) }}
                          </div>
                          <div v-if="person.gender">
                            <span class="font-medium">Gender:</span> {{ person.gender }}
                          </div>
                          <div v-if="person.marital_status">
                            <span class="font-medium">Marital Status:</span> {{ person.marital_status }}
                          </div>
                          <div v-if="person.known_as">
                            <span class="font-medium">Known As:</span> {{ person.known_as }}
                          </div>
                        </div>

                        <div v-if="person.notes" class="mt-4">
                          <span class="font-medium">Notes:</span>
                          <p class="text-sm mt-2">{{ person.notes }}</p>
                        </div>
                      </div>

                      <div class="flex items-center space-x-2 ml-4">
                        <Button @click="editPerson(person)" severity="secondary" size="small" text
                          icon="pi pi-pencil" />
                        <Button @click="deletePerson(person)" severity="danger" size="small" text icon="pi pi-trash" />
                      </div>
                    </div>
                  </template>
                </Card>
              </div>
            </template>
          </Card>
        </div>

        <!-- Plot Information Sidebar -->
        <div class="space-y-8">
          <div class="card">
            <h3 class="text-lg font-medium text-gray-900 mb-6">Plot Location</h3>
            <div class="w-full flex justify-center">
              <div ref="miniMapElement" style="width:300px; height:300px; border-radius:12px; overflow:hidden;"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Person Modal -->
      <div v-if="showAddPersonModal || showEditPersonModal"
        class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
        <div class="relative top-20 mx-auto p-8 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
          <div class="mt-3">
            <div class="flex items-center justify-between mb-6">
              <h3 class="text-lg font-medium text-gray-900">
                {{ showEditPersonModal ? 'Edit Person' : 'Add Person to Plot' }}
              </h3>
              <button @click="closePersonModal" class="text-gray-400 hover:text-gray-600">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form @submit.prevent="savePerson" class="space-y-6 max-h-96 overflow-y-auto">
              <!-- Basic Information -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label class="block text-sm font-medium text-gray-700">Title</label>
                  <input v-model="personForm.title" type="text" class="mt-1 input-field"
                    placeholder="Mr, Mrs, Dr, etc." />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">Forename *</label>
                  <input v-model="personForm.forename" type="text" required class="mt-1 input-field"
                    placeholder="First name" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">Middle Name</label>
                  <input v-model="personForm.middle_name" type="text" class="mt-1 input-field"
                    placeholder="Middle name" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">Surname *</label>
                  <input v-model="personForm.surname" type="text" required class="mt-1 input-field"
                    placeholder="Last name" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">Known As</label>
                  <input v-model="personForm.known_as" type="text" class="mt-1 input-field" placeholder="Nickname" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">Maiden Name</label>
                  <input v-model="personForm.maiden_name" type="text" class="mt-1 input-field"
                    placeholder="Maiden name" />
                </div>
              </div>

              <!-- Personal Details -->
              <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label class="block text-sm font-medium text-gray-700">Gender</label>
                  <select v-model="personForm.gender" class="mt-1 input-field">
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">Date of Birth</label>
                  <input v-model="personForm.date_of_birth" type="date" class="mt-1 input-field" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">Marital Status</label>
                  <select v-model="personForm.marital_status" class="mt-1 input-field">
                    <option value="">Select Status</option>
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Divorced">Divorced</option>
                    <option value="Widowed">Widowed</option>
                  </select>
                </div>
              </div>

              <!-- Death Information -->
              <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label class="block text-sm font-medium text-gray-700">Date of Death</label>
                  <input v-model="personForm.date_of_death" type="date" class="mt-1 input-field" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">Age at Death</label>
                  <input v-model.number="personForm.age_at_death" type="number" class="mt-1 input-field"
                    placeholder="Age" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">Time of Death</label>
                  <input v-model="personForm.time_of_death" type="time" class="mt-1 input-field" />
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700">Cause of Death</label>
                <input v-model="personForm.cause_of_death" type="text" class="mt-1 input-field"
                  placeholder="Cause of death" />
              </div>

              <!-- Birth Information -->
              <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label class="block text-sm font-medium text-gray-700">Birth City</label>
                  <input v-model="personForm.birth_city" type="text" class="mt-1 input-field" placeholder="City" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">Birth Country</label>
                  <input v-model="personForm.birth_country" type="text" class="mt-1 input-field"
                    placeholder="Country" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">Birth Sub-Country</label>
                  <input v-model="personForm.birth_sub_country" type="text" class="mt-1 input-field"
                    placeholder="State/Province" />
                </div>
              </div>

              <!-- Contact Information -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label class="block text-sm font-medium text-gray-700">Address Line 1</label>
                  <input v-model="personForm.address_line1" type="text" class="mt-1 input-field"
                    placeholder="Street address" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">Address Line 2</label>
                  <input v-model="personForm.address_line2" type="text" class="mt-1 input-field"
                    placeholder="Apartment, suite, etc." />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">Town</label>
                  <input v-model="personForm.town" type="text" class="mt-1 input-field" placeholder="Town/City" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">County</label>
                  <input v-model="personForm.county" type="text" class="mt-1 input-field" placeholder="County" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">Country</label>
                  <input v-model="personForm.country" type="text" class="mt-1 input-field" placeholder="Country" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">Postcode</label>
                  <input v-model="personForm.postcode" type="text" class="mt-1 input-field" placeholder="Postal code" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">Mobile</label>
                  <input v-model="personForm.mobile" type="tel" class="mt-1 input-field" placeholder="Mobile number" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">Landline</label>
                  <input v-model="personForm.landline" type="tel" class="mt-1 input-field"
                    placeholder="Landline number" />
                </div>
                <div class="md:col-span-2">
                  <label class="block text-sm font-medium text-gray-700">Email Address</label>
                  <input v-model="personForm.email_address" type="email" class="mt-1 input-field"
                    placeholder="Email address" />
                </div>
              </div>

              <!-- Additional Information -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label class="block text-sm font-medium text-gray-700">Race</label>
                  <input v-model="personForm.race" type="text" class="mt-1 input-field" placeholder="Race" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">Ethnicity</label>
                  <input v-model="personForm.ethnicity" type="text" class="mt-1 input-field" placeholder="Ethnicity" />
                </div>
              </div>

              <!-- Status Flags -->
              <div class="flex items-center space-x-6">
                <label class="flex items-center">
                  <input v-model="personForm.deceased" type="checkbox"
                    class="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50" />
                  <span class="ml-2 text-sm text-gray-700">Deceased</span>
                </label>
                <label class="flex items-center">
                  <input v-model="personForm.veteran" type="checkbox"
                    class="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50" />
                  <span class="ml-2 text-sm text-gray-700">Veteran</span>
                </label>
                <label class="flex items-center">
                  <input v-model="personForm.person_of_interest" type="checkbox"
                    class="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50" />
                  <span class="ml-2 text-sm text-gray-700">Person of Interest</span>
                </label>
              </div>

              <!-- Notes -->
              <div>
                <label class="block text-sm font-medium text-gray-700">Notes</label>
                <textarea v-model="personForm.notes" rows="3" class="mt-1 input-field"
                  placeholder="Additional notes about this person..."></textarea>
              </div>

              <!-- Form Actions -->
              <div class="flex justify-end space-x-4 pt-6">
                <button type="button" @click="closePersonModal" class="btn-secondary">
                  Cancel
                </button>
                <button type="submit" :disabled="savingPerson" class="btn-primary">
                  <svg v-if="savingPerson" class="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z">
                    </path>
                  </svg>
                  {{ savingPerson ? 'Saving...' : (showEditPersonModal ? 'Update Person' : 'Add Person') }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePowerSyncStore, usePlot, usePlotImages } from '../stores/powersync'
import { usePersonsStore } from '../stores/persons'
import { useLocationsStore } from '../stores/locations'
import { useMapStore } from '../stores/map'
import { createMapView } from '../utils/mapView'
import { createBestTileSource } from '../utils/tileSource'
import { base64ToBlob } from '../powersync-schema'
import { progressiveImageLoader } from '../utils/imageDisplayUtils'
import ThumbnailViewer from '../components/ThumbnailViewer.vue'

// Static imports for OpenLayers (already in bundle via manualChunks)
import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import XYZ from 'ol/source/XYZ'
import Feature from 'ol/Feature'
import Polygon from 'ol/geom/Polygon'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { fromLonLat } from 'ol/proj'

const props = defineProps({
  id: {
    type: String,
    default: null
  }
})

const route = useRoute()
const router = useRouter()
const powerSyncStore = usePowerSyncStore()
const personsStore = usePersonsStore()
const locationsStore = useLocationsStore()
const mapStore = useMapStore()

const peopleNames = computed(() => {
  return plotPersons.value.map(person => person.full_name).join(', ')
})

// Use PowerSync queries for reactive data
// Try to get plotId from props first, then from route params
const plotId = props.id || route.params.id

const { data: plot, loading, error, refetch: refetchPlot } = usePlot(plotId)
const { data: images, refetch: refetchImages } = usePlotImages(plotId)

// Fallback plot data from route query or events
const fallbackPlot = ref(null)

// Check if plot data was passed in route query
if (route.query.plotData) {
  try {
    fallbackPlot.value = JSON.parse(String(route.query.plotData))
  } catch (e) {
    console.error('Error parsing fallback plot data:', e)
  }
}

// Use fallback plot if main plot is not available
const effectivePlot = computed(() => {
  return plot.value || fallbackPlot.value
})

// Person management state
const showAddPersonModal = ref(false)
const showEditPersonModal = ref(false)
const savingPerson = ref(false)
const editingPerson = ref(null)

// Person form data
const personForm = ref({
  title: '',
  forename: '',
  middle_name: '',
  surname: '',
  full_name: '',
  address_line1: '',
  address_line2: '',
  town: '',
  county: '',
  country: '',
  postcode: '',
  mobile: '',
  landline: '',
  email_address: '',
  gender: '',
  date_of_birth: '',
  deceased: true, // Default to deceased for burial plots
  notes: '',
  race: '',
  ethnicity: '',
  birth_city: '',
  birth_sub_country: '',
  birth_country: '',
  marital_status: '',
  known_as: '',
  maiden_name: '',
  date_of_death: '',
  age_at_death: null,
  cause_of_death: '',
  person_of_interest: false,
  veteran: false,
  time_of_death: ''
})

// Computed properties for persons
const plotPersons = computed(() => {
  if (!effectivePlot.value?.id) return []
  return personsStore.getPersonsByPlot(effectivePlot.value.id)
})

// Mini map element ref
const miniMapElement = ref(null)
let miniMap = null

// Listen for refetch events
onMounted(() => {
  const handleRefetchImages = (event) => {
    if (event.detail.plotId === plotId) {
      refetchImages()
    }
  }

  window.addEventListener('refetch-images', handleRefetchImages)

  // Handle newly created plots that might not be immediately available
  const handlePlotCreated = (event) => {
    if (event.detail.plotId === plotId) {
      // Set fallback plot data if provided
      if (event.detail.plot) {
        fallbackPlot.value = event.detail.plot
      }
      setTimeout(() => {
        refetchPlot()
      }, 1000) // Wait a bit for the data to be available
    }
  }

  window.addEventListener('plot-created', handlePlotCreated)

  // Cleanup on unmount
  onUnmounted(() => {
    window.removeEventListener('refetch-images', handleRefetchImages)
    window.removeEventListener('plot-created', handlePlotCreated)
    if (miniMap) {
      miniMap.setTarget(null)
      miniMap = null
    }
  })
})


// Retry mechanism for plot loading
let retryCount = 0
const maxRetries = 5

watch([plot, loading, error], ([newPlot, isLoading, hasError]) => {
  // If we have fallback plot data, don't retry - the plot was just created
  if (fallbackPlot.value) {
    return
  }

  // If plot is not found and we haven't exceeded retries, try again
  if (!newPlot && !isLoading && !hasError && retryCount < maxRetries) {
    retryCount++
    setTimeout(() => {
      refetchPlot()
    }, 1000 * retryCount) // Exponential backoff
  }
}, { immediate: true })

// Computed properties
const plotSyncStatus = computed(() => {
  // This would check the sync status for this specific plot
  return 'synced' // Placeholder
})

const isEditing = ref(false)
const saving = ref(false)
const deleting = ref(false)
const editablePlot = ref({})

// Check if we should automatically enter edit mode
const shouldAutoEdit = computed(() => {
  return route.query.editMode === 'true'
})

const startEditing = () => {
  // Create a copy of the plot data for editing
  editablePlot.value = {
    section: effectivePlot.value?.section || '',
    row: effectivePlot.value?.row || '',
    number: effectivePlot.value?.number || '',
    status: effectivePlot.value?.status || 'Active',
    type: effectivePlot.value?.type || '',
    depth: effectivePlot.value?.depth || 6,
    notes: effectivePlot.value?.notes || ''
  }
  isEditing.value = true
}

// Watch for plot data and auto-edit if needed
watch(effectivePlot, (newPlot) => {
  if (newPlot && newPlot.id && shouldAutoEdit.value && !isEditing.value) {
    startEditing()
    // Remove the editMode parameter from URL
    router.replace({ query: {} })
  }
}, { immediate: true })

const cancelEditing = () => {
  isEditing.value = false
  editablePlot.value = {}
}

const saveChanges = async () => {
  saving.value = true
  try {
    // Update the plot with the edited data
    const updatedPlotData = {
      ...effectivePlot.value,
      ...editablePlot.value,
      dateModified: new Date().toISOString(),
      modifiedBy: 'anonymous'
    }

    // Check if this is a newly created plot that might not be in Zero.dev yet
    if (fallbackPlot.value && !plot.value) {

      try {
        // Try to create the plot in PowerSync if it doesn't exist
        const createdPlot = await powerSyncStore.createNewPlot(updatedPlotData)
        console.log('Plot created in Zero.dev:', createdPlot)

        // Update the fallback plot with the created data
        fallbackPlot.value = createdPlot

        // Exit editing mode
        isEditing.value = false
        editablePlot.value = {}

        // Emit event to notify other components
        window.dispatchEvent(new CustomEvent('plot-updated', {
          detail: { plotId: createdPlot.id, plot: createdPlot }
        }))

        console.log('Newly created plot saved successfully!')
        return
      } catch (createError) {
        console.error('Error creating plot in Zero.dev:', createError)
        // Continue with update attempt
      }
    }

    // Update the plot in the PowerSync store
    const result = await powerSyncStore.updateExistingPlot(effectivePlot.value.id, updatedPlotData)
    console.log('Plot update result:', result)

    // Sync happens automatically - no need for manual sync
    console.log('Plot details saved successfully, sync will happen automatically')

    // Exit editing mode
    isEditing.value = false
    editablePlot.value = {}

    // Emit event to notify other components
    window.dispatchEvent(new CustomEvent('plot-updated', {
      detail: { plotId: effectivePlot.value.id, plot: updatedPlotData }
    }))

    console.log('Plot details saved successfully!')

  } catch (error) {
    console.error('Error saving plot:', error)

    // Provide more specific error message for plot not found
    if (error.message === 'Plot not found') {
      alert('This plot was recently created and is not yet available for editing. Please wait a moment and try again, or refresh the page.')
    } else {
      alert('Failed to save plot details. Please try again.')
    }
  } finally {
    saving.value = false
  }
}

const deletePlot = async () => {
  if (!effectivePlot.value?.id) {
    alert('No plot to delete')
    return
  }

  const plotIdentifier = `${effectivePlot.value.section}-${effectivePlot.value.row}-${effectivePlot.value.number}`
  const confirmMessage = `Are you sure you want to delete plot ${plotIdentifier}?\n\nThis will permanently delete:\n- The plot\n- All photos associated with this plot\n- All persons buried in this plot\n\nThis action cannot be undone.`

  if (!confirm(confirmMessage)) {
    return
  }

  deleting.value = true
  try {
    console.log('Starting plot deletion process for plot:', effectivePlot.value.id)

    // 1. Delete all persons associated with this plot
    console.log('Deleting persons for plot:', effectivePlot.value.id)
    const personsToDelete = personsStore.getPersonsByPlot(effectivePlot.value.id)
    for (const person of personsToDelete) {
      try {
        await personsStore.deletePerson(person.id)
        console.log('Deleted person:', person.full_name)
      } catch (error) {
        console.error('Error deleting person:', person.full_name, error)
      }
    }

    // 2. Delete all images associated with this plot
    console.log('Deleting images for plot:', effectivePlot.value.id)
    try {
      await powerSyncStore.powerSync?.execute('DELETE FROM plot_images WHERE plot_id = ?', [effectivePlot.value.id])
      console.log('Deleted all images for plot')
    } catch (error) {
      console.error('Error deleting images:', error)
    }

    // 3. Remove plot from map
    console.log('Removing plot from map:', effectivePlot.value.id)
    try {
      mapStore.removePlotMarker(effectivePlot.value.id)
      console.log('Removed plot from map')
    } catch (error) {
      console.error('Error removing plot from map:', error)
    }

    // 4. Delete the plot itself
    console.log('Deleting plot:', effectivePlot.value.id)
    await powerSyncStore.deletePlot(effectivePlot.value.id)
    console.log('Plot deleted successfully')

    // 5. Navigate back to plots list
    console.log('Navigating back to plots list')
    router.push('/plots')

    // 6. Emit event to notify other components
    window.dispatchEvent(new CustomEvent('plot-deleted', {
      detail: { plotId: effectivePlot.value.id, plot: effectivePlot.value }
    }))

    console.log('Plot deletion completed successfully')

  } catch (error) {
    console.error('Error deleting plot:', error)
    alert('Failed to delete plot. Please try again.')
  } finally {
    deleting.value = false
  }
}

onMounted(async () => {
  // Component is ready, PowerSync initialization is handled by the store
})

const capturePhoto = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true })
    const video = document.createElement('video')
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')

    video.srcObject = stream
    video.play()

    video.onloadedmetadata = () => {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      context.drawImage(video, 0, 0)

      canvas.toBlob(async (blob) => {
        const fileName = `plot_${effectivePlot.value.section}_${effectivePlot.value.row}_${effectivePlot.value.number}_${Date.now()}.jpg`
        await powerSyncStore.addPlotImage(effectivePlot.value.id, blob, fileName)

        // Stop camera
        stream.getTracks().forEach(track => track.stop())
      }, 'image/jpeg', 0.8)
    }
  } catch (err) {
    console.error('Error capturing photo:', err)
    alert('Failed to capture photo. Please ensure camera permissions are granted.')
  }
}

const deleteImage = async (imageId) => {
  if (confirm('Are you sure you want to delete this photo?')) {
    try {
      await powerSyncStore.powerSync?.execute('DELETE FROM plot_images WHERE id = ?', [imageId])
    } catch (err) {
      console.error('Error deleting image:', err)
    }
  }
}

const handleImageDelete = async (image) => {
  await deleteImage(image.id)
}

const viewPhoto = (image) => {
  const blob = base64ToBlob(image.data, 'image/jpeg')
  window.open(URL.createObjectURL(blob), '_blank')
}

// Image handlers for ThumbnailViewer

const getStatusSeverity = (status) => {
  const severities = {
    'Active': 'success',
    'Reserved': 'warning',
    'Occupied': 'secondary',
    'Unavailable': 'danger'
  }
  return severities[status] || 'secondary'
}

const statusOptions = [
  { label: 'Active', value: 'Active' },
  { label: 'Reserved', value: 'Reserved' },
  { label: 'Occupied', value: 'Occupied' },
  { label: 'Unavailable', value: 'Unavailable' }
]

const getStatusColor = (status) => {
  const colors = {
    'Active': 'bg-green-100 text-green-800',
    'Reserved': 'bg-yellow-100 text-yellow-800',
    'Occupied': 'bg-gray-100 text-gray-800',
    'Unavailable': 'bg-red-100 text-red-800'
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}

const formatDate = (dateString) => {
  // format date to year, month, day e.g. 2025-01-01, remove the time
  return new Date(dateString).toLocaleDateString({ year: 'numeric', month: '2-digit', day: '2-digit' })
}

const calculateAgeAtDeath = (person) => {
  // If age_at_death is already provided and is a valid number, use it
  if (person.age_at_death && !isNaN(parseInt(person.age_at_death))) {
    const age = parseInt(person.age_at_death)
    if (age >= 0) {
      return age
    }
  }

  // If we have both birth and death dates, calculate the age
  if (person.date_of_birth && person.date_of_death) {
    try {
      const birthDate = new Date(person.date_of_birth)
      const deathDate = new Date(person.date_of_death)

      // Check if dates are valid
      if (isNaN(birthDate.getTime()) || isNaN(deathDate.getTime())) {
        return null
      }

      // Check if death date is after birth date
      if (deathDate < birthDate) {
        return null
      }

      // Calculate age in years
      let age = deathDate.getFullYear() - birthDate.getFullYear()
      const monthDiff = deathDate.getMonth() - birthDate.getMonth()

      // Adjust if birthday hasn't occurred yet in the death year
      if (monthDiff < 0 || (monthDiff === 0 && deathDate.getDate() < birthDate.getDate())) {
        age--
      }

      // Handle infant deaths (less than 1 year old)
      if (age === 0) {
        const daysDiff = Math.floor((deathDate - birthDate) / (1000 * 60 * 60 * 24))
        if (daysDiff < 30) {
          return `${daysDiff} day${daysDiff === 1 ? '' : 's'}`
        } else if (daysDiff < 365) {
          const months = Math.floor(daysDiff / 30)
          return `${months} month${months === 1 ? '' : 's'}`
        }
      }

      return age
    } catch (error) {
      console.error('Error calculating age at death:', error)
      return null
    }
  }

  return null
}

const getAgeAtDeathDisplay = (person) => {
  const age = calculateAgeAtDeath(person)
  if (age === null) {
    return 'Unknown'
  }

  if (typeof age === 'string') {
    // This is an infant death (days or months)
    return age
  }

  // Regular age in years
  return `${age} year${age === 1 ? '' : 's'}`
}

// Mini map setup
watch(effectivePlot, async (newPlot) => {
  // Wait for the next tick to ensure miniMapElement is available
  await nextTick()

  if (!miniMapElement.value || !newPlot || !newPlot.geometry) {
    return
  }

  // Clean up previous map
  if (miniMap) {
    miniMap.setTarget(null)
    miniMap = null
  }

  try {
    // Parse geometry
    let coordinates = []
    try {
      const geometry = JSON.parse(newPlot.geometry)
      coordinates = geometry.coordinates[0]
    } catch (e) {
      console.error('Error parsing plot geometry:', e)
      return
    }

    // Detect format
    const isLatLngFormat = coordinates.some(coord => Math.abs(coord[0]) <= 180 && Math.abs(coord[1]) <= 90)
    let mapCoordinates = isLatLngFormat ? coordinates.map(coord => fromLonLat(coord)) : coordinates


    // Create feature
    const plotFeature = new Feature({
      geometry: new Polygon([mapCoordinates]),
      plot: newPlot
    })

    const vectorLayer = new VectorLayer({
      source: new VectorSource({ features: [plotFeature] })
    })

    // Create view using shared utility
    const view = await createMapView({
      center: mapCoordinates[0],
      zoom: 22,
      maxZoom: 19,
      minZoom: 18,
      viewName: 'PlotDetail-Mini',
      isLatLng: false // Coordinates are already in map projection
    })

    const tileSource = await createBestTileSource(locationsStore.selectedLocation, 'PlotDetail-Mini')

    miniMap = new Map({
      target: miniMapElement.value,
      layers: [tileSource,
        vectorLayer
      ],
      view: view,
      controls: []
    })

    // Fit view to polygon
    setTimeout(() => {
      try {
        miniMap.getView().fit(plotFeature.getGeometry().getExtent(), { padding: [20, 20, 20, 20] })
      } catch (error) {
        console.error('Error fitting map to polygon:', error)
      }
    }, 200)

  } catch (error) {
    console.error('Error creating mini map:', error)
  }
}, { immediate: true })

// Person management functions
const resetPersonForm = () => {
  personForm.value = {
    title: '',
    forename: '',
    middle_name: '',
    surname: '',
    full_name: '',
    address_line1: '',
    address_line2: '',
    town: '',
    county: '',
    country: '',
    postcode: '',
    mobile: '',
    landline: '',
    email_address: '',
    gender: '',
    date_of_birth: '',
    deceased: true,
    notes: '',
    race: '',
    ethnicity: '',
    birth_city: '',
    birth_sub_country: '',
    birth_country: '',
    marital_status: '',
    known_as: '',
    maiden_name: '',
    date_of_death: '',
    age_at_death: null,
    cause_of_death: '',
    person_of_interest: false,
    veteran: false,
    time_of_death: ''
  }
}

const closePersonModal = () => {
  showAddPersonModal.value = false
  showEditPersonModal.value = false
  editingPerson.value = null
  resetPersonForm()
}

const editPerson = (person) => {
  editingPerson.value = person
  personForm.value = { ...person }
  showEditPersonModal.value = true
}

const deletePerson = async (person) => {
  if (confirm(`Are you sure you want to delete ${person.full_name} from this plot?`)) {
    try {
      await personsStore.deletePerson(person.id)
      console.log('Person deleted successfully')
    } catch (error) {
      console.error('Error deleting person:', error)
      alert('Failed to delete person. Please try again.')
    }
  }
}

const savePerson = async () => {
  if (!effectivePlot.value?.id) {
    alert('No plot selected')
    return
  }

  savingPerson.value = true
  try {
    const personData = {
      ...personForm.value,
      plot_id: effectivePlot.value.id,
      created_by: 'anonymous',
      last_updated_by: 'anonymous'
    }

    if (showEditPersonModal.value && editingPerson.value) {
      // Update existing person
      await personsStore.updatePerson(editingPerson.value.id, personData)
      console.log('Person updated successfully')
    } else {
      // Create new person
      await personsStore.createPerson(personData)
      console.log('Person created successfully')
    }

    closePersonModal()
  } catch (error) {
    console.error('Error saving person:', error)
    alert('Failed to save person. Please try again.')
  } finally {
    savingPerson.value = false
  }
}

// Load persons when plot changes
watch(effectivePlot, (newPlot) => {
  if (newPlot?.id) {
    personsStore.loadPersons()
  }
}, { immediate: true })

// Listen for refetch events
</script>
