<template>
  <Card>
    <template #title>Members</template>
    <template #content>
      <div v-if="isLoading" class="text-center py-4">
        <ProgressSpinner />
      </div>
      <div v-else-if="error" class="text-center py-4">
        <Message severity="error" :closable="false">{{ error }}</Message>
      </div>
      <div v-else-if="members.length === 0" class="text-center py-4 text-surface-500">
        No members found
      </div>
      <div v-else class="space-y-2">
        <div 
          v-for="member in members" 
          :key="member.user_id"
          class="p-3 border border-surface-200 rounded-lg flex items-center justify-between"
        >
          <div>
            <p class="font-medium">{{ member.user_email || member.user_id || 'User' }}</p>
            <p v-if="member.user_email && member.user_email !== member.user_id" class="text-xs text-surface-500">
              {{ member.user_id }}
            </p>
            <p class="text-sm text-surface-600">
              Role: <span class="font-semibold">{{ member.role }}</span>
            </p>
            <p class="text-xs text-surface-500">Joined: {{ formatDate(member.joined_at) }}</p>
          </div>
          <div v-if="canManageMembers" class="flex gap-2">
            <Dropdown 
              v-if="isOwner && member.role !== 'owner'"
              v-model="member.role" 
              :options="roleOptions"
              optionLabel="label"
              optionValue="value"
              @change="updateMemberRole(member.user_id, member.role)"
            />
            <Button 
              v-if="member.role !== 'owner'"
              icon="pi pi-times" 
              text 
              rounded 
              severity="danger"
              @click="removeMember(member.user_id)"
            />
          </div>
        </div>
      </div>
    </template>
  </Card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { usePowerSyncStore } from '@/stores/powersync'
import { useAuthStore } from '@/stores/auth'
import { createSupabaseClient } from '@/lib/supabase/client'
import Card from 'primevue/card'
import Button from 'primevue/button'
import Dropdown from 'primevue/dropdown'
import ProgressSpinner from 'primevue/progressspinner'
import Message from 'primevue/message'
import { useToast } from 'primevue/usetoast'

const props = defineProps<{
  locationId: string
  userRole?: string
}>()

const powerSyncStore = usePowerSyncStore()
const authStore = useAuthStore()
const toast = useToast()
const members = ref<any[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)

const roleOptions = [
  { label: 'Member', value: 'member' },
  { label: 'Admin', value: 'admin' },
]

const isOwner = computed(() => props.userRole === 'owner')
const canManageMembers = computed(() => isOwner.value || props.userRole === 'admin')

const loadMembers = async () => {
  if (!powerSyncStore.powerSync) {
    console.warn('PowerSync not initialized')
    return
  }

  isLoading.value = true
  error.value = null
  
  try {
    console.log('Loading members for location:', props.locationId)
    
    // First, try PowerSync (works offline)
    let results = await powerSyncStore.powerSync.getAll(
      'SELECT * FROM location_members WHERE location_id = ? ORDER BY joined_at DESC',
      [props.locationId]
    ) as any[]
    
    // Enrich PowerSync results with emails from Supabase if missing
    if (results && results.length > 0) {
      const membersNeedingEmails = results.filter((m: any) => !m.user_email)
      if (membersNeedingEmails.length > 0) {
        try {
          const supabase = createSupabaseClient()
          const userIds = membersNeedingEmails.map((m: any) => m.user_id)
          // Query location_members from Supabase to get emails (if user_email column exists)
          const { data: supabaseMembers } = await supabase
            .from('location_members')
            .select('user_id, user_email')
            .in('user_id', userIds)
            .eq('location_id', props.locationId)
          
          // Map emails back to results
          if (supabaseMembers) {
            const emailMap = new Map(supabaseMembers.map((m: any) => [m.user_id, m.user_email]))
            results = results.map((m: any) => ({
              ...m,
              user_email: m.user_email || emailMap.get(m.user_id) || null,
            }))
          }
        } catch (emailError) {
          console.debug('Could not fetch emails:', emailError)
        }
      }
    }
    
    console.log('PowerSync members query results:', results)
    console.log('Number of members found in PowerSync:', results?.length || 0)
    
    // Check if we're missing members (e.g., if PowerSync sync query isn't configured correctly)
    // If user is owner/admin, we should see all members, not just their own
    const location = await powerSyncStore.powerSync.get(
      'SELECT * FROM locations WHERE id = ?',
      [props.locationId]
    )
    
    const isOwner = location && authStore.user && (location as any).owner_id === authStore.user.id
    const userRole = props.userRole || (isOwner ? 'owner' : null)
    const shouldSeeAllMembers = isOwner || userRole === 'admin'
    
    // If we should see all members but only see one (ourselves), fallback to Supabase
    if (shouldSeeAllMembers && results && results.length === 1 && (results[0] as any).user_id === authStore.user?.id) {
      console.log('Only seeing own member record, falling back to Supabase to get all members...')
      try {
        const supabase = createSupabaseClient()
        const { data: supabaseMembers, error: supabaseError } = await supabase
          .from('location_members')
          .select('*')
          .eq('location_id', props.locationId)
          .order('joined_at', { ascending: false })
        
        if (supabaseError) {
          console.error('Supabase query error:', supabaseError)
        } else if (supabaseMembers && supabaseMembers.length > results.length) {
          console.log(`Found ${supabaseMembers.length} members in Supabase vs ${results.length} in PowerSync`)
          // Use Supabase results and sync them to PowerSync
          results = supabaseMembers.map((m: any) => ({
            id: m.id,
            location_id: m.location_id,
            user_id: m.user_id,
            user_email: m.user_email || null,
            role: m.role,
            joined_at: m.joined_at,
          }))
          
          // Insert missing members into PowerSync for offline access
          for (const member of supabaseMembers) {
            try {
              await powerSyncStore.powerSync.execute(
                'INSERT OR IGNORE INTO location_members (id, location_id, user_id, user_email, role, joined_at) VALUES (?, ?, ?, ?, ?, ?)',
                [member.id, member.location_id, member.user_id, member.user_email || null, member.role, member.joined_at]
              )
            } catch (insertError) {
              // Ignore duplicate key errors
              console.debug('Member already exists in PowerSync:', member.id)
            }
          }
        }
      } catch (fallbackError) {
        console.warn('Fallback to Supabase failed:', fallbackError)
        // Continue with PowerSync results
      }
    }
    
    members.value = results || []
    
    // If still no members and user is owner, create owner entry
    if (results && results.length === 0 && isOwner) {
      console.warn('No members found for location, creating owner entry...')
      try {
        const memberId = `${props.locationId}_${authStore.user!.id}`
        const userEmail = authStore.user?.email || null
        await powerSyncStore.powerSync.execute(
          'INSERT OR IGNORE INTO location_members (id, location_id, user_id, user_email, role, joined_at) VALUES (?, ?, ?, ?, ?, ?)',
          [
            memberId,
            props.locationId,
            authStore.user!.id,
            userEmail,
            'owner',
            (location as any).date_created || new Date().toISOString(),
          ]
        )
        console.log('Owner member entry created, reloading members...')
        // Reload members after creating entry
        const newResults = await powerSyncStore.powerSync.getAll(
          'SELECT * FROM location_members WHERE location_id = ? ORDER BY joined_at DESC',
          [props.locationId]
        )
        members.value = newResults || []
      } catch (createError) {
        console.error('Error creating owner member entry:', createError)
        error.value = 'Failed to create owner member entry'
      }
    }
  } catch (err) {
    console.error('Error loading members:', err)
    error.value = err instanceof Error ? err.message : 'Failed to load members'
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Failed to load members',
    })
    members.value = []
  } finally {
    isLoading.value = false
  }
}

const updateMemberRole = async (userId: string, newRole: string) => {
  if (!powerSyncStore.powerSync) {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'PowerSync not initialized',
    })
    return
  }

  try {
    await powerSyncStore.powerSync.execute(
      'UPDATE location_members SET role = ? WHERE location_id = ? AND user_id = ?',
      [newRole, props.locationId, userId]
    )
    
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Member role updated',
    })
    
    await loadMembers()
  } catch (error) {
    console.error('Error updating member role:', error)
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Failed to update member role',
    })
    await loadMembers() // Reload to revert UI
  }
}

const removeMember = async (userId: string) => {
  if (!confirm('Are you sure you want to remove this member?')) return
  
  if (!powerSyncStore.powerSync) {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'PowerSync not initialized',
    })
    return
  }

  try {
    await powerSyncStore.powerSync.execute(
      'DELETE FROM location_members WHERE location_id = ? AND user_id = ?',
      [props.locationId, userId]
    )
    
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Member removed',
    })
    
    await loadMembers()
  } catch (error) {
    console.error('Error removing member:', error)
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Failed to remove member',
    })
  }
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString()
}

// Watch for PowerSync initialization and location changes
watch(
  [() => powerSyncStore.isInitialized, () => props.locationId],
  ([initialized, locationId]) => {
    if (initialized && locationId) {
      loadMembers()
    }
  },
  { immediate: true }
)

onMounted(() => {
  if (powerSyncStore.isInitialized && props.locationId) {
    loadMembers()
  }
})
</script>

