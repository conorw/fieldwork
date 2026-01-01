<template>
  <Drawer
    header="Batch Grave Capture"
    position="full"
    v-model:visible="isVisible"
    modal
    closable
    @hide="closeWizard"
  >
    <div class="h-[90vh] flex flex-col">
      <!-- Status Bar -->
      <div class="flex-shrink-0 p-4 bg-surface-50 border-b border-surface-200">
        <div class="flex items-center justify-between mb-2">
          <div>
            <h3 class="text-lg font-semibold">Capturing Graves</h3>
            <p class="text-sm text-surface-600">
              {{ photos.length }} photo{{ photos.length !== 1 ? "s" : "" }}
              captured
            </p>
          </div>
          <div class="text-right">
            <div class="text-sm text-surface-600">GPS Accuracy</div>
            <div
              class="text-lg font-semibold"
              :class="{
                'text-green-600': currentAccuracy < 10,
                'text-yellow-600': currentAccuracy >= 10 && currentAccuracy < 20,
                'text-red-600': currentAccuracy >= 20,
              }"
            >
              {{ currentAccuracy.toFixed(1) }}m
            </div>
          </div>
        </div>

        <!-- Direction Indicator -->
        <div class="flex items-center gap-2 mt-2">
          <svg
            class="w-5 h-5 text-surface-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
            />
          </svg>
          <span class="text-sm text-surface-600">
            Direction: {{ Math.round(userDirection) }}°
          </span>
        </div>
      </div>

      <!-- Photo Thumbnails -->
      <div
        v-if="photos.length > 0"
        class="flex-shrink-0 p-4 bg-surface-0 border-b border-surface-200 overflow-x-auto"
      >
        <div class="flex gap-2">
          <div
            v-for="(photo, index) in photos"
            :key="photo.id"
            class="relative flex-shrink-0"
          >
            <Image
              :src="photo.image.dataUrl"
              alt="Captured photo"
              class="w-20 h-20 object-cover rounded-lg border-2 border-surface-200"
            />
            <div
              class="absolute top-1 right-1 bg-primary-600 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center"
            >
              {{ index + 1 }}
            </div>
          </div>
        </div>
      </div>

      <!-- Main Content Area -->
      <div class="flex-1 flex flex-col items-center justify-center p-4">
        <div v-if="isProcessing" class="text-center">
          <ProgressSpinner />
          <p class="mt-4 text-lg text-surface-700">
            Processing {{ photos.length }} photos...
          </p>
          <p class="mt-2 text-sm text-surface-600">
            Analyzing GPS patterns and extracting person details
          </p>
        </div>

        <div v-else class="text-center max-w-md">
          <div class="mb-8">
            <svg
              class="w-24 h-24 mx-auto mb-4 text-surface-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <h2 class="text-2xl font-semibold mb-2">Batch Capture Mode</h2>
            <p class="text-surface-600">
              Quickly capture multiple grave photos. Move from grave to grave
              and take photos at the foot of each grave.
            </p>
          </div>

          <div
            v-if="photos.length > 0"
            class="mb-6 p-4 bg-surface-50 rounded-lg border border-surface-200"
          >
            <p class="text-sm text-surface-600 mb-2">
              Ready to process {{ photos.length }} photo{{
                photos.length !== 1 ? "s" : ""
              }}?
            </p>
            <p class="text-xs text-surface-500">
              Photos will be analyzed and positioned on the map automatically.
            </p>
          </div>
        </div>
      </div>

      <!-- Bottom Action Buttons -->
      <div
        class="flex-shrink-0 p-4 bg-surface-0 border-t border-surface-200"
      >
        <div v-if="isProcessing" class="text-center">
          <Button
            label="Processing..."
            disabled
            class="w-full"
            size="large"
          />
        </div>
        <div v-else class="space-y-3">
          <div class="flex space-x-2">
            <Button
              icon="pi pi-camera"
              @click="capturePhoto"
              :disabled="isCapturing || isProcessing"
              :loading="isCapturing"
              size="large"
              class="flex-1"
            >
              {{ isCapturing ? "Capturing..." : "Take Photo" }}
            </Button>
            <Button
              v-if="photos.length > 0"
              icon="pi pi-check"
              @click="finishBatch"
              :disabled="isCapturing || isProcessing"
              severity="success"
              size="large"
              class="flex-1"
            >
              Finish Batch ({{ photos.length }})
            </Button>
          </div>
          <div v-if="photos.length > 0" class="flex space-x-2">
            <Button
              icon="pi pi-trash"
              @click="clearPhotos"
              :disabled="isCapturing || isProcessing"
              severity="danger"
              outlined
              size="large"
              class="flex-1"
            >
              Clear All
            </Button>
            <Button
              icon="pi pi-times"
              @click="closeWizard"
              :disabled="isCapturing || isProcessing"
              severity="secondary"
              outlined
              size="large"
              class="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  </Drawer>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { useMapStore } from "../stores/map";
import { useLocationsStore } from "../stores/locations";
import { useSettingsStore } from "../stores/settings";
import { CapacitorCameraService } from "../services/capacitorCamera";
import { useDeviceOrientation } from "../composables/useDeviceOrientation";
import {
  collectGPSReadings,
  averageGPSReadings,
} from "../utils/gpsAveraging";
import type {
  BatchCaptureSession,
  BatchCapturePhoto,
} from "../types/batchCapture";
import { useToastService } from "../utils/toastService";
import Drawer from "primevue/drawer";
import Button from "primevue/button";
import Image from "primevue/image";
import ProgressSpinner from "primevue/progressspinner";

const isVisible = defineModel("isVisible", { type: Boolean, default: false });

const emit = defineEmits(["close", "batchCompleted"]);

// Stores
const mapStore = useMapStore();
const locationsStore = useLocationsStore();
const settingsStore = useSettingsStore();
const { showSuccess, showError } = useToastService();

// Camera service
const cameraService = CapacitorCameraService.getInstance();

// Device orientation
const { userDirection, startOrientationListener, stopOrientationListener } =
  useDeviceOrientation();

// State
const photos = ref<BatchCapturePhoto[]>([]);
const isCapturing = ref(false);
const isProcessing = ref(false);
const currentAccuracy = ref(0);
const session = ref<BatchCaptureSession | null>(null);

// Initialize session
const initializeSession = () => {
  session.value = {
    id: `batch-${Date.now()}`,
    startTime: Date.now(),
    photos: [],
    locationId: locationsStore.selectedLocationId || undefined,
    status: "capturing",
  };
};

// Capture a photo with GPS and direction
const capturePhoto = async () => {
  try {
    isCapturing.value = true;

    // Get batch capture settings
    const batchSettings = settingsStore.getBatchCaptureSettings();

    // Start collecting GPS readings in parallel
    const gpsPromise = collectGPSReadings(
      async () => {
        const location = await mapStore.getGPSLocation();
        return {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          timestamp: location.timestamp || Date.now(),
        };
      },
      {
        count: batchSettings.gpsAveragingCount,
        interval: batchSettings.gpsAveragingInterval,
        minAccuracy: batchSettings.minGPSAccuracy,
        maxDuration: batchSettings.gpsAveragingCount * batchSettings.gpsAveragingInterval + 1000, // Add 1 second buffer
      },
    ).then((readings) => {
      const averaged = averageGPSReadings(readings, true);
      currentAccuracy.value = averaged.accuracy;
      return averaged;
    });

    // Capture photo
    const result = await cameraService.takeGravePhoto();

    // Wait for GPS averaging
    const averagedGPS = await gpsPromise;

    if (result.dataUrl) {
      // Convert data URL to blob
      const blob = cameraService.dataUrlToBlob(result.dataUrl);
      const file = new File([blob], `grave-${Date.now()}.jpg`, {
        type: "image/jpeg",
      });

      // Create batch photo
      const batchPhoto: BatchCapturePhoto = {
        id: `photo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        image: {
          dataUrl: result.dataUrl,
          blob: blob,
          file: file,
        },
        gps: {
          latitude: averagedGPS.latitude,
          longitude: averagedGPS.longitude,
          accuracy: averagedGPS.accuracy,
          timestamp: Date.now(),
        },
        direction: userDirection.value,
        timestamp: Date.now(),
        order: photos.value.length + 1,
      };

      photos.value.push(batchPhoto);
      if (session.value) {
        session.value.photos.push(batchPhoto);
      }

      // Haptic feedback (if available)
      if ("vibrate" in navigator) {
        navigator.vibrate(50);
      }

      showSuccess(`Photo ${photos.value.length} captured!`);
    } else {
      throw new Error("No photo data received");
    }
  } catch (error) {
    console.error("Error capturing photo:", error);
    showError(`Failed to capture photo: ${error instanceof Error ? error.message : "Unknown error"}`);
  } finally {
    isCapturing.value = false;
  }
};

// Clear all photos
const clearPhotos = () => {
  photos.value = [];
  if (session.value) {
    session.value.photos = [];
  }
  initializeSession();
};

// Finish batch and process
const finishBatch = async () => {
  if (photos.value.length === 0) {
    showError("No photos to process");
    return;
  }

  if (!session.value) {
    showError("Session not initialized");
    return;
  }

  isProcessing.value = true;
  session.value.endTime = Date.now();
  session.value.status = "processing";

  try {
    // Emit event with session data for processing
    emit("batchCompleted", session.value);
    
    // Close wizard - parent component will handle processing
    closeWizard();
  } catch (error) {
    console.error("Error finishing batch:", error);
    showError(`Failed to process batch: ${error instanceof Error ? error.message : "Unknown error"}`);
    session.value.status = "failed";
    isProcessing.value = false;
  }
};

// Close wizard
const closeWizard = () => {
  if (isCapturing.value || isProcessing.value) {
    return; // Prevent closing during operations
  }

  // Reset state
  photos.value = [];
  session.value = null;
  isVisible.value = false;
  emit("close");
};

// Watch visibility to initialize/reset
watch(isVisible, (visible) => {
  if (visible) {
    initializeSession();
    startOrientationListener();
    // Get initial GPS accuracy
    mapStore.getGPSLocation().then((location) => {
      currentAccuracy.value = location.accuracy;
    });
  } else {
    stopOrientationListener();
  }
});

onMounted(() => {
  if (isVisible.value) {
    initializeSession();
    startOrientationListener();
  }
});

onUnmounted(() => {
  stopOrientationListener();
});
</script>

