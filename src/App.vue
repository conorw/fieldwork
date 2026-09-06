<template>
  <div id="app">
    <!-- Local LLM Download Indicator -->
    <div
      v-if="llmDownloading"
      class="fixed top-0 left-0 w-full bg-blue-600 text-white text-xs py-1 px-4 text-center z-50 shadow-md flex items-center justify-center space-x-2"
    >
      <i class="pi pi-spin pi-spinner text-xs"></i>
      <span
        >PaliGemma Vision AI downloading locally...
        {{ llmProgress.toFixed(0) }}%</span
      >
    </div>

    <!-- Auth routes render without layout -->
    <router-view v-if="isAuthRoute" :class="{ 'mt-6': llmDownloading }" />

    <!-- All other routes use MainLayout -->
    <MainLayout v-else :class="{ 'mt-6': llmDownloading }" />

    <!-- PrimeVue Toast Notifications (available for all routes) -->
    <Toast />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, onUnmounted } from "vue";
import { useRoute } from "vue-router";
import { useToast } from "primevue/usetoast";
import Toast from "primevue/toast";
import MainLayout from "./components/layouts/MainLayout.vue";
import { toastService } from "./services/toastService";
import { localLLMService } from "./services/localLLMService";

const route = useRoute();
const toast = useToast();

const isAuthRoute = computed(() => {
  return route.meta.hideNavbar === true;
});

const llmDownloading = ref(false);
const llmProgress = ref(0);

// Initialize global toast service for use outside component contexts
onMounted(() => {
  toastService.init(toast.add.bind(toast));

  // Listen for custom events from localLLMService
  const handleProgress = (e) => {
    llmDownloading.value = true;
    llmProgress.value = e.detail.progress;
  };
  const handleComplete = () => {
    llmDownloading.value = false;
  };

  window.addEventListener("llm-download-progress", handleProgress);
  window.addEventListener("llm-download-complete", handleComplete);

  // Clean up
  onUnmounted(() => {
    window.removeEventListener("llm-download-progress", handleProgress);
    window.removeEventListener("llm-download-complete", handleComplete);
  });

  // Initialize Local LLM silently in background!
  localLLMService
    .initialize()
    .catch((err) => console.error("Background LLM init failed:", err));
});

// Note: Service worker is automatically registered by Vite PWA plugin
// The service worker provides offline functionality and caching
</script>
