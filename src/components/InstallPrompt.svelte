<script lang="ts">
import Avatar from "$lib/ui/Avatar.svelte";
import Button from "$lib/ui/Button.svelte";
import Card from "$lib/ui/Card.svelte";

import { ref, onMounted, onUnmounted, watch, nextTick } from "vue";
import { useRoute } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { App as CapacitorApp } from "@capacitor/app";

// PrimeVue components

// State
const showInstallPrompt = ref(false);
const installing = ref(false);
const installIcon = "/icons/icon-192x192.png";

const route = useRoute();
const authStore = useAuthStore();

// Install prompt handling - get from global storage
const getDeferredPrompt = () => {
  return (window as any).__deferredPrompt?.() || null;
};

const checkAndShowPrompt = () => {
  // Don't show if already installed
  if (window.matchMedia("(display-mode: standalone)").matches) {
    return;
  }

  // Don't show if dismissed recently
  if (!shouldShowPrompt()) {
    return;
  }

  // Check if deferred prompt exists
  const prompt = getDeferredPrompt();
  if (prompt) {
    showInstallPrompt.value = true;
  }
};

const handleBeforeInstallPrompt = (e: Event) => {
  e.preventDefault();
  // The prompt is already stored globally in main.ts
  // Just check if we should show it
  checkAndShowPrompt();
};

const handlePromptAvailable = () => {
  // Custom event fired when prompt becomes available
  checkAndShowPrompt();
};

const handleAppInstalled = () => {
  console.log("App was installed");
  showInstallPrompt.value = false;
};

const installApp = async () => {
  const prompt = getDeferredPrompt();
  if (!prompt) return;

  installing.value = true;

  try {
    prompt.prompt();
    const { outcome } = await prompt.userChoice;

    if (outcome === "accepted") {
      console.log("User accepted the install prompt");
    } else {
      console.log("User dismissed the install prompt");
    }

    // Clear the deferred prompt after use
    if ((window as any).__clearDeferredPrompt) {
      (window as any).__clearDeferredPrompt();
    }

    showInstallPrompt.value = false;
  } catch (error) {
    console.error("Error during install:", error);
  } finally {
    installing.value = false;
  }
};

const dismissInstall = () => {
  showInstallPrompt.value = false;
  // Don't show again for this session
  localStorage.setItem("installPromptDismissed", Date.now().toString());
};

// Check if we should show the prompt
const shouldShowPrompt = () => {
  const dismissed = localStorage.getItem("installPromptDismissed");
  if (dismissed) {
    const dismissedTime = parseInt(dismissed);
    const daysSinceDismissed =
      (Date.now() - dismissedTime) / (1000 * 60 * 60 * 24);
    return daysSinceDismissed > 7; // Show again after 7 days
  }
  return true;
};

// Watch for authentication state changes - show prompt after login
watch(
  () => authStore.isAuthenticated,
  (isAuthenticated) => {
    if (isAuthenticated) {
      // Wait a bit after login to show the prompt
      setTimeout(() => {
        checkAndShowPrompt();
      }, 1000);
    }
  },
  { immediate: true },
);

// Watch route changes - don't show on auth routes
watch(
  () => route.meta.hideNavbar,
  () => {
    if (route.meta.hideNavbar) {
      showInstallPrompt.value = false;
    } else {
      // Check for prompt when entering authenticated routes
      nextTick(() => {
        checkAndShowPrompt();
      });
    }
  },
);

// Capacitor app state handling
CapacitorApp.addListener(
  "appStateChange",
  ({ isActive }: { isActive: boolean }) => {
    if (isActive && shouldShowPrompt()) {
      // Check if we're in a PWA context
      if (window.matchMedia("(display-mode: standalone)").matches) {
        showInstallPrompt.value = false;
      } else {
        checkAndShowPrompt();
      }
    }
  },
);

onMounted(() => {
  // Only show prompt if not already installed and not dismissed recently
  if (
    shouldShowPrompt() &&
    !window.matchMedia("(display-mode: standalone)").matches
  ) {
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    window.addEventListener(
      "pwa-install-prompt-available",
      handlePromptAvailable,
    );
    window.addEventListener("pwa-installed", handleAppInstalled);

    // Check if prompt already exists (captured before component mounted)
    checkAndShowPrompt();
  }
});

onUnmounted(() => {
  window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  window.removeEventListener("appinstalled", handleAppInstalled);
  window.removeEventListener(
    "pwa-install-prompt-available",
    handlePromptAvailable,
  );
  window.removeEventListener("pwa-installed", handleAppInstalled);
});
</script>

{#if showInstallPrompt.value}<div class="fixed bottom-20 left-4 right-4 z-50 sm:bottom-4"><Card class="shadow-lg">{#snippet content()}<div class="flex items-center justify-between gap-3"><div class="flex min-w-0 items-center gap-3"><Avatar class="hidden shrink-0 sm:inline-flex" image={installIcon} size="large" shape="circle"></Avatar><div class="min-w-0"><h3 class="font-semibold">Install FieldWork</h3><p class="text-sm text-surface-600"> Record plots offline, straight from the home screen </p></div></div><div class="flex shrink-0 gap-2"><Button severity="secondary" size="small" text icon="pi pi-times" aria-label="Dismiss install prompt" onclick={dismissInstall}></Button><Button severity="primary" size="small" loading={installing.value} icon="pi pi-download" label="Install" onclick={installApp}></Button></div></div>{/snippet}</Card></div>{/if}
