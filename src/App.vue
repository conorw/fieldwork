<template>
  <div id="app">
    <!-- Offline model download indicator (only when actively loading) -->
    <div
      v-if="llmDownloading"
      class="fixed top-0 left-0 w-full bg-blue-600 text-white text-xs py-1 px-4 text-center z-50 shadow-md flex items-center justify-center space-x-2"
    >
      <i class="pi pi-spin pi-spinner text-xs"></i>
      <span
        >Preparing offline headstone reading…
        {{ llmProgress.toFixed(0) }}%</span
      >
    </div>

    <div
      v-if="aiBanner"
      class="fixed top-0 left-0 w-full bg-amber-600 text-white text-xs py-1 px-4 text-center z-50"
      :class="{ 'mt-6': llmDownloading }"
    >
      {{ aiBanner }}
    </div>

    <router-view
      v-if="isAuthRoute"
      :class="{ 'mt-6': llmDownloading || !!aiBanner }"
    />

    <MainLayout
      v-else
      :class="{ 'mt-6': llmDownloading || !!aiBanner }"
    />

    <Toast />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, onUnmounted, watch } from "vue";
import { useRoute } from "vue-router";
import { useToast } from "primevue/usetoast";
import Toast from "primevue/toast";
import MainLayout from "./components/layouts/MainLayout.vue";
import { toastService } from "./services/toastService";
import { useLocationsStore } from "./stores/locations";
import { ensureLocalModelForLocation } from "./services/adapterInstallService";
import { onLocationBecameLocal } from "./services/autoTrainService";
import {
  setCachedGlobalAdapterMeta,
  startGlobalAdapterPolling,
} from "./services/globalAdapterService";
import {
  absorbGlobalForLocation,
  startGlobalLearningSync,
} from "./services/globalLearningService";

const route = useRoute();
const toast = useToast();
const locationsStore = useLocationsStore();

const isAuthRoute = computed(() => {
  return route.meta.hideNavbar === true;
});

const llmDownloading = ref(false);
const llmProgress = ref(0);
const aiBanner = ref("");
const prevAiStatus = ref("");

watch(
  () => locationsStore.selectedLocation,
  (loc) => {
    if (!loc) {
      aiBanner.value = "";
      return;
    }
    if (loc.aiStatus === "training") {
      aiBanner.value = "Learning this cemetery’s stones for offline use…";
    } else if (loc.aiStatus === "error") {
      aiBanner.value =
        loc.aiTrainError ||
        "Offline training needs attention — online reading still works.";
    } else {
      aiBanner.value = "";
    }

    if (
      loc.aiStatus === "local" &&
      prevAiStatus.value &&
      prevAiStatus.value !== "local"
    ) {
      onLocationBecameLocal(loc).catch((err) =>
        console.warn("Adapter install:", err),
      );
    }
    prevAiStatus.value = loc.aiStatus || "";
  },
  { immediate: true, deep: true },
);

onMounted(() => {
  toastService.init(toast.add.bind(toast));

  const handleProgress = (e) => {
    llmDownloading.value = true;
    llmProgress.value = e.detail.progress;
  };
  const handleComplete = () => {
    llmDownloading.value = false;
  };
  const handleError = () => {
    llmDownloading.value = false;
  };

  window.addEventListener("llm-download-progress", handleProgress);
  window.addEventListener("llm-download-complete", handleComplete);
  window.addEventListener("llm-load-error", handleError);

  // When a cemetery is offline-ready, install/cache its adapter quietly.
  watch(
    () => locationsStore.selectedLocation,
    (loc) => {
      if (loc?.aiStatus === "local" && loc.adapterUrl) {
        ensureLocalModelForLocation(loc).catch((err) =>
          console.warn("Adapter install deferred:", err),
        );
        absorbGlobalForLocation(loc).catch((err) =>
          console.warn("Global absorb deferred:", err),
        );
      }
    },
    { immediate: true },
  );

  // Self-learning: poll shared global weights; retrain selected cemetery on bump
  const stopGlobalPoll = startGlobalAdapterPolling();
  const stopGlobalLearn = startGlobalLearningSync();

  // Seed from env so onboarding gate works before first /api/global-adapter hit
  const globalUrl = import.meta.env.VITE_GLOBAL_ADAPTER_URL;
  if (globalUrl) {
    setCachedGlobalAdapterMeta({
      adapterUrl: globalUrl,
      version: "env",
      updatedAt: new Date().toISOString(),
    });
  }

  onUnmounted(() => {
    window.removeEventListener("llm-download-progress", handleProgress);
    window.removeEventListener("llm-download-complete", handleComplete);
    window.removeEventListener("llm-load-error", handleError);
    stopGlobalPoll();
    stopGlobalLearn();
  });
});
</script>
