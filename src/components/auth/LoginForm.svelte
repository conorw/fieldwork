<script lang="ts">
import Button from "$lib/ui/Button.svelte";
import Card from "$lib/ui/Card.svelte";
import InputText from "$lib/ui/InputText.svelte";
import Message from "$lib/ui/Message.svelte";
import Password from "$lib/ui/Password.svelte";

import { ref } from "vue";
import { useRouter } from "vue-router";
import { createSupabaseClient } from "@/lib/supabase/client";
import { getAuthRedirectUrl } from "@/utils/auth";

const router = useRouter();
const error = ref<string | null>(null);
const isLoading = ref(false);
const isSignUp = ref(false);
const email = ref("");
const password = ref("");

const handleGoogleSignIn = async () => {
  const supabase = createSupabaseClient();
  isLoading.value = true;
  error.value = null;

  try {
    const redirectUrl = getAuthRedirectUrl();
    console.log("🔐 OAuth redirect URL:", redirectUrl);
    const { error: supabaseError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectUrl,
      },
    });

    if (supabaseError) throw supabaseError;
    // User will be redirected to Google, then back to /auth/callback
  } catch (err: unknown) {
    error.value =
      err instanceof Error ? err.message : "Failed to sign in with Google";
    isLoading.value = false;
  }
};

const handleEmailPassword = async (e: Event) => {
  e.preventDefault();
  const supabase = createSupabaseClient();
  isLoading.value = true;
  error.value = null;

  try {
    if (isSignUp.value) {
      // Sign up
      const redirectUrl = getAuthRedirectUrl();
      console.log("🔐 Email signup redirect URL:", redirectUrl);
      const { data, error: supabaseError } = await supabase.auth.signUp({
        email: email.value,
        password: password.value,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });

      if (supabaseError) throw supabaseError;

      if (data.user) {
        // Check if email confirmation is required
        if (data.session) {
          // User is automatically signed in
          router.push("/onboarding");
        } else {
          // Email confirmation required
          error.value = "Please check your email to confirm your account";
        }
      }
    } else {
      // Sign in
      const { data, error: supabaseError } =
        await supabase.auth.signInWithPassword({
          email: email.value,
          password: password.value,
        });

      if (supabaseError) throw supabaseError;

      if (data.session) {
        // Redirect based on whether user has locations
        const { useAuthStore } = await import("@/stores/auth");
        const authStore = useAuthStore();
        await authStore.setSession(data.session);

        const hasLocations = await authStore.checkUserHasLocations();
        router.push(hasLocations ? "/" : "/onboarding");
      }
    }
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : "An error occurred";
  } finally {
    isLoading.value = false;
  }
};
</script>

<div class="flex flex-col gap-6"><Card>{#snippet header()}<div class="p-4"><h2 class="text-2xl font-semibold text-surface-900 dark:text-surface-100">{isSignUp.value ? "Create Account" : "Welcome!"}</h2><p class="text-surface-600 dark:text-surface-400 mt-1">{isSignUp.value
                ? "Sign up to get started"
                : "Sign in to your account to continue"}</p></div>{/snippet}{#snippet content()}<div class="flex flex-col gap-4">{#if error.value}<Message severity="error" closable={false}>{error.value}</Message>{/if}<div class="flex flex-col gap-4"><Button class="w-full" type="button" outlined disabled={isLoading.value} onclick={handleGoogleSignIn}><span class="flex items-center justify-center gap-2"><svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"></path><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"></path><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"></path></svg> Continue with Google </span></Button><div class="relative flex items-center justify-center"><div class="absolute inset-0 flex items-center"><div class="w-full border-t border-surface-300"></div></div><div class="relative bg-surface-0 px-4 text-sm text-surface-600 dark:text-surface-400"> Or continue with email </div></div></div><form onsubmit={(event) => { event.preventDefault(); handleEmailPassword(event) }}><div class="flex flex-col gap-4"><div><label class="block text-sm font-medium mb-1 text-surface-900 dark:text-surface-100">Email</label><InputText class="w-full" bind:value={email.value} type="email" placeholder="your@email.com" disabled={isLoading.value} required></InputText></div><div><label class="block text-sm font-medium mb-1 text-surface-900 dark:text-surface-100">Password</label><Password class="w-full" bind:value={password.value} placeholder="Enter your password" disabled={isLoading.value} feedback={isSignUp.value} toggleMask required></Password></div><Button class="w-full" type="submit" disabled={isLoading.value || !email.value || !password.value} loading={isLoading.value}>{isLoading.value
                    ? isSignUp.value
                      ? "Creating account..."
                      : "Signing in..."
                    : isSignUp.value
                      ? "Sign Up"
                      : "Sign In"}</Button><div class="text-center"><Button type="button" link disabled={isLoading.value} onclick={(event) => {  isSignUp.value = !isSignUp.value }}>{isSignUp.value
                      ? "Already have an account? Sign in"
                      : "Don't have an account? Sign up"}</Button></div></div></form></div>{/snippet}</Card></div>
