<template>
  <div class="h-full overflow-y-auto p-4 space-y-4">
    <!-- Header Card -->
    <Card>
      <template #content>
        <div class="space-y-3">
          <div>
            <h1 class="text-xl font-semibold text-surface-900">Settings</h1>
            <p class="text-sm text-surface-600">
              Manage cemeteries, storage, and on-device reading
            </p>
          </div>

          <div class="flex items-center justify-between">
            <div class="text-sm">
              <span class="font-medium">Status:</span>
              <Chip
                :label="connectionStatus"
                :severity="connectionStatusSeverity"
                size="small"
              />
            </div>
          </div>
        </div>
      </template>
    </Card>

    <!-- Mobile-Friendly Accordion Layout -->
    <Accordion :multiple="true">
      <!-- Facility Selection -->
      <AccordionTab>
        <template #header>
          <div class="flex items-center justify-between w-full">
            <span>Cemeteries</span>
            <div class="text-sm text-surface-500">
              {{ locations.length }} cemeteries
            </div>
          </div>
        </template>

        <!-- Current Selection -->
        <Message
          v-if="selectedLocation"
          severity="info"
          :closable="false"
          class="mb-4"
        >
          <template #icon>
            <i class="pi pi-building"></i>
          </template>
          <div class="space-y-2">
            <h3 class="font-medium text-sm">Current cemetery</h3>
            <p class="text-sm">{{ selectedLocation.name }}</p>
            <div class="flex items-center justify-between text-xs">
              <span
                >Created: {{ formatDate(selectedLocation.dateCreated) }}</span
              >
              <Chip
                v-if="selectedLocation.isPublic"
                label="Public"
                severity="success"
                size="small"
              />
              <Chip v-else label="Private" severity="secondary" size="small" />
            </div>
            <div class="text-xs">
              Zoom: {{ selectedLocation.minZoom }} -
              {{ selectedLocation.maxZoom }}
            </div>
          </div>
        </Message>

        <!-- Facility List -->
        <div v-if="loading" class="text-center py-6">
          <ProgressSpinner />
          <p class="text-sm mt-2">Loading cemeteries...</p>
        </div>

        <Message
          v-else-if="locations.length === 0"
          severity="warn"
          :closable="false"
        >
          <template #icon>
            <i class="pi pi-exclamation-triangle"></i>
          </template>
          No cemeteries available
        </Message>

        <div v-else class="space-y-3">
          <!-- Search -->
          <InputText
            v-model="searchQuery"
            placeholder="Search cemeteries..."
            class="w-full"
          />

          <!-- Facility Cards -->
          <div class="space-y-2">
            <Card
              v-for="location in filteredLocations"
              :key="location.id"
              @click="selectLocation(location.id)"
              :class="[
                'cursor-pointer',
                selectedLocationId === location.id ? 'p-highlight' : '',
              ]"
            >
              <template #content>
                <div class="space-y-2">
                  <div class="flex items-start justify-between">
                    <h3 class="font-medium text-sm">{{ location.name }}</h3>
                    <Chip
                      v-if="location.isPublic"
                      label="Public"
                      severity="success"
                      size="small"
                    />
                    <Chip
                      v-else
                      label="Private"
                      severity="secondary"
                      size="small"
                    />
                  </div>

                  <div class="text-xs space-y-1">
                    <div class="flex items-center">
                      <i class="pi pi-search mr-2 text-xs"></i>
                      <span
                        >Zoom: {{ location.minZoom }} -
                        {{ location.maxZoom }}</span
                      >
                    </div>

                    <div class="flex items-center">
                      <i class="pi pi-calendar mr-2 text-xs"></i>
                      <span>{{ formatDate(location.dateCreated) }}</span>
                    </div>
                  </div>
                </div>
              </template>

              <template #footer>
                <div class="flex items-center justify-between">
                  <Chip
                    v-if="selectedLocationId === location.id"
                    label="Selected"
                    severity="success"
                    size="small"
                  />
                  <div v-else></div>

                  <div class="flex gap-2">
                    <Button
                      v-if="
                        location.userRole === 'owner' ||
                        location.userRole === 'admin'
                      "
                      @click.stop="goToLocationSettings(location.id)"
                      severity="secondary"
                      size="small"
                      icon="pi pi-cog"
                      title="Location settings, members, invites, and join requests"
                      aria-label="Location settings, members, invites, and join requests"
                    />
                    <Button
                      @click.stop="confirmDeleteLocation(location)"
                      :disabled="deletingLocationId === location.id"
                      severity="danger"
                      size="small"
                      icon="pi pi-trash"
                      :loading="deletingLocationId === location.id"
                      :title="
                        deletingLocationId === location.id
                          ? 'Deleting...'
                          : 'Delete cemetery'
                      "
                      :aria-label="
                        deletingLocationId === location.id
                          ? 'Deleting...'
                          : 'Delete cemetery'
                      "
                    />
                  </div>
                </div>
              </template>
            </Card>
          </div>
        </div>
      </AccordionTab>

      <!-- Storage Information -->
      <AccordionTab>
        <template #header>
          <div class="flex items-center justify-between w-full">
            <span>Storage Information</span>
            <Button
              @click="refreshStorageInfo"
              :disabled="storageLoading"
              severity="secondary"
              size="small"
              text
            >
              <template #icon>
                <svg
                  class="w-4 h-4"
                  :class="{ 'animate-spin': storageLoading }"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </template>
            </Button>
          </div>
        </template>

        <div class="space-y-3">
          <!-- Total Storage -->
          <Card>
            <template #content>
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-medium">Total Storage</p>
                  <p class="text-lg font-bold">
                    {{ formatBytes(storageSummary.totalSize) }}
                  </p>
                </div>
                <Avatar
                  icon="pi pi-database"
                  size="large"
                  style="
                    background-color: var(--primary-color);
                    color: var(--primary-color-text);
                  "
                />
              </div>
            </template>
          </Card>

          <!-- Storage Breakdown -->
          <div class="grid grid-cols-2 gap-3">
            <Card>
              <template #content>
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-xs font-medium">Database</p>
                    <p class="text-sm font-bold">
                      {{ formatBytes(storageSummary.breakdown.database.size) }}
                    </p>
                  </div>
                  <Avatar
                    icon="pi pi-database"
                    size="normal"
                    style="background-color: var(--green-500); color: white"
                  />
                </div>
              </template>
            </Card>

            <Card>
              <template #content>
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-xs font-medium">Images</p>
                    <p class="text-sm font-bold">
                      {{ formatBytes(storageSummary.breakdown.images.size) }}
                    </p>
                  </div>
                  <Avatar
                    icon="pi pi-image"
                    size="normal"
                    style="background-color: var(--purple-500); color: white"
                  />
                </div>
              </template>
            </Card>

            <Card v-if="storageSummary.breakdown.tiles.size > 0">
              <template #content>
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-xs font-medium">Map Tiles</p>
                    <p class="text-sm font-bold">
                      {{ formatBytes(storageSummary.breakdown.tiles.size) }}
                    </p>
                  </div>
                  <Avatar
                    icon="pi pi-map"
                    size="normal"
                    style="background-color: var(--blue-500); color: white"
                  />
                </div>
              </template>
            </Card>

            <Card v-if="storageSummary.breakdown.cache.size > 0">
              <template #content>
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-xs font-medium">Cache</p>
                    <p class="text-sm font-bold">
                      {{ formatBytes(storageSummary.breakdown.cache.size) }}
                    </p>
                  </div>
                  <Avatar
                    icon="pi pi-clock"
                    size="normal"
                    style="background-color: var(--orange-500); color: white"
                  />
                </div>
              </template>
            </Card>
          </div>
        </div>
      </AccordionTab>

      <!-- Analysis Settings -->
      <AccordionTab>
        <template #header>
          <div class="flex items-center justify-between w-full">
            <span>Headstone reading</span>
            <Chip
              :label="cemeteryAiLabel"
              :severity="cemeteryAiSeverity"
              size="small"
            />
          </div>
        </template>

        <div class="space-y-4">
          <Message
            :severity="selectedLocation?.aiStatus === 'error' ? 'warn' : 'info'"
            :closable="false"
          >
            <div class="space-y-2">
              <p class="text-sm font-medium">{{ cemeteryAiHeadline }}</p>
              <p class="text-xs">{{ cemeteryAiBody }}</p>
              <p class="text-xs text-surface-500">
                Some plot photos are sampled in the background to improve the
                shared model. Other cemeteries only receive model weights —
                never your photos or names.
              </p>
            </div>
          </Message>

          <Card v-if="coverageMessage">
            <template #content>
              <p class="text-sm mb-2">{{ coverageMessage }}</p>
              <Button
                label="Help improve reading"
                size="small"
                outlined
                @click="goTeach"
              />
            </template>
          </Card>

          <Card>
            <template #content>
              <div class="space-y-3">
                <div
                  v-if="localModelState.isLoading"
                  class="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800"
                >
                  Preparing on-device reading…
                  {{ localModelState.loadProgress.toFixed(0) }}%
                </div>
                <div
                  v-else-if="localModelState.isLoaded"
                  class="p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800"
                >
                  On-device reading is ready.
                </div>
                <div
                  v-else-if="localModelState.error"
                  class="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800"
                >
                  {{ localModelState.error }}
                </div>

                <div class="flex flex-wrap gap-2">
                  <Button
                    v-if="!localModelState.isLoaded"
                    label="Download on-device model"
                    size="small"
                    :loading="installingModel"
                    @click="installAdapter"
                  />
                  <Button
                    label="Vision eval (dev)"
                    size="small"
                    severity="secondary"
                    outlined
                    @click="router.push('/dev/vision-eval')"
                  />
                </div>

                <p v-if="deviceMessage" class="text-xs text-surface-500">
                  {{ deviceMessage }}
                </p>
              </div>
            </template>
          </Card>
        </div>
      </AccordionTab>

      <!-- Console Logs -->
      <AccordionTab>
        <template #header>
          <div class="flex items-center justify-between w-full">
            <span>Console Logs</span>
            <div class="text-sm text-surface-500">
              {{ filteredLogs.length }} logs
            </div>
          </div>
        </template>

        <div class="space-y-3">
          <!-- Controls -->
          <div class="flex flex-wrap gap-2">
            <Button
              @click="clearLogs"
              severity="secondary"
              size="small"
              label="Clear Logs"
              icon="pi pi-trash"
            />
            <Button
              @click="exportLogs"
              severity="secondary"
              size="small"
              label="Export"
              icon="pi pi-download"
            />
            <div class="flex-1"></div>
            <Dropdown
              v-model="logLevelFilter"
              :options="logLevelOptions"
              placeholder="Filter by level"
              class="w-40"
              size="small"
            />
          </div>

          <!-- Logs Display -->
          <div
            ref="logsContainer"
            class="bg-surface-900 text-surface-100 rounded-lg p-3 font-mono text-xs overflow-auto"
            style="max-height: 500px; min-height: 200px"
          >
            <div
              v-if="filteredLogs.length === 0"
              class="text-surface-400 text-center py-4"
            >
              No logs to display
            </div>
            <div
              v-for="log in filteredLogs"
              :key="log.id"
              class="mb-2 pb-2 border-b border-surface-700 last:border-0"
              :class="{
                'text-green-400': log.level === 'info',
                'text-yellow-400': log.level === 'warn',
                'text-red-400': log.level === 'error',
                'text-blue-400': log.level === 'debug',
                'text-surface-300': log.level === 'log',
              }"
            >
              <div class="flex items-start gap-2">
                <span class="text-surface-500 text-xs shrink-0">
                  {{ formatLogTime(log.timestamp) }}
                </span>
                <span
                  class="shrink-0 font-semibold uppercase text-xs"
                  :class="{
                    'text-green-400': log.level === 'info',
                    'text-yellow-400': log.level === 'warn',
                    'text-red-400': log.level === 'error',
                    'text-blue-400': log.level === 'debug',
                    'text-surface-300': log.level === 'log',
                  }"
                >
                  {{ log.level }}
                </span>
                <div class="flex-1 break-words space-y-1">
                  <div>{{ log.message }}</div>

                  <!-- Error Details -->
                  <div
                    v-if="log.errorDetails"
                    class="mt-2 pl-4 border-l-2 border-red-500/50 space-y-1 text-xs"
                  >
                    <div v-if="log.errorDetails.name" class="text-red-300">
                      <span class="font-semibold">Error Name:</span>
                      {{ log.errorDetails.name }}
                    </div>
                    <div v-if="log.errorDetails.message" class="text-red-300">
                      <span class="font-semibold">Message:</span>
                      {{ log.errorDetails.message }}
                    </div>
                    <div
                      v-if="
                        log.errorDetails.fileName || log.errorDetails.lineNumber
                      "
                      class="text-surface-400"
                    >
                      <span class="font-semibold">Location:</span>
                      <span v-if="log.errorDetails.fileName">
                        {{ log.errorDetails.fileName.split("/").pop() }}
                      </span>
                      <span v-if="log.errorDetails.lineNumber">
                        :{{ log.errorDetails.lineNumber }}
                      </span>
                      <span v-if="log.errorDetails.columnNumber">
                        :{{ log.errorDetails.columnNumber }}
                      </span>
                    </div>
                    <div
                      v-if="log.errorDetails.stack"
                      class="text-surface-500 mt-2 whitespace-pre-wrap font-mono text-xs max-h-40 overflow-auto"
                    >
                      <div class="font-semibold mb-1">Stack Trace:</div>
                      <div class="pl-2">{{ log.errorDetails.stack }}</div>
                    </div>
                    <div
                      v-if="log.errorDetails.cause"
                      class="text-surface-400 mt-2"
                    >
                      <span class="font-semibold">Cause:</span>
                      <pre class="mt-1 text-xs whitespace-pre-wrap">{{
                        formatErrorCause(log.errorDetails.cause)
                      }}</pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AccordionTab>
    </Accordion>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from "vue";
import { useRouter } from "vue-router";
import { useOnline } from "@vueuse/core";
import { usePowerSyncStore } from "../stores/powersync";
import { useLocationsStore } from "../stores/locations";
import { useSettingsStore } from "../stores/settings";
import { storageAnalytics } from "../utils/storageAnalytics";
import type { StorageSummary } from "../utils/storageAnalytics";
import { localLLMService } from "../services/localLLMService";
import { consoleLogger, type LogEntry } from "../utils/consoleLogger";
import { ensureLocalModelForLocation, ensureSharedLocalModel } from "../services/adapterInstallService";
import { detectDeviceAiCapabilities } from "../utils/deviceAiCapabilities";
import {
  countTrainingExamples,
} from "../utils/headstoneTrainingService";
import { evaluateTrainingCoverage } from "../utils/trainingCoverage";
import { hasGlobalAdapterCached } from "../services/globalAdapterService";

// PrimeVue imports
import InputText from "primevue/inputtext";
import Dropdown from "primevue/dropdown";
import Button from "primevue/button";

const router = useRouter();
const powerSyncStore = usePowerSyncStore();
const locationsStore = useLocationsStore();
const settingsStore = useSettingsStore();
const isOnline = useOnline();

// State
const loading = ref(false);
const storageLoading = ref(false);
const searchQuery = ref("");
const deletingLocationId = ref<string | null>(null);
const localModelState = ref(localLLMService.getState());
const installingModel = ref(false);
const deviceMessage = ref("");
const coverageMessage = ref("");

const cemeteryAiLabel = computed(() => {
  if (localModelState.value.isLoaded) return "On-device";
  if (localModelState.value.isLoading) return "Downloading";
  const s = selectedLocation.value?.aiStatus || "teacher";
  if (s === "training") return "Improving";
  if (s === "error") return "Needs attention";
  return "On-device";
});

const cemeteryAiSeverity = computed(() => {
  if (localModelState.value.isLoaded) return "success";
  if (localModelState.value.isLoading) return "info";
  const s = selectedLocation.value?.aiStatus || "teacher";
  if (s === "training") return "info";
  if (s === "error") return "warn";
  return "secondary";
});

const cemeteryAiHeadline = computed(() => {
  if (localModelState.value.isLoaded) return "On-device reading is ready";
  if (localModelState.value.isLoading) {
    return "Downloading the on-device model…";
  }
  const s = selectedLocation.value?.aiStatus || "teacher";
  if (s === "training") return "Improving the shared model in the background…";
  if (s === "error") return "Shared-model training needs attention";
  return "On-device reading starts automatically";
});

const cemeteryAiBody = computed(() => {
  const s = selectedLocation.value?.aiStatus || "teacher";
  if (localModelState.value.isLoaded) {
    return "New photos are read on this device. Checking names is optional and helps improve reading for everyone.";
  }
  if (s === "training") {
    return "You can keep working. Plot photos are sampled in the background to improve the shared model.";
  }
  if (s === "error") {
    return (
      selectedLocation.value?.aiTrainError ||
      "On-device reading still works. Shared-model training can retry from sampled plot photos."
    );
  }
  return "Add plots as usual. The on-device model downloads in the background. Some photos are sampled to improve reading for everyone.";
});

async function refreshCoverage() {
  const loc = selectedLocation.value;
  if (!loc) {
    coverageMessage.value = "";
    return;
  }
  try {
    const counts = await countTrainingExamples(loc.id);
    const hasGlobal = await hasGlobalAdapterCached();
    const status = evaluateTrainingCoverage({
      total: counts.total,
      byStoneType: counts.byStoneType,
      hasGlobalAdapter: hasGlobal,
    });
    coverageMessage.value = status.ready
      ? "Enough sampled stones — shared-model training can run automatically."
      : `${status.message} Optional — reading already works on-device.`;
  } catch {
    coverageMessage.value = "";
  }
}

function goTeach() {
  router.push({ path: "/onboarding", query: { teach: "1" } });
}

async function installAdapter() {
  const loc = selectedLocation.value;
  installingModel.value = true;
  startPollingLLMState();
  try {
    if (loc?.aiStatus === "local" && loc.adapterUrl) {
      const ok = await ensureLocalModelForLocation(loc);
      if (!ok) await ensureSharedLocalModel();
    } else {
      await ensureSharedLocalModel();
    }
    localModelState.value = localLLMService.getState();
  } catch (e) {
    console.error(e);
  } finally {
    installingModel.value = false;
  }
}

// Console logs state
const logs = ref<LogEntry[]>([]);
const logLevelFilter = ref<string | null>(null);
const logsContainer = ref<HTMLElement | null>(null);

const logLevelOptions = [
  { label: "All", value: null },
  { label: "Log", value: "log" },
  { label: "Info", value: "info" },
  { label: "Warn", value: "warn" },
  { label: "Error", value: "error" },
  { label: "Debug", value: "debug" },
];

const filteredLogs = computed(() => {
  if (!logLevelFilter.value) {
    return logs.value;
  }
  return logs.value.filter((log) => log.level === logLevelFilter.value);
});

// Map settings (reactive copy)
const mapSettings = ref({ ...settingsStore.mapSettings });

// Storage analytics state
const storageSummary = ref<StorageSummary>({
  totalSize: 0,
  totalItems: 0,
  breakdown: {
    cache: { size: 0, items: 0 },
    database: { size: 0, items: 0 },
    assets: { size: 0, items: 0 },
    tiles: { size: 0, items: 0 },
    images: { size: 0, items: 0 },
    other: { size: 0, items: 0 },
  },
  items: [],
});

// Computed properties
const connectionStatus = computed(() => {
  if (!isOnline.value) return "Offline";
  if (!powerSyncStore.isInitialized) return "Initializing";
  if (!powerSyncStore.powerSync) return "Server Unavailable";
  return "Connected";
});

const connectionStatusSeverity = computed(() => {
  if (!isOnline.value) return "danger";
  if (!powerSyncStore.isInitialized) return "warning";
  if (!powerSyncStore.powerSync) return "warning";
  return "success";
});

const locations = computed(() => locationsStore.locations);
const selectedLocation = computed(() => locationsStore.selectedLocation);
const selectedLocationId = computed(() => locationsStore.selectedLocationId);

const filteredLocations = computed(() => {
  if (!searchQuery.value) return locations.value;
  return locations.value.filter((location) =>
    location.name.toLowerCase().includes(searchQuery.value.toLowerCase()),
  );
});

// Methods
const startPollingLLMState = () => {
  const pollInterval = setInterval(() => {
    localModelState.value = localLLMService.getState();
    if (!localModelState.value.isLoading) {
      clearInterval(pollInterval);
    }
  }, 500);

  // Clean up after 5 minutes
  setTimeout(() => clearInterval(pollInterval), 5 * 60 * 1000);
};

onMounted(() => {
  localModelState.value = localLLMService.getState();
  startPollingLLMState();
  detectDeviceAiCapabilities().then((c) => {
    deviceMessage.value = c.staffMessage;
  });
  refreshCoverage();
});

watch(
  () => selectedLocation.value?.id,
  () => {
    refreshCoverage();
  },
);

// Methods
const refreshData = async () => {
  loading.value = true;
  try {
    await Promise.all([locationsStore.loadLocations(), refreshStorageInfo()]);
  } catch (error) {
    console.error("Error refreshing data:", error);
  } finally {
    loading.value = false;
  }
};

const selectLocation = (locationId: string) => {
  locationsStore.selectLocation(locationId);
};

const goToLocationSettings = (locationId: string) => {
  router.push(`/locations/${locationId}/settings`);
};

const refreshStorageInfo = async () => {
  storageLoading.value = true;
  try {
    storageAnalytics.setPowerSyncStore(powerSyncStore);
    storageSummary.value = await storageAnalytics.getStorageSummary();
  } catch (error) {
    console.error("Error loading storage info:", error);
  } finally {
    storageLoading.value = false;
  }
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

const formatDate = (dateString: string): string => {
  if (!dateString) return "Unknown";
  return new Date(dateString).toLocaleDateString();
};

const confirmDeleteLocation = async (location: any) => {
  const confirmed = confirm(
    `Are you sure you want to delete "${location.name}"?\n\n` +
      `This will permanently delete:\n` +
      `• The cemetery and all its data\n` +
      `• All plots in this cemetery\n` +
      `• All persons associated with those plots\n` +
      `• All images (plot and person images)\n\n` +
      `This action cannot be undone.`,
  );

  if (!confirmed) return;

  await deleteLocation(location.id);
};

const deleteLocation = async (locationId: string) => {
  deletingLocationId.value = locationId;

  try {
    console.log(`🗑️ Starting deletion of location ${locationId}`);
    await locationsStore.deleteLocation(locationId);

    // Show success message
    alert(`Cemetery deleted.`);

    // Refresh the data
    await refreshData();
  } catch (error) {
    console.error("Error deleting location:", error);
    alert(
      `Failed to delete cemetery: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  } finally {
    deletingLocationId.value = null;
  }
};

// Watch for changes in settings store
watch(
  () => settingsStore.mapSettings,
  (newSettings) => {
    mapSettings.value = { ...newSettings };
  },
  { deep: true },
);

// Console logs methods
const clearLogs = () => {
  consoleLogger.clearLogs();
};

const exportLogs = () => {
  const logText = logs.value
    .map((log) => {
      let text = `[${formatLogTime(log.timestamp)}] [${log.level.toUpperCase()}] ${log.message}`;

      // Add error details if present
      if (log.errorDetails) {
        text += "\n  Error Details:";
        if (log.errorDetails.name) {
          text += `\n    Name: ${log.errorDetails.name}`;
        }
        if (log.errorDetails.message) {
          text += `\n    Message: ${log.errorDetails.message}`;
        }
        if (log.errorDetails.fileName || log.errorDetails.lineNumber) {
          text += `\n    Location: ${log.errorDetails.fileName || "unknown"}:${log.errorDetails.lineNumber || "?"}:${log.errorDetails.columnNumber || "?"}`;
        }
        if (log.errorDetails.stack) {
          text += `\n    Stack Trace:\n${log.errorDetails.stack
            .split("\n")
            .map((line) => `      ${line}`)
            .join("\n")}`;
        }
        if (log.errorDetails.cause) {
          text += `\n    Cause: ${formatErrorCause(log.errorDetails.cause)}`;
        }
      }

      return text;
    })
    .join("\n\n");

  const blob = new Blob([logText], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `console-logs-${new Date().toISOString()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const formatLogTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const timeStr = date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const ms = date.getMilliseconds().toString().padStart(3, "0");
  return `${timeStr}.${ms}`;
};

const formatErrorCause = (cause: any): string => {
  if (cause instanceof Error) {
    return `${cause.name}: ${cause.message}${cause.stack ? "\n" + cause.stack : ""}`;
  }
  if (typeof cause === "object") {
    try {
      return JSON.stringify(cause, null, 2);
    } catch {
      return String(cause);
    }
  }
  return String(cause);
};

const scrollToBottom = () => {
  if (logsContainer.value) {
    logsContainer.value.scrollTop = logsContainer.value.scrollHeight;
  }
};

onMounted(async () => {
  await refreshData();

  // Initialize console logger subscription
  logs.value = consoleLogger.getLogs();
  consoleLogger.subscribe((newLogs) => {
    logs.value = newLogs;
    // Auto-scroll to bottom when new logs arrive
    nextTick(() => {
      scrollToBottom();
    });
  });
});
</script>
