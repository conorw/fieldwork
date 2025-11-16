// Polyfill Buffer for PowerSync (Node.js compatibility)
import { Buffer } from 'buffer'
window.Buffer = Buffer
globalThis.Buffer = Buffer

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router/index'
import { usePowerSyncStore } from './stores/powersync'
import { useSettingsStore } from './stores/settings'
import { useMapStore } from './stores/map'

// Capacitor imports
import { App as CapacitorApp } from '@capacitor/app'

// PrimeVue imports
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'

// PrimeVue CSS - using Aura theme
import Aura from '@primeuix/themes/aura';
import 'primeicons/primeicons.css'
import './style.css'

// PrimeVue component imports for global registration
// Only importing components that are actually used in the app
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Dropdown from 'primevue/dropdown'
import Toast from 'primevue/toast'
import Toolbar from 'primevue/toolbar'
import Card from 'primevue/card'
import Chip from 'primevue/chip'
import Avatar from 'primevue/avatar'
import Accordion from 'primevue/accordion'
import AccordionTab from 'primevue/accordiontab'
import Drawer from 'primevue/drawer'
import ProgressSpinner from 'primevue/progressspinner'
import InlineMessage from 'primevue/inlinemessage'
import Message from 'primevue/message'
import Textarea from 'primevue/textarea'
import Image from 'primevue/image'
import Checkbox from 'primevue/checkbox'

// PrimeVue directives
import Tooltip from 'primevue/tooltip'
import Ripple from 'primevue/ripple'
import StyleClass from 'primevue/styleclass'
import AnimateOnScroll from 'primevue/animateonscroll'
import FocusTrap from 'primevue/focustrap'

// Initialize headstone analysis queue processor
import './services/initQueueProcessor'


// Initialize stores
const pinia = createPinia()
const app = createApp(App)

app.use(pinia)
app.use(router)
app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      prefix: 'p',
      darkModeSelector: 'system',
      cssLayer: false
    }
  }
})
app.use(ToastService)
app.use(ConfirmationService)

// Register PrimeVue components globally (only components actually used in the app)
app.component('Dialog', Dialog)
app.component('Button', Button)
app.component('InputText', InputText)
app.component('Select', Select)
app.component('Dropdown', Dropdown)
app.component('Toast', Toast)
app.component('Toolbar', Toolbar)
app.component('Card', Card)
app.component('Chip', Chip)
app.component('Avatar', Avatar)
app.component('Accordion', Accordion)
app.component('AccordionTab', AccordionTab)
app.component('Drawer', Drawer)
app.component('ProgressSpinner', ProgressSpinner)
app.component('InlineMessage', InlineMessage)
app.component('Message', Message)
app.component('Textarea', Textarea)
app.component('Image', Image)
app.component('Checkbox', Checkbox)

// Register PrimeVue directives (only directives actually used in the app)
app.directive('ripple', Ripple)
app.directive('styleclass', StyleClass)
app.directive('animateonscroll', AnimateOnScroll)
app.directive('focustrap', FocusTrap)
app.directive('tooltip', Tooltip)

// Initialize stores
const powerSyncStore = usePowerSyncStore()
const settingsStore = useSettingsStore()
const mapStore = useMapStore()

// Initialize PowerSync store
powerSyncStore.initialize().catch((error: Error) => {
  console.error('Failed to initialize PowerSync store:', error)
})

// Initialize map store
mapStore.initialize().catch((error: Error) => {
  console.error('Failed to initialize map store:', error)
})

// Initialize settings with GPS
settingsStore.initializeWithGPS().catch((error: Error) => {
  console.error('Failed to initialize settings with GPS:', error)
})

// Pre-load local LLM models if analysis mode is set to 'local'
// This starts downloading models immediately when the app opens
if (settingsStore.getAnalysisMode() === 'local') {
  console.log('🔄 App startup: Analysis mode is "local", pre-loading models...')
  // Import and initialize asynchronously to avoid blocking app startup
  import('./services/localLLMService').then(({ localLLMService }) => {
    localLLMService.initialize().catch((error) => {
      console.warn('⚠️ Failed to pre-load local models on startup (will load on first use):', error)
    })
  })
}

// Request notification permission
if ('Notification' in window) {
  Notification.requestPermission()
}

// PWA Install Prompt Handler with Capacitor
let deferredPrompt: any = null

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent the mini-infobar from appearing on mobile
  e.preventDefault()
  // Stash the event so it can be triggered later
  deferredPrompt = e
  console.log('PWA install prompt available')
})

window.addEventListener('appinstalled', () => {
  console.log('PWA was installed')
  deferredPrompt = null
})

// Capacitor App State Handling
CapacitorApp.addListener('appStateChange', ({ isActive }: { isActive: boolean }) => {
  console.log('App state changed. Is active?', isActive)
})

CapacitorApp.addListener('appUrlOpen', (event: { url: string }) => {
  console.log('App opened with URL:', event.url)
})

// Handle back button on Android
CapacitorApp.addListener('backButton', ({ canGoBack }: { canGoBack: boolean }) => {
  if (!canGoBack) {
    CapacitorApp.exitApp()
  } else {
    window.history.back()
  }
})

// Make install prompt available globally
if (import.meta.env.DEV) {
  (window as any).getDeferredPrompt = () => deferredPrompt
  (window as any).triggerInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      console.log(`User response to the install prompt: ${outcome}`)
      deferredPrompt = null
    }
  }
}

// Make test functions available globally in development
if (import.meta.env.DEV) {
  (window as any).testHighZoom = () => {
    // Find the map component and call its test function
    const mapComponent = document.querySelector('map-component')
    if (mapComponent && (mapComponent as any).testHighZoom) {
      (mapComponent as any).testHighZoom()
    } else {
      console.log('Map component not found or test function not available')
    }
  }
  console.log('🔧 Development tools available:')
  console.log('  - window.testHighZoom() - Test zooming to level 20')
}

// Handle app startup and resume downloads
app.mount('#app')