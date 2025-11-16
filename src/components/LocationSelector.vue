<template>
  <div class="bg-white rounded-lg shadow-lg p-6">
    <div class="flex items-center justify-between mb-6">
      <h3 class="text-lg font-semibold text-gray-900">Saved Locations</h3>
      <button
        @click="refreshLocations"
        class="text-primary-600 hover:text-primary-700 text-sm font-medium"
        :disabled="isLoading"
      >
        <svg v-if="isLoading" class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span v-else>Refresh</span>
      </button>
    </div>

    <!-- Error Display -->
    <div v-if="error" class="mb-4 p-3 bg-red-100 border border-red-300 rounded-md">
      <p class="text-red-800 text-sm">{{ error }}</p>
      <button
        @click="clearError"
        class="mt-2 text-red-600 hover:text-red-800 text-sm underline"
      >
        Dismiss
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading && locations.length === 0" class="text-center py-8">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
      <p class="mt-2 text-sm text-gray-600">Loading locations...</p>
    </div>

    <!-- No Locations -->
    <div v-else-if="locations.length === 0" class="text-center py-8">
      <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      <h3 class="mt-2 text-sm font-medium text-gray-900">No locations found</h3>
      <p class="mt-1 text-sm text-gray-500">Get started by creating a new location.</p>
    </div>

    <!-- Locations List -->
    <div v-else class="space-y-3">
      <!-- User's Locations -->
      <div v-if="userLocations.length > 0">
        <h4 class="text-sm font-medium text-gray-700 mb-2">Your Locations</h4>
        <div class="space-y-2">
          <div
            v-for="location in userLocations"
            :key="location.id"
            class="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div class="flex-1">
              <div class="flex items-center space-x-2">
                <h5 class="font-medium text-gray-900">{{ location.name }}</h5>
                <span
                  v-if="location.isPublic"
                  class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800"
                >
                  Public
                </span>
                <span
                  v-else
                  class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
                >
                  Private
                </span>
              </div>
              <p class="text-sm text-gray-600 mt-1">
                Zoom: {{ location.minZoom }}-{{ location.maxZoom }} | 
                Created: {{ formatDate(location.dateCreated) }}
              </p>
            </div>
            <div class="flex space-x-2">
              <button
                @click="selectLocation(location)"
                class="btn-primary text-sm px-3 py-1"
              >
                Select
              </button>
              <button
                @click="editLocation(location)"
                class="btn-secondary text-sm px-3 py-1"
              >
                Edit
              </button>
              <button
                @click="deleteLocation(location.id)"
                class="text-red-600 hover:text-red-800 text-sm px-3 py-1"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Public Locations from Other Users -->
      <div v-if="publicLocations.length > 0">
        <h4 class="text-sm font-medium text-gray-700 mb-2">Public Locations</h4>
        <div class="space-y-2">
          <div
            v-for="location in publicLocations"
            :key="location.id"
            class="flex items-center justify-between p-3 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <div class="flex-1">
              <div class="flex items-center space-x-2">
                <h5 class="font-medium text-gray-900">{{ location.name }}</h5>
                <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  Public
                </span>
              </div>
              <p class="text-sm text-gray-600 mt-1">
                Zoom: {{ location.minZoom }}-{{ location.maxZoom }} | 
                By: {{ location.createdBy }} | 
                {{ formatDate(location.dateCreated) }}
              </p>
            </div>
            <button
              @click="selectLocation(location)"
              class="btn-primary text-sm px-3 py-1"
            >
              Select
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useLocationsStore } from '../stores/locations'

const emit = defineEmits(['location-selected', 'location-edited'])

const locationsStore = useLocationsStore()

// Computed properties
const locations = computed(() => locationsStore.locations)
const userLocations = computed(() => locationsStore.userLocations)
const publicLocations = computed(() => locationsStore.publicLocations)
const isLoading = computed(() => locationsStore.isLoading)
const error = computed(() => locationsStore.error)

// Actions
const refreshLocations = async () => {
  try {
    await locationsStore.loadLocations()
  } catch (err) {
    console.error('Failed to refresh locations:', err)
  }
}

const selectLocation = (location) => {
  emit('location-selected', location)
}

const editLocation = (location) => {
  emit('location-edited', location)
}

const deleteLocation = async (locationId) => {
  if (confirm('Are you sure you want to delete this location? This action cannot be undone.')) {
    try {
      await locationsStore.deleteLocation(locationId)
    } catch (err) {
      console.error('Failed to delete location:', err)
    }
  }
}

const clearError = () => {
  locationsStore.clearError()
}

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString()
}

// Load locations on mount
onMounted(() => {
  refreshLocations()
})
</script>
