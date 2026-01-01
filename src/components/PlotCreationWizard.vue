<template>
  <Drawer
    :header="title"
    position="full"
    v-model:visible="isVisible"
    modal
    closable
    @hide="closeWizard"
  >
    <!-- Content -->
    <div class="h-[90vh] flex flex-col">
      <!-- Step 1: Take Photo -->
      <div v-if="currentStep === 0" class="flex-1 flex flex-col">
        <div class="flex-1 flex flex-col justify-center overflow-hidden">
          <!-- Photo Preview -->
          <div v-if="photoData" class="space-y-4 px-4">
            <Card class="flex-shrink-0">
              <template #content>
                <div class="text-center">
                  <Image
                    :src="photoData.dataUrl"
                    alt="Captured photo"
                    class="max-w-full h-auto rounded-lg mx-auto max-h-[50vh] object-contain"
                  />
                </div>
              </template>
            </Card>
          </div>

          <!-- Camera Options -->
          <div v-else class="space-y-4 px-4">
            <Card class="flex-shrink-0">
              <template #content>
                <div class="text-center">
                  <svg
                    class="w-16 h-16 mx-auto mb-2 text-surface-400"
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
                  <p class="text-surface-600 mb-4">
                    Take a high-quality photo of the grave or headstone
                  </p>
                  
                  <!-- GPS Stability Indicator -->
                  <div class="mt-4 p-3 rounded-lg" :class="{
                    'bg-yellow-50 border border-yellow-200': isCheckingGPS || (gpsStability && !gpsStability.isStable),
                    'bg-green-50 border border-green-200': gpsStability && gpsStability.isStable,
                  }">
                    <div class="flex items-center justify-center gap-2 mb-2">
                      <svg
                        v-if="isCheckingGPS"
                        class="animate-spin h-5 w-5 text-yellow-600"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          class="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          stroke-width="4"
                        />
                        <path
                          class="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      <svg
                        v-else-if="gpsStability && gpsStability.isStable"
                        class="h-5 w-5 text-green-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <svg
                        v-else
                        class="h-5 w-5 text-yellow-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                      <span class="text-sm font-medium" :class="{
                        'text-yellow-700': isCheckingGPS || (gpsStability && !gpsStability.isStable),
                        'text-green-700': gpsStability && gpsStability.isStable,
                      }">
                        {{ isCheckingGPS ? 'Checking GPS stability...' : gpsStability && gpsStability.isStable ? 'GPS Stable' : 'Waiting for stable GPS...' }}
                      </span>
                    </div>
                    <div v-if="gpsStability" class="text-xs text-surface-600">
                      <span v-if="gpsStability.accuracy !== Infinity">
                        Accuracy: {{ gpsStability.accuracy.toFixed(1) }}m
                        <span v-if="gpsStability.readings.length > 0">
                          ({{ gpsStability.readings.length }} readings)
                        </span>
                      </span>
                      <span v-else-if="currentLocation">
                        Using map location (GPS unavailable)
                      </span>
                      <span v-else>
                        GPS unavailable - location will be set manually
                      </span>
                    </div>
                  </div>
                </div>
              </template>
            </Card>
          </div>
        </div>

        <!-- Fixed Bottom Buttons -->
        <div class="flex-shrink-0 p-4 bg-surface-0 border-t border-surface-200">
          <div v-if="photoData" class="flex space-x-2 justify-center">
            <Button
              @click="retakePhoto"
              severity="secondary"
              label="Retake"
              size="large"
              class="flex-1"
            />
            <!-- Continue button - will advance to next step (map positioning if initialLocation, plot details otherwise) -->
            <Button
              @click="nextStep"
              label="Continue"
              size="large"
              class="flex-1"
            />
          </div>
          <div v-else class="space-y-3">
            <div class="flex space-x-2 justify-center">
              <Button
                class="pi pi-camera flex-1"
                @click="takePhoto"
                :disabled="isCapturing || (isCheckingGPS && (!gpsStability || (!gpsStability.isStable && !currentLocation)))"
                size="large"
              >
                {{ isCapturing ? "Taking Photo..." : isCheckingGPS && (!gpsStability || (!gpsStability.isStable && !currentLocation)) ? "Waiting for GPS..." : "Take Photo" }}
              </Button>
              <Button
                class="pi pi-gallery flex-1"
                @click="pickFromGallery"
                severity="secondary"
                size="large"
              >
                Choose from Gallery
              </Button>
            </div>
            <!-- Skip Photo Option -->
            <div class="text-center">
              <Button @click="skipPhoto" text size="large"> Skip </Button>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 2: Map Positioning (only shown when initialLocation is provided) -->
      <div v-if="props.initialLocation && currentStep === 1" class="flex-1 flex flex-col">
        <div class="flex-1 flex flex-col overflow-hidden">
          <!-- Plot Size Selector -->
          <Card class="flex-shrink-0 mb-4">
            <template #title>
              <span>Plot Size</span>
            </template>
            <template #content>
              <div class="flex space-x-2">
                <Button
                  v-for="size in plotSizes"
                  :key="size.id"
                  @click="selectPlotSize(size)"
                  :severity="
                    selectedPlotSize.id === size.id ? undefined : 'secondary'
                  "
                  :outlined="selectedPlotSize.id !== size.id"
                  size="large"
                >
                  {{ size.name }} ({{ size.width }}'×{{ size.height }}')
                </Button>
              </div>
              <MapEdit
                ref="mapEditRef"
                :location="currentLocation"
                :selected-plot-size="selectedPlotSize"
                :user-direction="userDirection"
                :is-visible="true"
                :is-photo-mode="true"
                title="Position Plot"
                instructions="Adjust the plot position and direction on the map by dragging and rotating."
                :existing-plots="plots.data.value || []"
                class="flex-1"
                style="height: 100%; min-height: 400px"
              />
            </template>
          </Card>
        </div>

        <!-- Fixed Bottom Buttons for Step 2 -->
        <div class="flex-shrink-0 p-4 bg-surface-0 border-t border-surface-200">
          <div class="flex space-x-2 justify-center">
            <Button
              @click="prevStep"
              severity="secondary"
              label="Back"
              size="large"
              class="flex-1"
            />
            <Button
              @click="handleMapSave"
              label="Continue"
              size="large"
              class="flex-1"
            />
          </div>
        </div>
      </div>

      <!-- Step 2/3: Plot Details -->
      <div v-if="(props.initialLocation && currentStep === 2) || (!props.initialLocation && currentStep === 1)" class="flex-1 flex flex-col">
        <div class="flex-1 overflow-y-auto">
          <div class="space-y-4 p-4">
            <!-- Plot Information -->
            <Card>
              <template #title>
                <span>Plot Information</span>
              </template>
              <template #content>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1"
                      >Plot Number</label
                    >
                    <InputText
                      v-model="plotNumber"
                      class="w-full"
                      placeholder="Enter plot number"
                    />
                  </div>
                  <div>
                    <label
                      class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1"
                      >Section</label
                    >
                    <InputText
                      v-model="section"
                      class="w-full"
                      placeholder="Enter section"
                    />
                  </div>
                  <div>
                    <label
                      class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1"
                      >Row</label
                    >
                    <InputText
                      v-model="row"
                      class="w-full"
                      placeholder="Enter row"
                    />
                  </div>
                  <div>
                    <label
                      class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1"
                      >Status</label
                    >
                    <Dropdown
                      v-model="status"
                      :options="statusOptions"
                      option-label="label"
                      option-value="value"
                      class="w-full"
                      placeholder="Select status"
                    />
                  </div>
                </div>
              </template>
            </Card>

            <Card v-if="analysisResult && analysisResult.success">
              <template #title>
                <span>Detected Information</span>
              </template>
              <template #content>
                <!-- Analysis Summary -->
                <div
                  class="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg"
                >
                  <div class="flex items-center space-x-2">
                    <svg
                      class="w-4 h-4 text-green-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <p class="text-green-800 text-sm font-medium">
                      Found {{ analysisResult.persons.length }} person(s) - will
                      be added when plot is created
                    </p>
                  </div>

                  <!-- Show found persons -->
                  <div
                    v-if="analysisResult.persons.length > 0"
                    class="mt-2 text-xs"
                  >
                    <div class="text-green-700 space-y-1">
                      <div
                        v-for="(person, index) in analysisResult.persons.slice(
                          0,
                          3,
                        )"
                        :key="index"
                      >
                        • {{ getPersonDisplayName(person) }}
                        <span v-if="person.date_of_death">
                          ({{ person.date_of_death }})</span
                        >
                      </div>
                      <div
                        v-if="analysisResult.persons.length > 3"
                        class="text-green-600"
                      >
                        + {{ analysisResult.persons.length - 3 }} more
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Detailed Person Information -->
                <div
                  v-for="(person, index) in analysisResult.persons"
                  :key="index"
                  class="mb-2 p-2 bg-surface-50 rounded border border-surface-200"
                >
                  <div class="text-sm">
                    <div class="font-medium text-surface-900">
                      {{ getPersonDisplayName(person) }}
                    </div>
                    <div class="text-surface-600">
                      {{ person.birthYear ? `Born: ${person.birthYear}` : "" }}
                      {{ person.deathYear ? `Died: ${person.deathYear}` : "" }}
                      {{
                        person.date_of_death
                          ? `Died: ${person.date_of_death}`
                          : ""
                      }}
                    </div>
                  </div>
                </div>
              </template>
            </Card>
          </div>
        </div>

        <!-- Fixed Bottom Buttons for Step 3 -->
        <div class="flex-shrink-0 p-4 bg-surface-0 border-t border-surface-200">
          <div class="flex space-x-2 justify-center">
            <Button
              @click="prevStep"
              severity="secondary"
              label="Back"
              size="large"
              class="flex-1"
            />
            <Button
              @click="createPlot"
              :disabled="isCreating"
              :label="isCreating ? 'Creating...' : 'Create Plot'"
              size="large"
              class="flex-1"
            />
          </div>
        </div>
      </div>
    </div>
  </Drawer>
</template>

<script setup>
import { ref, watch, onMounted, computed } from "vue";
import { useMapStore } from "../stores/map";
import { usePowerSyncStore } from "../stores/powersync";
import { useLocationsStore } from "../stores/locations";
import { usePlots } from "../stores/powersync";
import MapEdit from "./MapEdit.vue";
import { headstoneAnalysisService } from "../utils/headstoneAnalysisService";

// PrimeVue components
import Drawer from "primevue/drawer";
import Button from "primevue/button";
import Card from "primevue/card";
import InputText from "primevue/inputtext";
import Dropdown from "primevue/dropdown";
import Image from "primevue/image";

// Capacitor Camera service
import { CapacitorCameraService } from "../services/capacitorCamera";

// Convert photoData to File object for analysis
import { base64ToBlob } from "../powersync-schema";

// Shared utilities
import { DEFAULT_PLOT_SIZE, getSimplifiedPlotSizes } from "../utils/plotSizes";
import { wizardLogger } from "../utils/logger";
import { generatePlotGeometry } from "../utils/locationUtils";
import { useToastService } from "../utils/toastService";
import {
  collectGPSReadings,
  averageGPSReadings,
} from "../utils/gpsAveraging";
import {
  waitForGPSStability,
} from "../utils/gpsStability";
import { useDeviceOrientation } from "../composables/useDeviceOrientation";
import {
  extractEXIFGPSFromDataURL,
  selectBestGPS,
} from "../utils/exifGPS";
import {
  applyOrientationConstraint,
} from "../utils/gpsOrientationConstraint";

const isVisible = defineModel("isVisible", { type: Boolean, default: false });

const title = computed(() => {
  const stepNames = props.initialLocation 
    ? ["Take Photo", "Position Plot", "Plot Details"]
    : ["Take Photo", "Plot Details"];
  return `Step ${currentStep.value + 1}: ${stepNames[currentStep.value] || "Plot Details"}`;
});

const props = defineProps({
  initialLocation: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(["close", "plotCreated"]);

// Stores
const mapStore = useMapStore();
const powerSyncStore = usePowerSyncStore();
const locationsStore = useLocationsStore();
const plots = usePlots();

// Toast service
const { showSuccess, showError } = useToastService();

// Capacitor Camera service
const cameraService = CapacitorCameraService.getInstance();

// Device orientation
const { userDirection, startOrientationListener, stopOrientationListener } = useDeviceOrientation();

// State
const currentStep = ref(0);
const photoData = ref(null);
const isCapturing = ref(false);
const isAnalyzing = ref(false);
const analysisResult = ref(null);
const isCreating = ref(false);
const gpsStability = ref(null);
const isCheckingGPS = ref(false);

// Plot data
const selectedPlotSize = ref(DEFAULT_PLOT_SIZE);
const currentLocation = ref(null);
const tempPlotId = ref(null); // Store temp plot ID for analysis association
const plotGeometry = ref(null); // Store plot geometry from map
const plotFeature = ref(null); // Store plot feature from map
const mapEditRef = ref(null); // Reference to MapEdit component

// Use shared plot sizes
const plotSizes = ref(getSimplifiedPlotSizes());

// Form fields - using individual refs for better reactivity
const plotNumber = ref("");
const section = ref("");
const row = ref("");
const status = ref("Active");

// Debug form state
wizardLogger.debug("Form fields initialized:", {
  plotNumber: plotNumber.value,
  section: section.value,
  row: row.value,
  status: status.value,
});

// Status options
const statusOptions = [
  { label: "Active", value: "Active" },
  { label: "Reserved", value: "Reserved" },
  { label: "Occupied", value: "Occupied" },
  { label: "Unavailable", value: "Unavailable" },
];

// Start GPS stability monitoring
const startGPSMonitoring = async () => {
  isCheckingGPS.value = true;
  gpsStability.value = null;
  
  try {
    const stability = await waitForGPSStability(
      async () => {
        try {
          const location = await mapStore.getGPSLocation();
          return {
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: location.accuracy,
            timestamp: location.timestamp || Date.now(),
          };
        } catch (error) {
          // If GPS fails (e.g., timeout on laptop), throw error to be handled
          throw error;
        }
      },
      {
        minReadings: 3,
        maxAccuracy: 15,
        maxPositionVariance: 5,
        maxAccuracyVariance: 3,
        checkInterval: 1000,
        maxWaitTime: 30000,
        onProgress: (result) => {
          gpsStability.value = result;
        },
      },
    );
    
    gpsStability.value = stability;
    
    // Update current location with stable GPS
    if (stability.isStable && stability.readings.length > 0) {
      const lastReading = stability.readings[stability.readings.length - 1];
      currentLocation.value = {
        latitude: lastReading.latitude,
        longitude: lastReading.longitude,
        accuracy: stability.accuracy,
      };
    }
  } catch (error) {
    console.warn("GPS stability monitoring failed (device may not have GPS):", error);
    
    // For devices without GPS (like laptops), allow proceeding with manual location
    // Set a "not available" state but don't block the user
    gpsStability.value = {
      isStable: false,
      accuracy: Infinity,
      readings: [],
      stabilityScore: 0,
    };
    
    // Try to use map store location as fallback
    if (mapStore.currentLocation) {
      currentLocation.value = mapStore.currentLocation;
      console.log("Using map store location as fallback:", currentLocation.value);
    } else if (props.initialLocation) {
      currentLocation.value = props.initialLocation;
      console.log("Using initial location as fallback:", currentLocation.value);
    }
    
    // Don't show error - just allow manual location entry
    // The camera button will still be disabled, but user can use "Skip Photo" or
    // we can allow proceeding if location is available from map/initial location
  } finally {
    isCheckingGPS.value = false;
  }
};

// Watch for visibility changes
watch(
  () => props.isVisible,
  (newValue) => {
    if (newValue) {
      resetWizard();
      initializeLocation();
      // Generate temp plot ID for analysis association
      tempPlotId.value = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      wizardLogger.debug("Generated temp plot ID:", tempPlotId.value);
      
      // Only start GPS stability monitoring if no initial location was provided
      // If initialLocation is provided, the user has already specified the location
      if (!props.initialLocation) {
        startGPSMonitoring();
      } else {
        // Location already specified, mark GPS as stable (not needed)
        gpsStability.value = {
          isStable: true,
          accuracy: 0, // Manual location has perfect accuracy
          readings: [],
          stabilityScore: 1.0,
        };
        isCheckingGPS.value = false;
        wizardLogger.debug("Skipping GPS monitoring - location already specified:", props.initialLocation);
      }
      
      // Start device orientation tracking
      startOrientationListener();
    } else {
      // Stop GPS monitoring when wizard closes
      isCheckingGPS.value = false;
      gpsStability.value = null;
      // Stop device orientation tracking
      stopOrientationListener();
    }
  },
);

// Watch for step changes and populate form when reaching plot details step
watch(
  () => currentStep.value,
  async (newStep, oldStep) => {
    wizardLogger.debug("Step changed:", { from: oldStep, to: newStep });

    // Plot details step number depends on whether initialLocation is provided
    const plotDetailsStep = props.initialLocation ? 2 : 1;
    
    if (newStep === plotDetailsStep) {
      wizardLogger.debug(
        `Reached Plot Details step (step ${plotDetailsStep}), populating form with defaults and analysis results`,
      );
      await populateFormWithDefaults();

      // If we have analysis results, populate from them
      if (analysisResult.value && analysisResult.value.success) {
        wizardLogger.debug("Also populating from analysis results");
        populateFormFromAnalysis(analysisResult.value);
      }
    }
  },
);

// Watch for analysis results and populate form if we're already on plot details step
watch(
  () => analysisResult.value,
  (newResult, oldResult) => {
    wizardLogger.debug("Analysis result changed:", {
      hasNewResult: !!newResult,
      hasOldResult: !!oldResult,
      currentStep: currentStep.value,
    });

    // Plot details step number depends on whether initialLocation is provided
    const plotDetailsStep = props.initialLocation ? 2 : 1;
    
    if (newResult && newResult.success && currentStep.value === plotDetailsStep) {
      wizardLogger.debug(`Analysis completed while on Plot Details step (step ${plotDetailsStep}), populating form`);
      populateFormFromAnalysis(newResult);
    }
  },
);

// Watch for location changes from map store to update current location and move plot rectangle
// Only update if no initialLocation was provided (i.e., not manually selected from map)
watch(
  () => mapStore.currentLocation,
  (newLocation, oldLocation) => {
    // Only update if:
    // 1. Wizard is visible
    // 2. We're on the map step (step 1, only when initialLocation is provided)
    // 3. No initialLocation was provided (meaning user didn't manually select a location)
    // 4. We have a new location
    if (
      props.isVisible &&
      ((props.initialLocation && currentStep.value === 1) || (!props.initialLocation && currentStep.value === 0)) &&
      !props.initialLocation &&
      newLocation
    ) {
      // Only update if location actually changed (not just initial load)
      if (
        oldLocation &&
        (newLocation.latitude !== oldLocation.latitude ||
          newLocation.longitude !== oldLocation.longitude)
      ) {
        wizardLogger.debug(
          "Location changed (auto-tracking), updating currentLocation:",
          {
            old: oldLocation,
            new: newLocation,
            hasInitialLocation: !!props.initialLocation,
          },
        );
        currentLocation.value = newLocation;
        // MapEdit component will automatically update the polygon via its location prop watcher
      } else if (!oldLocation && newLocation) {
        // Initial location update (only if no initialLocation was provided)
        wizardLogger.debug(
          "Initial location update (auto-tracking):",
          newLocation,
        );
        currentLocation.value = newLocation;
      }
    } else if (
      props.isVisible &&
      currentStep.value === 1 &&
      props.initialLocation
    ) {
      wizardLogger.debug(
        "Location tracking disabled - using manually selected location:",
        props.initialLocation,
      );
    }
  },
  { immediate: false },
);

// Initialize location and direction
const initializeLocation = async () => {
  try {
    if (props.initialLocation) {
      currentLocation.value = props.initialLocation;
      wizardLogger.debug("Using initial location:", currentLocation.value);
    } else {
      // Get current location from map store
      currentLocation.value = mapStore.currentLocation;
      wizardLogger.debug("Using map store location:", currentLocation.value);

      // If map store location is not available, try to get it from geolocation
      if (!currentLocation.value) {
        wizardLogger.warn(
          "No location available from map store, attempting geolocation...",
        );
        try {
          const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 300000,
            });
          });

          currentLocation.value = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          };
          wizardLogger.debug(
            "Got location from geolocation:",
            currentLocation.value,
          );
        } catch (geoError) {
          wizardLogger.error(
            "Failed to get location from geolocation:",
            geoError,
          );
          // Use a default location as last resort
          currentLocation.value = {
            latitude: 55.204,
            longitude: -6.238,
            accuracy: 100,
          };
          wizardLogger.warn("Using default location:", currentLocation.value);
        }
      }
    }

    // User direction is now managed by useDeviceOrientation composable
    wizardLogger.debug("Location initialization complete:", {
      currentLocation: currentLocation.value,
      userDirection: userDirection.value,
    });
  } catch (error) {
    wizardLogger.error("Error initializing location:", error);
  }
};

// Reset wizard state
const resetWizard = () => {
  currentStep.value = 0;
  photoData.value = null;
  isCapturing.value = false;
  isAnalyzing.value = false;
  analysisResult.value = null;
  isCreating.value = false;
  selectedPlotSize.value = DEFAULT_PLOT_SIZE;
  tempPlotId.value = null; // Reset temp plot ID
  plotGeometry.value = null; // Reset plot geometry
  plotFeature.value = null; // Reset plot feature
  gpsStability.value = null;
  isCheckingGPS.value = false;

  // Reset form fields
  plotNumber.value = "";
  section.value = "";
  row.value = "";
  status.value = "Active";
};

// Camera functions
const takePhoto = async () => {
  try {
    console.log(
      "PlotCreationWizard: Taking grave photo with Capacitor Camera...",
    );
    isCapturing.value = true;

    // Start collecting GPS readings in parallel with photo capture
    const gpsCollectionPromise = (async () => {
      try {
        // Collect GPS readings with heading information
        const readings = await collectGPSReadings(
          async () => {
            const location = await mapStore.getGPSLocation();
            // Try to get GPS heading from the location if available
            // GPS heading is more accurate than device orientation when available
            let heading = userDirection.value;
            // Check if location has heading property (from Capacitor geolocation)
            if ('heading' in location && location.heading !== undefined && location.heading !== null) {
              heading = location.heading;
              console.log("PlotCreationWizard: Using GPS heading:", heading);
            }
            
            return {
              latitude: location.latitude,
              longitude: location.longitude,
              accuracy: location.accuracy,
              timestamp: location.timestamp || Date.now(),
              heading: heading,
            };
          },
          {
            count: 5, // Collect 5 readings
            interval: 800, // 800ms between readings
            minAccuracy: 15, // Only accept readings better than 15m
            maxDuration: 8000, // Max 8 seconds
          },
        );

        // Apply orientation constraint if we have a movement direction
        // This projects GPS readings onto the movement line, reducing perpendicular drift
        let processedReadings = readings;
        if (readings.length > 0 && userDirection.value !== null) {
          const movementDirection = readings[0].heading || userDirection.value;
          processedReadings = applyOrientationConstraint(
            readings,
            movementDirection,
            {
              projectOntoLine: true,
              filterByDeviation: true,
              maxDeviation: 5, // Filter readings more than 5m perpendicular to movement
            },
          );
          console.log("PlotCreationWizard: Applied orientation constraint:", {
            original: readings.length,
            filtered: processedReadings.length,
            direction: movementDirection,
          });
        }

        // Average the readings
        const averaged = averageGPSReadings(processedReadings, true);
        console.log("PlotCreationWizard: GPS averaged:", {
          original: readings.length,
          processed: processedReadings.length,
          filtered: averaged.readingsCount,
          accuracy: averaged.accuracy,
          stdDev: averaged.standardDeviation,
        });

        // Update current location with averaged result
        currentLocation.value = {
          latitude: averaged.latitude,
          longitude: averaged.longitude,
          accuracy: averaged.accuracy,
        };

        return averaged;
      } catch (error) {
        console.warn(
          "PlotCreationWizard: GPS averaging failed, using single reading:",
          error,
        );
        // Fallback to single reading
        const location = await mapStore.getGPSLocation();
        currentLocation.value = {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
        };
        return null;
      }
    })();

    // Use Capacitor Camera for high-quality grave photos
    const result = await cameraService.takeGravePhoto();

    // Wait for GPS averaging to complete
    const averagedGPS = await gpsCollectionPromise;

    if (result.dataUrl) {
      // Convert data URL to blob for analysis
      const blob = cameraService.dataUrlToBlob(result.dataUrl);
      const file = new File([blob], "grave-photo.jpg", { type: "image/jpeg" });

      // Extract EXIF GPS data from photo (camera GPS is often more accurate)
      let exifGPS = null;
      try {
        exifGPS = await extractEXIFGPSFromDataURL(result.dataUrl);
        if (exifGPS) {
          console.log("PlotCreationWizard: EXIF GPS extracted:", exifGPS);
        }
      } catch (error) {
        console.warn("PlotCreationWizard: Failed to extract EXIF GPS:", error);
      }

      // Combine EXIF GPS with app GPS for best accuracy
      let finalLocation = currentLocation.value;
      if (exifGPS && averagedGPS) {
        const bestGPS = selectBestGPS(exifGPS, {
          latitude: averagedGPS.latitude,
          longitude: averagedGPS.longitude,
          accuracy: averagedGPS.accuracy,
        });
        finalLocation = {
          latitude: bestGPS.latitude,
          longitude: bestGPS.longitude,
          accuracy: bestGPS.accuracy,
        };
        console.log("PlotCreationWizard: Best GPS selected:", {
          source: bestGPS.source,
          accuracy: bestGPS.accuracy,
          exifAccuracy: exifGPS.accuracy,
          appAccuracy: averagedGPS.accuracy,
        });
      }

      // Update current location with best GPS
      currentLocation.value = finalLocation;

      // Store the photo data
      photoData.value = {
        file: file,
        dataUrl: result.dataUrl,
        blob: blob,
      };

      console.log("PlotCreationWizard: Grave photo captured successfully");
      showSuccess("Photo captured successfully!");

      // Generate plot geometry from GPS location and direction
      // Only auto-generate if no initialLocation (user will adjust in map step if initialLocation provided)
      if (!props.initialLocation && currentLocation.value && selectedPlotSize.value) {
        plotGeometry.value = generatePlotGeometry(
          currentLocation.value,
          selectedPlotSize.value,
          userDirection.value,
        );
        wizardLogger.debug("Generated plot geometry from GPS:", {
          location: currentLocation.value,
          size: selectedPlotSize.value,
          direction: userDirection.value,
          geometry: plotGeometry.value,
        });
      } else if (props.initialLocation && currentLocation.value && selectedPlotSize.value) {
        // Generate initial geometry for map editing (user can adjust)
        plotGeometry.value = generatePlotGeometry(
          currentLocation.value,
          selectedPlotSize.value,
          userDirection.value,
        );
        wizardLogger.debug("Generated initial plot geometry for map editing:", {
          location: currentLocation.value,
          size: selectedPlotSize.value,
          direction: userDirection.value,
          geometry: plotGeometry.value,
        });
      }

      // Start analysis automatically
      analyzeHeadstoneImage();
      
      // Always advance to next step
      nextStep();
    } else {
      throw new Error("No photo data received");
    }
  } catch (error) {
    console.error("PlotCreationWizard: Error taking grave photo:", error);
    showError(`Failed to take photo: ${error.message}`);
  } finally {
    isCapturing.value = false;
  }
};

const pickFromGallery = async () => {
  try {
    console.log("PlotCreationWizard: Picking photo from gallery...");
    isCapturing.value = true;

    const result = await cameraService.pickFromGallery();

    if (result.dataUrl) {
      const blob = cameraService.dataUrlToBlob(result.dataUrl);
      const file = new File([blob], "grave-photo.jpg", { type: "image/jpeg" });

      photoData.value = {
        file: file,
        dataUrl: result.dataUrl,
        blob: blob,
      };

      console.log("PlotCreationWizard: Photo picked from gallery successfully");
      showSuccess("Photo selected successfully!");

      // Start analysis automatically
      analyzeHeadstoneImage();
    } else {
      throw new Error("No photo data received");
    }
  } catch (error) {
    console.error("PlotCreationWizard: Error picking from gallery:", error);
    showError(`Failed to pick photo: ${error.message}`);
  } finally {
    isCapturing.value = false;
  }
};

const retakePhoto = () => {
  photoData.value = null;
  analysisResult.value = null;
  isAnalyzing.value = false;
};

const skipPhoto = () => {
  photoData.value = null;
  analysisResult.value = null;
  isAnalyzing.value = false;
  nextStep();
};

// Analysis function
const analyzeHeadstoneImage = async () => {
  if (!photoData.value?.file) {
    console.error("PlotCreationWizard: No photo data available for analysis");
    return;
  }

  try {
    wizardLogger.debug("Starting headstone analysis...");
    wizardLogger.debug("Using temp plot ID for analysis:", tempPlotId.value);
    isAnalyzing.value = true;
    analysisResult.value = null;

    const result = await headstoneAnalysisService.analyzeHeadstoneImage(
      photoData.value.file,
      tempPlotId.value,
    );

    analysisResult.value = result;

    if (result.success) {
      showSuccess(
        `Analysis completed successfully! Found ${result.persons.length} person(s).`,
      );

      // Prepopulate form with analysis results
      populateFormFromAnalysis(result);
    } else {
      showError(`Analysis failed: ${result.error}`);
    }
  } catch (error) {
    console.error("PlotCreationWizard: Error analyzing headstone:", error);
    analysisResult.value = {
      success: false,
      error: error.message || "Analysis failed",
    };
    showError(`Analysis failed: ${error.message}`);
  } finally {
    isAnalyzing.value = false;
  }
};

// Navigation functions
const nextStep = () => {
  // Max step depends on whether initialLocation is provided
  // With initialLocation: Step 0 (photo) -> Step 1 (map) -> Step 2 (details) = max step 2
  // Without initialLocation: Step 0 (photo) -> Step 1 (details) = max step 1
  const maxStep = props.initialLocation ? 2 : 1;
  if (currentStep.value < maxStep) {
    currentStep.value++;
  }
};

const prevStep = () => {
  if (currentStep.value > 0) {
    currentStep.value--;
  }
};

// Plot size selection
const selectPlotSize = (size) => {
  wizardLogger.debug("Selecting plot size:", size);
  wizardLogger.debug("Previous size:", selectedPlotSize.value);
  selectedPlotSize.value = size;
  wizardLogger.debug("New selectedPlotSize:", selectedPlotSize.value);
};

// Get display name for person
const getPersonDisplayName = (person) => {
  if (!person) return "Unknown Name";

  // Try different name field combinations
  if (person.name) return person.name;

  // Build name from forename, middle_name, surname
  const nameParts = [];
  if (person.forename) nameParts.push(person.forename);
  if (person.middle_name) nameParts.push(person.middle_name);
  if (person.surname) nameParts.push(person.surname);

  if (nameParts.length > 0) {
    return nameParts.join(" ");
  }

  // Fallback to any available name field
  if (person.firstName) return person.firstName;
  if (person.lastName) return person.lastName;
  if (person.givenName) return person.givenName;

  return "Unknown Name";
};

// Map save handler
const handleMapSave = () => {
  wizardLogger.debug("Getting plot data from MapEdit component");

  // Get current plot data from MapEdit component
  const mapData = mapEditRef.value?.getCurrentPlotData();

  if (!mapData) {
    wizardLogger.warn("No plot data available from MapEdit component");
    return;
  }

  wizardLogger.debug("Map data received:", mapData);

  // Store map data for final plot creation
  if (mapData.location) {
    currentLocation.value = mapData.location;
    wizardLogger.debug(
      "Updated currentLocation from map data:",
      currentLocation.value,
    );
  } else {
    wizardLogger.warn(
      "No location in map data, keeping existing location:",
      currentLocation.value,
    );
  }

  if (mapData.direction !== undefined) {
    userDirection.value = mapData.direction;
    wizardLogger.debug(
      "Updated userDirection from map data:",
      userDirection.value,
    );
  }

  // Store geometry and feature data for plot creation
  if (mapData.geometry) {
    // Convert OpenLayers geometry to serializable format
    const serializedGeometry = mapData.geometry.map((coord) => [
      coord[0],
      coord[1],
    ]);
    plotGeometry.value = serializedGeometry;
    wizardLogger.debug("Stored plot geometry:", plotGeometry.value);
  }

  if (mapData.feature) {
    plotFeature.value = mapData.feature;
    wizardLogger.debug("Stored plot feature:", plotFeature.value);
  }

  wizardLogger.debug("Final state before nextStep:", {
    currentLocation: currentLocation.value,
    userDirection: userDirection.value,
    plotGeometry: plotGeometry.value,
    plotFeature: plotFeature.value,
  });

  nextStep();
};

// Create plot
const createPlot = async () => {
  try {
    isCreating.value = true;

    // Ensure PowerSync store is initialized before creating plot (only if authenticated)
    const { useAuthStore } = await import('../stores/auth');
    const authStore = useAuthStore();
    if (!powerSyncStore.isInitialized && authStore.isAuthenticated) {
      wizardLogger.debug(
        "PowerSync store not initialized, initializing now...",
      );
      await powerSyncStore.initialize();
      wizardLogger.debug("PowerSync store initialized successfully");
    }

    // Additional check to ensure PowerSync client is fully ready
    if (!powerSyncStore.powerSync) {
      wizardLogger.error("PowerSync client not available after initialization");
      throw new Error("PowerSync client not available");
    }

    // Validate required data
    if (!currentLocation.value) {
      wizardLogger.warn(
        "Current location is missing, attempting to re-initialize...",
      );
      await initializeLocation();

      if (!currentLocation.value) {
        throw new Error("Current location is required to create a plot");
      }
    }

    if (!selectedPlotSize.value) {
      throw new Error("Plot size is required to create a plot");
    }

    wizardLogger.debug("Creating plot with data:", {
      location: currentLocation.value,
      plotSize: selectedPlotSize.value,
      direction: userDirection.value,
      plotGeometry: plotGeometry.value,
      plotFeature: plotFeature.value,
    });

    // Use stored geometry from map if available, otherwise generate from location/size/direction
    let geometry;
    if (plotGeometry.value) {
      wizardLogger.debug("Using stored geometry from map:", plotGeometry.value);
      geometry = plotGeometry.value;
    } else {
      wizardLogger.debug("Generating geometry from location/size/direction");
      geometry = generatePlotGeometry(
        currentLocation.value,
        selectedPlotSize.value,
        userDirection.value,
      );
    }

    // Get selected location ID from locations store
    const selectedLocationId = locationsStore.selectedLocationId;

    // Prepare notes from analysis results
    let notes = "";
    if (analysisResult.value && analysisResult.value.success) {
      notes = analysisResult.value.full_text_transcription || "";
    }

    const plotData = {
      geometry: geometry,
      section: section.value,
      row: row.value,
      number: plotNumber.value,
      status: status.value,
      location_id: selectedLocationId || null,
      temp_plot_id: tempPlotId.value || null, // Add temp plot ID for analysis association
      type: photoData.value ? "Photo-Created" : "Manual-Created",
      notes: notes,
      depth: 6,
      location: {
        latitude: currentLocation.value.latitude,
        longitude: currentLocation.value.longitude,
        accuracy: currentLocation.value.accuracy || 5,
      },
      createdAt: new Date().toISOString(),
      // photos field removed - use plot_images table instead
    };

    wizardLogger.debug("Creating plot with comprehensive data:", plotData);

    const newPlot = await powerSyncStore.createNewPlot(plotData);
    wizardLogger.debug("Plot created successfully:", newPlot);
    showSuccess("Plot created successfully!");

    // Add plot to map
    await mapStore.addPlotMarker(newPlot);

    // Process any stored analysis results for this temp plot ID
    if (tempPlotId.value) {
      wizardLogger.debug(
        "Processing stored analysis results for temp plot ID:",
        tempPlotId.value,
      );
      await headstoneAnalysisService.processStoredResultsForPlot(
        newPlot.id,
        tempPlotId.value,
      );
    }

    // Emit plot created event
    emit("plotCreated", newPlot);

    // Dispatch plot created event for other components
    try {
      window.dispatchEvent(
        new CustomEvent("plot-created", {
          detail: { plotId: newPlot.id, plot: newPlot },
        }),
      );
    } catch (dispatchError) {
      wizardLogger.warn("Error dispatching plot-created event:", dispatchError);
    }

    // Handle zoom to plot and show popup
    try {
      wizardLogger.debug("Handling zoom to newly created plot:", newPlot.id);
      if (mapStore.map) {
        // Add the plot to the map first if it's not already there
        mapStore.addPlotMarker(newPlot);
        wizardLogger.debug("Plot marker added");

        // On mobile devices, don't zoom or select the plot to avoid obscuring the camera button
        const isMobile = window.innerWidth < 768; // Standard mobile breakpoint
        
        if (!isMobile) {
          // Then zoom to it and show the popup (desktop only)
          wizardLogger.debug("Desktop detected, zooming to plot");
          mapStore.zoomToPlot(newPlot);
          wizardLogger.debug("Zoom to plot initiated");
        } else {
          wizardLogger.debug("Mobile detected, skipping zoom/selection to avoid obscuring camera button");
        }
      } else {
        wizardLogger.warn("Map not available for zooming");
      }
    } catch (error) {
      wizardLogger.error("Error handling zoom to plot:", error);
    }

    // Process photo in background if available
    if (photoData.value) {
      wizardLogger.debug("Processing photo in background...");
      wizardLogger.debug("Photo data structure:", {
        hasDataUrl: !!photoData.value.dataUrl,
        hasFile: !!photoData.value.file,
        hasBlob: !!photoData.value.blob,
      });
      processRemainingOperationsInBackground(newPlot, photoData.value.dataUrl);
    }

    // Close the wizard
    closeWizard();
  } catch (error) {
    wizardLogger.error("Error creating plot:", error);

    // Provide more specific error messages
    let errorMessage = "Error creating plot. ";
    if (error.message === "PowerSync client not available") {
      errorMessage += "Please try again - the system is still initializing.";
    } else if (
      error.message.includes("network") ||
      error.message.includes("connection")
    ) {
      errorMessage += "Please check your internet connection and try again.";
    } else {
      errorMessage += "Please try again.";
    }

    showError(errorMessage);
  } finally {
    isCreating.value = false;
  }
};

// Background processing function for photo upload
const processRemainingOperationsInBackground = async (
  newPlot,
  preservedPhotoDataUrl,
) => {
  wizardLogger.debug(
    "Starting photo processing in background for plot:",
    newPlot.id,
  );
  wizardLogger.debug("Preserved photo data URL:", preservedPhotoDataUrl);

  try {
    // Process photo if available
    if (preservedPhotoDataUrl) {
      wizardLogger.debug("Processing photo in background...");
      wizardLogger.debug(
        "preservedPhotoDataUrl type:",
        typeof preservedPhotoDataUrl,
      );
      wizardLogger.debug(
        "preservedPhotoDataUrl length:",
        preservedPhotoDataUrl.length,
      );

      // Extract the base64 data (remove data:image/jpeg;base64, prefix)
      const base64Data = preservedPhotoDataUrl.split(",")[1];
      wizardLogger.debug("Base64 data length:", base64Data.length);

      const imageBlob = base64ToBlob(base64Data, "image/jpeg");
      wizardLogger.debug("Image blob created:", imageBlob.size, "bytes");

      // Add the image to the plot (analysis is handled by the service)
      const savedImage = await powerSyncStore.addPlotImage(
        newPlot.id,
        imageBlob,
        "plot-photo.jpg",
        {
          analyzeForHeadstone: false, // Analysis is handled by the service
        },
      );
      wizardLogger.debug(
        "Photo saved successfully in background:",
        savedImage.id,
      );

      // Force a refetch of the images query to ensure it appears immediately
      window.dispatchEvent(
        new CustomEvent("refetch-images", {
          detail: { plotId: newPlot.id },
        }),
      );

      // Dispatch completion notification for photo processing
      window.dispatchEvent(
        new CustomEvent("background-processing-completed", {
          detail: {
            plotId: newPlot.id,
            operations: ["photo-upload"],
            source: "immediate-processing",
          },
        }),
      );
    } else {
      wizardLogger.warn("No photo data URL provided for processing");
    }

    wizardLogger.debug("Photo processing completed for plot:", newPlot.id);
  } catch (error) {
    wizardLogger.error("Error in photo processing:", error);
    wizardLogger.error("Error details:", {
      message: error.message,
      stack: error.stack,
    });
    // Don't throw - this is background processing, errors shouldn't affect the user experience
  }
};

// Close wizard
const closeWizard = () => {
  console.log("PlotCreationWizard: Closing wizard");
  emit("close");
};

// Populate form with default values
const populateFormWithDefaults = async () => {
  wizardLogger.debug("Populating form with default values...");

  // Generate plot number if not already set
  if (!plotNumber.value) {
    try {
      const generatedNumber = await powerSyncStore.generateNextPlotNumber();
      plotNumber.value = generatedNumber;
      wizardLogger.debug("Generated plot number:", generatedNumber);
    } catch (error) {
      wizardLogger.error("Error generating plot number:", error);
      plotNumber.value = ""; // Fallback to empty
    }
  }

  if (!section.value) {
    section.value = "A"; // Default section
  }

  if (!row.value) {
    row.value = "1"; // Default row
  }

  if (!status.value) {
    status.value = "Active"; // Default status
  }

  wizardLogger.debug("Form populated with defaults:", {
    plotNumber: plotNumber.value,
    section: section.value,
    row: row.value,
    status: status.value,
  });
};

// Prepopulate form with analysis results
const populateFormFromAnalysis = (result) => {
  wizardLogger.debug("Populating form from analysis results:", result);
  wizardLogger.debug("Analysis result structure:", {
    success: result.success,
    hasPersons: !!result.persons,
    personsLength: result.persons?.length || 0,
    firstPerson: result.persons?.[0],
  });

  if (result.success && result.persons && result.persons.length > 0) {
    const firstPerson = result.persons[0];

    wizardLogger.debug("First person data:", firstPerson);

    // Extract plot information from analysis
    if (firstPerson.plot_number) {
      plotNumber.value = firstPerson.plot_number;
      wizardLogger.debug("Set plot number:", firstPerson.plot_number);
    }

    if (firstPerson.section) {
      section.value = firstPerson.section;
      wizardLogger.debug("Set section:", firstPerson.section);
    }

    if (firstPerson.row) {
      row.value = firstPerson.row;
      wizardLogger.debug("Set row:", firstPerson.row);
    }

    // Set status based on analysis
    if (firstPerson.status) {
      status.value = firstPerson.status;
      wizardLogger.debug("Set status:", firstPerson.status);
    }

    wizardLogger.info("Form populated with analysis data:", {
      plotNumber: plotNumber.value,
      section: section.value,
      row: row.value,
      status: status.value,
    });
  } else {
    wizardLogger.warn("No valid analysis data to populate form with");
  }
};

// Initialize on mount
onMounted(() => {
  if (props.isVisible) {
    initializeLocation();
  }
});
</script>
