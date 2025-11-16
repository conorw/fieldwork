<template>
  <div id="app" class="h-screen bg-surface-50 flex flex-col overflow-hidden">
    <!-- Offline Indicator -->
    <div v-if="!isOnline" class="offline-indicator">
      <span class="flex items-center">
        <svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clip-rule="evenodd" />
        </svg>
        Offline Mode
      </span>
    </div>

    <!-- Navigation -->
    <Toolbar class="border-0 border-b-1 surface-border">
      <template #start>
        <h1 class="text-xl font-semibold text-surface-900">Fieldwork ({{ locationName }})</h1>
      </template>

      <template #end>
        <div class="flex items-center space-x-2">
          <router-link to="/"
            class="flex items-center justify-center w-10 h-10 rounded-lg text-surface-600 hover:text-surface-900 hover:bg-surface-100 transition-colors duration-200"
            active-class="text-primary-600 bg-primary-50">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          </router-link>
          <router-link to="/plots"
            class="flex items-center justify-center w-10 h-10 rounded-lg text-surface-600 hover:text-surface-900 hover:bg-surface-100 transition-colors duration-200"
            active-class="text-primary-600 bg-primary-50">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </router-link>
          <router-link to="/settings"
            class="flex items-center justify-center w-10 h-10 rounded-lg text-surface-600 hover:text-surface-900 hover:bg-surface-100 transition-colors duration-200"
            active-class="text-primary-600 bg-primary-50">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </router-link>
        </div>
      </template>
    </Toolbar>

    <!-- Main Content -->
    <main class="flex-1 min-h-0 h-full">
      <router-view />
    </main>

    <!-- Install Prompt -->
    <InstallPrompt />

    <!-- PrimeVue Toast Notifications -->
    <Toast />
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useLocationsStore } from './stores/locations'
import { useOnline } from '@vueuse/core'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'
import InstallPrompt from './components/InstallPrompt.vue'
import { toastService } from './services/toastService'

const locationsStore = useLocationsStore()
const toast = useToast()

const isOnline = useOnline()
const locationName = computed(() => locationsStore.selectedLocation?.name || 'Fieldwork')

// Initialize global toast service for use outside component contexts
onMounted(() => {
  toastService.init(toast.add.bind(toast))
})

// Note: Service worker is automatically registered by Vite PWA plugin
// The service worker provides offline functionality and caching
</script>