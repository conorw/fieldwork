<template>
  <div class="flex flex-col gap-6">
    <Card>
      <template #header>
        <div class="p-4">
          <h2 class="text-2xl font-semibold">{{ isSignUp ? 'Create Account' : 'Welcome!' }}</h2>
          <p class="text-surface-600 mt-1">
            {{ isSignUp ? 'Sign up to get started' : 'Sign in to your account to continue' }}
          </p>
        </div>
      </template>
      <template #content>
        <form @submit.prevent="handleEmailPassword">
          <div class="flex flex-col gap-4">
            <Message v-if="error" severity="error" :closable="false">
              {{ error }}
            </Message>
            
            <!-- Email/Password Form -->
            <div class="flex flex-col gap-4">
              <div>
                <label class="block text-sm font-medium mb-1">Email</label>
                <InputText 
                  v-model="email" 
                  type="email"
                  placeholder="your@email.com"
                  class="w-full"
                  :disabled="isLoading"
                  required
                />
              </div>
              
              <div>
                <label class="block text-sm font-medium mb-1">Password</label>
                <Password 
                  v-model="password" 
                  placeholder="Enter your password"
                  class="w-full"
                  :disabled="isLoading"
                  :feedback="isSignUp"
                  toggleMask
                  required
                />
              </div>
              
              <Button 
                type="submit" 
                class="w-full" 
                :disabled="isLoading || !email || !password"
                :loading="isLoading"
              >
                {{ isLoading 
                  ? (isSignUp ? 'Creating account...' : 'Signing in...') 
                  : (isSignUp ? 'Sign Up' : 'Sign In') 
                }}
              </Button>
              
              <div class="text-center">
                <Button 
                  type="button"
                  link
                  @click="isSignUp = !isSignUp"
                  :disabled="isLoading"
                >
                  {{ isSignUp 
                    ? 'Already have an account? Sign in' 
                    : "Don't have an account? Sign up" 
                  }}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { createSupabaseClient } from '@/lib/supabase/client'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Message from 'primevue/message'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'

const router = useRouter()
const error = ref<string | null>(null)
const isLoading = ref(false)
const isSignUp = ref(false)
const email = ref('')
const password = ref('')

const handleEmailPassword = async (e: Event) => {
  e.preventDefault()
  const supabase = createSupabaseClient()
  isLoading.value = true
  error.value = null

  try {
    if (isSignUp.value) {
      // Sign up
      const { data, error: supabaseError } = await supabase.auth.signUp({
        email: email.value,
        password: password.value,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (supabaseError) throw supabaseError
      
      if (data.user) {
        // Check if email confirmation is required
        if (data.session) {
          // User is automatically signed in
          router.push('/onboarding')
        } else {
          // Email confirmation required
          error.value = 'Please check your email to confirm your account'
        }
      }
    } else {
      // Sign in
      const { data, error: supabaseError } = await supabase.auth.signInWithPassword({
        email: email.value,
        password: password.value,
      })

      if (supabaseError) throw supabaseError
      
      if (data.session) {
        // Redirect based on whether user has locations
        const { useAuthStore } = await import('@/stores/auth')
        const authStore = useAuthStore()
        await authStore.setSession(data.session)
        
        const hasLocations = await authStore.checkUserHasLocations()
        router.push(hasLocations ? '/' : '/onboarding')
      }
    }
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'An error occurred'
  } finally {
    isLoading.value = false
  }
}

</script>

