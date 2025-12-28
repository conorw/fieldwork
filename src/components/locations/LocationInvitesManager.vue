<template>
  <Card>
    <template #title>Invites</template>
    <template #content>
      <div class="space-y-4">
        <!-- Send New Invite -->
        <div class="flex gap-2">
          <InputText 
            v-model="inviteEmail" 
            placeholder="Email address"
            class="flex-1"
          />
          <Dropdown 
            v-model="inviteRole" 
            :options="roleOptions" 
            optionLabel="label"
            optionValue="value"
            placeholder="Role"
          />
          <Button 
            @click="sendInvite"
            :disabled="!inviteEmail || isSending"
            :loading="isSending"
          >
            Send Invite
          </Button>
        </div>

        <!-- Pending Invites List -->
        <div v-if="pendingInvites.length === 0" class="text-center py-4 text-surface-500">
          No pending invites
        </div>
        <div v-else class="space-y-2">
          <div 
            v-for="invite in pendingInvites" 
            :key="invite.id"
            class="p-3 border border-surface-200 rounded-lg flex items-center justify-between"
          >
            <div>
              <p class="font-medium">{{ invite.email }}</p>
              <p class="text-sm text-surface-600">Role: {{ invite.role }}</p>
            </div>
            <div class="flex gap-2">
              <Button 
                icon="pi pi-copy" 
                text 
                rounded 
                @click="copyInviteLink(invite.token)"
                v-tooltip="'Copy invite link'"
              />
              <Button 
                icon="pi pi-times" 
                text 
                rounded 
                severity="danger"
                @click="cancelInvite(invite.id)"
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
import InputText from 'primevue/inputtext'
import Dropdown from 'primevue/dropdown'
import { useToast } from 'primevue/usetoast'

const props = defineProps<{
  locationId: string
}>()

const toast = useToast()
const inviteEmail = ref('')
const inviteRole = ref('member')
const isSending = ref(false)
const invites = ref<any[]>([])

const roleOptions = [
  { label: 'Member', value: 'member' },
  { label: 'Admin', value: 'admin' },
]

const pendingInvites = computed(() => 
  invites.value.filter(inv => inv.status === 'pending')
)

const loadInvites = async () => {
  try {
    const supabase = createSupabaseClient()
    const { data, error } = await supabase
      .from('location_invites')
      .select('*')
      .eq('location_id', props.locationId)
      .order('created_at', { ascending: false })
    
    if (error) throw error
    invites.value = data || []
  } catch (error) {
    console.error('Error loading invites:', error)
  }
}

const sendInvite = async () => {
  if (!inviteEmail.value) return
  
  isSending.value = true
  try {
    const supabase = createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')
    
    const token = `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // 7 days from now
    
    const { error } = await supabase
      .from('location_invites')
      .insert({
        id: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        location_id: props.locationId,
        invited_by: user.id,
        email: inviteEmail.value,
        role: inviteRole.value,
        token,
        status: 'pending',
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString(),
      })
    
    if (error) throw error
    
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Invite sent',
    })
    
    inviteEmail.value = ''
    await loadInvites()
  } catch (error) {
    console.error('Error sending invite:', error)
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Failed to send invite',
    })
  } finally {
    isSending.value = false
  }
}

const cancelInvite = async (inviteId: string) => {
  try {
    const supabase = createSupabaseClient()
    const { error } = await supabase
      .from('location_invites')
      .update({ status: 'cancelled' })
      .eq('id', inviteId)
    
    if (error) throw error
    
    await loadInvites()
  } catch (error) {
    console.error('Error cancelling invite:', error)
  }
}

const copyInviteLink = (token: string) => {
  const link = `${window.location.origin}/auth/callback?invite=${token}`
  navigator.clipboard.writeText(link)
  toast.add({
    severity: 'info',
    summary: 'Copied',
    detail: 'Invite link copied to clipboard',
  })
}

onMounted(() => {
  loadInvites()
})
</script>

