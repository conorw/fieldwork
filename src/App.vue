<template>
  <div id="app">
    <!-- Status banners sit in the flex flow so they can never cover the
         toolbar and never push content past the bottom of the viewport. -->
    <div
      v-if="llmDownloading"
      class="shrink-0 bg-blue-600 text-white text-xs py-1 px-4 text-center shadow-md flex items-center justify-center gap-2"
      role="status"
    >
      <i class="pi pi-spin pi-spinner text-xs"></i>
      <span
        >Preparing on-device headstone reading…
        {{ llmProgress.toFixed(0) }}%</span
      >
    </div>

    <div
      v-if="aiBanner"
      class="shrink-0 bg-amber-600 text-white text-xs py-1 px-4 text-center"
      role="status"
    >
      {{ aiBanner }}
    </div>

    <router-view v-if="isAuthRoute" class="flex-1 min-h-0" />

    <MainLayout v-else class="flex-1 min-h-0" />

    <Toast position="top-center" />
    <ConfirmDialog />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, onUnmounted, watch } from "vue";
import { useRoute } from "vue-router";
import { useToast } from "primevue/usetoast";
import Toast from "primevue/toast";
import ConfirmDialog from "primevue/confirmdialog";
import MainLayout from "./components/layouts/MainLayout.vue";
import { toastService } from "./services/toastService";
import { useLocationsStore } from "./stores/locations";
import { ensureLocalModelForLocation, ensureSharedLocalModel } from "./services/adapterInstallService";
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
      aiBanner.value = "Improving the shared model in the background…";
    } else if (loc.aiStatus === "error") {
      aiBanner.value =
        loc.aiTrainError ||
        "Shared-model training needs attention — on-device reading still works.";
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

  // Load the shared on-device model immediately so new cemeteries can read
  // stones without a teaching step. Cemetery adapters override when ready.
  ensureSharedLocalModel().catch((err) =>
    console.warn("Shared model download deferred:", err),
  );

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
      } else if (loc) {
        ensureSharedLocalModel().catch((err) =>
          console.warn("Shared model download deferred:", err),
        );
      }
    },
    { immediate: true },
  );

  // Self-learning: poll shared global weights; retrain selected cemetery on bump
  const stopGlobalPoll = startGlobalAdapterPolling();
  const stopGlobalLearn = startGlobalLearningSync();

  // Shared adapter URL so field sampling can start training before the first poll
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
