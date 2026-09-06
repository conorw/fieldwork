<template>
  <div class="min-h-screen flex items-center justify-center bg-surface-50">
    <div class="text-center">
      <ProgressSpinner />
      <p class="mt-4 text-lg text-surface-700">Completing sign in...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { createSupabaseClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/stores/auth";
import ProgressSpinner from "primevue/progressspinner";

const router = useRouter();
const authStore = useAuthStore();

onMounted(async () => {
  const supabase = createSupabaseClient();

  // Handle the OAuth callback
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    console.error("Auth callback error:", error);
    router.push("/auth?error=" + encodeURIComponent(error.message));
    return;
  }

  if (session) {
    await authStore.setSession(session);
    // Check if user has locations, redirect accordingly
    const hasLocations = await authStore.checkUserHasLocations();
    if (hasLocations) {
      router.push("/");
    } else {
      router.push("/onboarding");
    }
  } else {
    router.push("/auth");
  }
});
</script>
