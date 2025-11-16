<template>
  <div v-if="showInstallPrompt" class="fixed bottom-4 left-4 right-4 z-50">
    <Card class="shadow-lg">
      <template #content>
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-3">
            <Avatar :image="installIcon" size="large" shape="circle" />
            <div>
              <h3 class="font-semibold text-lg">Install FieldWork</h3>
              <p class="text-sm text-surface-600">
                Get the full app experience with offline access
              </p>
            </div>
          </div>
          <div class="flex space-x-2">
            <Button @click="dismissInstall" severity="secondary" size="small" text icon="pi pi-times" />
            <Button @click="installApp" severity="primary" size="small" :loading="installing" icon="pi pi-download" label="Install" />
          </div>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { App as CapacitorApp } from '@capacitor/app'

// PrimeVue components
import Card from 'primevue/card'
import Button from 'primevue/button'
import Avatar from 'primevue/avatar'

// State
const showInstallPrompt = ref(false)
const installing = ref(false)
const installIcon = '/icons/icon-192x192.png'

// Install prompt handling
let deferredPrompt: any = null

const handleBeforeInstallPrompt = (e: Event) => {
  e.preventDefault()
  deferredPrompt = e
  showInstallPrompt.value = true
}

const handleAppInstalled = () => {
  console.log('App was installed')
  showInstallPrompt.value = false
  deferredPrompt = null
}

const installApp = async () => {
  if (!deferredPrompt) return

  installing.value = true

  try {
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice

    if (outcome === 'accepted') {
      console.log('User accepted the install prompt')
    } else {
      console.log('User dismissed the install prompt')
    }

    deferredPrompt = null
    showInstallPrompt.value = false
  } catch (error) {
    console.error('Error during install:', error)
  } finally {
    installing.value = false
  }
}

const dismissInstall = () => {
  showInstallPrompt.value = false
  // Don't show again for this session
  localStorage.setItem('installPromptDismissed', Date.now().toString())
}

// Check if we should show the prompt
const shouldShowPrompt = () => {
  const dismissed = localStorage.getItem('installPromptDismissed')
  if (dismissed) {
    const dismissedTime = parseInt(dismissed)
    const daysSinceDismissed = (Date.now() - dismissedTime) / (1000 * 60 * 60 * 24)
    return daysSinceDismissed > 7 // Show again after 7 days
  }
  return true
}

// Capacitor app state handling
CapacitorApp.addListener('appStateChange', ({ isActive }: { isActive: boolean }) => {
  if (isActive && shouldShowPrompt()) {
    // Check if we're in a PWA context
    if (window.matchMedia('(display-mode: standalone)').matches) {
      showInstallPrompt.value = false
    }
  }
})

onMounted(() => {
  // Only show prompt if not already installed and not dismissed recently
  if (shouldShowPrompt() && !window.matchMedia('(display-mode: standalone)').matches) {
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
  }
})

onUnmounted(() => {
  window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  window.removeEventListener('appinstalled', handleAppInstalled)
})
</script>
