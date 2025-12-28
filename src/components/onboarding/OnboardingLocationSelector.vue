<template>
  <Card>
    <template #title>
      <div class="flex items-center justify-between">
        <span>Join Existing Location</span>
        <Button 
          icon="pi pi-times" 
          text 
          rounded 
          @click="$emit('close')"
        />
      </div>
    </template>
    <template #content>
      <div class="space-y-4">
        <InputText 
          v-model="searchQuery" 
          placeholder="Search locations..."
          class="w-full"
        />
        
        <div v-if="isLoading" class="text-center py-4">
          <ProgressSpinner />
        </div>
        
        <div v-else-if="filteredLocations.length === 0" class="text-center py-4 text-surface-500">
          No public locations found
        </div>
        
        <div v-else class="space-y-2">
          <div 
            v-for="location in filteredLocations" 
            :key="location.id"
            class="p-4 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
          >
            <div class="flex items-center justify-between">
              <div>
                <h3 class="font-semibold">{{ location.name }}</h3>
                <p class="text-sm text-surface-600">{{ location.description || 'No description' }}</p>
              </div>
              <Button 
                @click="requestToJoin(location.id)"
                :disabled="isRequesting"
                size="small"
              >
                Request to Join
              </Button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </Card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { usePowerSyncStore } from '@/stores/powersync'
import Card from 'primevue/card'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import ProgressSpinner from 'primevue/progressspinner'
import { useToast } from 'primevue/usetoast'

const emit = defineEmits(['close'])

const authStore = useAuthStore()
const powerSyncStore = usePowerSyncStore()
const toast = useToast()
const searchQuery = ref('')
const locations = ref<any[]>([])
const isLoading = ref(false)
const isRequesting = ref(false)

const filteredLocations = computed(() => {
  if (!searchQuery.value) return locations.value
  const query = searchQuery.value.toLowerCase()
  return locations.value.filter(loc => 
    loc.name.toLowerCase().includes(query)
  )
})

const loadPublicLocations = async () => {
  isLoading.value = true
  try {
    // Use PowerSync to load public locations (works offline)
    if (!powerSyncStore.powerSync) {
      throw new Error('PowerSync not initialized')
    }
    
    const results = await powerSyncStore.powerSync.getAll(
      "SELECT id, name, is_public FROM locations WHERE is_public = 'true' OR is_public = true"
    ) as any[]
    
    locations.value = results || []
  } catch (error) {
    console.error('Error loading public locations:', error)
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Failed to load locations',
    })
  } finally {
    isLoading.value = false
  }
}

const requestToJoin = async (locationId: string) => {
  if (!authStore.user || !powerSyncStore.powerSync) return
  
  isRequesting.value = true
  try {
    // Use PowerSync to create join request (works offline, will sync to Supabase)
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    await powerSyncStore.powerSync.execute(
      'INSERT INTO location_requests (id, location_id, user_id, user_email, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [
        requestId,
        locationId,
        authStore.user.id,
        authStore.user.email || null,
        'pending',
        new Date().toISOString(),
      ]
    )
    
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Join request sent',
    })
    
    emit('close')
  } catch (error) {
    console.error('Error sending join request:', error)
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Failed to send join request',
    })
  } finally {
    isRequesting.value = false
  }
}

onMounted(() => {
  loadPublicLocations()
})
</script>

