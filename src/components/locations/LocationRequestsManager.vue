<template>
  <Card>
    <template #title>Join Requests</template>
    <template #content>
      <div v-if="pendingRequests.length === 0" class="text-center py-4 text-surface-500">
        No pending requests
      </div>
      <div v-else class="space-y-2">
        <div 
          v-for="request in pendingRequests" 
          :key="request.id"
          class="p-3 border border-surface-200 rounded-lg"
        >
          <div class="flex items-center justify-between mb-2">
            <div>
              <p class="font-medium">{{ request.user_email || 'Unknown User' }}</p>
              <p v-if="request.message" class="text-sm text-surface-600 mt-1">{{ request.message }}</p>
              <p class="text-xs text-surface-500 mt-1">{{ formatDate(request.created_at) }}</p>
            </div>
            <div class="flex gap-2">
              <Button 
                label="Approve" 
                severity="success"
                size="small"
                @click="respondToRequest(request.id, 'approved')"
              />
              <Button 
                label="Reject" 
                severity="danger"
                size="small"
                @click="respondToRequest(request.id, 'rejected')"
              />
            </div>
          </div>
        </div>
      </div>
    </template>
  </Card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { createSupabaseClient } from '@/lib/supabase/client'
import Card from 'primevue/card'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'

const props = defineProps<{
  locationId: string
}>()

const toast = useToast()
const requests = ref<any[]>([])

const pendingRequests = computed(() => 
  requests.value.filter(req => req.status === 'pending')
)

const loadRequests = async () => {
  try {
    const supabase = createSupabaseClient()
    const { data, error } = await supabase
      .from('location_requests')
      .select('*')
      .eq('location_id', props.locationId)
      .order('created_at', { ascending: false })
    
    if (error) throw error
    
    requests.value = data || []
  } catch (error) {
    console.error('Error loading requests:', error)
    requests.value = []
  }
}

const respondToRequest = async (requestId: string, status: 'approved' | 'rejected') => {
  try {
    const supabase = createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')
    
    const updateData: any = {
      status,
      responded_at: new Date().toISOString(),
      responded_by: user.id,
    }
    
    if (status === 'approved') {
      // Add user to location_members
      const request = requests.value.find(r => r.id === requestId)
      if (request) {
        const memberId = `${props.locationId}_${request.user_id}`
        await supabase
          .from('location_members')
          .insert({
            id: memberId,
            location_id: props.locationId,
            user_id: request.user_id,
            user_email: request.user_email || null, // Use email from request
            role: 'member',
            joined_at: new Date().toISOString(),
          })
      }
    }
    
    const { error } = await supabase
      .from('location_requests')
      .update(updateData)
      .eq('id', requestId)
    
    if (error) throw error
    
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: `Request ${status}`,
    })
    
    await loadRequests()
  } catch (error) {
    console.error('Error responding to request:', error)
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Failed to respond to request',
    })
  }
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString()
}

onMounted(() => {
  loadRequests()
})
</script>

