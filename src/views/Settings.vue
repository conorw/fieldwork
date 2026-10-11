<template>
  <div class="settings-page h-full overflow-y-auto px-3 py-3 sm:px-4">
    <div class="mb-2 flex items-center justify-between gap-3">
      <h1 class="text-xl font-semibold text-surface-900">Settings</h1>
      <Chip
        v-if="connectionStatus !== 'Connected'"
        :label="connectionStatus"
        :severity="connectionStatusSeverity"
        size="small"
      />
    </div>

    <Accordion>
      <!-- Facility Selection -->
      <AccordionTab>
        <template #header>
          <div class="flex items-center justify-between w-full">
            <span class="text-base">Cemeteries</span>
            <div class="text-sm text-surface-500 mr-2">
              {{ locations.length }}
            </div>
          </div>
        </template>

        <div v-if="loading" class="py-6 text-center">
          <ProgressSpinner />
        </div>

        <p v-else-if="locations.length === 0" class="py-4 text-base text-surface-600">
          No cemeteries yet
        </p>

        <div v-else>
          <InputText
            v-if="locations.length > 5"
            v-model="searchQuery"
            placeholder="Search"
            class="mb-2 w-full"
          />

          <ul class="divide-y divide-surface-200">
            <li
              v-for="location in filteredLocations"
              :key="location.id"
              class="flex items-center gap-1"
            >
              <button
                type="button"
                class="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-left"
                @click="selectLocation(location.id)"
              >
                <i
                  class="pi pi-check w-4 shrink-0 text-primary-600"
                  :class="selectedLocationId === location.id ? 'visible' : 'invisible'"
                  aria-hidden="true"
                ></i>
                <span class="truncate text-base text-surface-900">{{
                  location.name
                }}</span>
              </button>
              <Button
                v-if="
                  location.userRole === 'owner' || location.userRole === 'admin'
                "
                icon="pi pi-cog"
                text
                rounded
                severity="secondary"
                class="icon-hit"
                title="Cemetery settings"
                aria-label="Cemetery settings"
                @click="goToLocationSettings(location.id)"
              />
              <Button
                icon="pi pi-trash"
                text
                rounded
                severity="danger"
                class="icon-hit"
                :loading="deletingLocationId === location.id"
                :disabled="deletingLocationId === location.id"
                title="Delete cemetery"
                aria-label="Delete cemetery"
                @click="confirmDeleteLocation(location)"
              />
            </li>
          </ul>
        </div>
      </AccordionTab>

      <!-- Storage Information -->
      <AccordionTab>
        <template #header>
          <span class="text-base">Storage</span>
        </template>

        <div>
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-2xl font-semibold tabular-nums text-surface-900">
                {{ formatBytes(storageSummary.totalSize) }}
              </p>
              <p v-if="storageQuotaLabel" class="text-sm text-surface-500">
                {{ storageQuotaLabel }}
              </p>
            </div>
            <Button
              icon="pi pi-refresh"
              text
              rounded
              severity="secondary"
              class="icon-hit"
              :loading="storageLoading"
              aria-label="Refresh storage"
              @click="refreshStorageInfo"
            />
          </div>

          <ul class="mt-2 divide-y divide-surface-200">
            <li
              v-for="row in storageRows"
              :key="row.label"
              class="flex items-center justify-between gap-3 py-3"
            >
              <div class="min-w-0">
                <p class="text-base text-surface-900">{{ row.label }}</p>
                <p v-if="row.detail" class="text-sm text-surface-500">
                  {{ row.detail }}
                </p>
              </div>
              <p class="shrink-0 text-base tabular-nums text-surface-900">
                {{ formatBytes(row.size) }}
              </p>
            </li>
          </ul>
        </div>
      </AccordionTab>

      <!-- Analysis Settings -->
      <AccordionTab>
        <template #header>
          <div class="flex items-center justify-between w-full">
            <span class="text-base">Headstone reading</span>
            <Chip
              :label="cemeteryAiLabel"
              :severity="cemeteryAiSeverity"
              size="small"
            />
          </div>
        </template>

        <div class="space-y-3">
          <p class="text-base text-surface-900">{{ cemeteryAiHeadline }}</p>
          <p
            v-if="localModelState.error"
            class="text-sm text-red-700 dark:text-red-300"
          >
            {{ localModelState.error }}
          </p>
          <p v-else-if="deviceMessage" class="text-sm text-surface-500">
            {{ deviceMessage }}
          </p>

          <Button
            v-if="!localModelState.isLoaded"
            label="Download model"
            class="w-full"
            :loading="installingModel || localModelState.isLoading"
            @click="installAdapter"
          />

          <div v-if="coverageMessage" class="space-y-2">
            <p class="text-sm text-surface-600">{{ coverageMessage }}</p>
            <Button
              label="Help improve reading"
              text
              class="link-btn"
              @click="goTeach"
            />
          </div>

          <Button
            v-if="showDevTools"
            label="Vision eval"
            text
            severity="secondary"
            class="link-btn"
            @click="router.push('/dev/vision-eval')"
          />
        </div>
      </AccordionTab>

      <!-- Console Logs -->
      <AccordionTab>
        <template #header>
          <div class="flex items-center justify-between w-full">
            <span class="text-base">Console logs</span>
            <div class="text-sm text-surface-500">
              {{ filteredLogs.length }} logs
            </div>
          </div>
        </template>

        <div class="space-y-3">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div class="flex gap-2">
              <Button
                label="Clear"
                icon="pi pi-trash"
                severity="secondary"
                outlined
                @click="clearLogs"
              />
              <Button
                label="Export"
                icon="pi pi-download"
                severity="secondary"
                outlined
                @click="exportLogs"
              />
            </div>
            <Dropdown
              v-model="logLevelFilter"
              :options="logLevelOptions"
              placeholder="All levels"
              class="w-full sm:ml-auto sm:w-40"
            />
          </div>

          <div
            ref="logsContainer"
            class="max-h-[40vh] overflow-auto rounded-lg bg-surface-900 p-3 font-mono text-xs text-surface-100"
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

const showDevTools = import.meta.env.DEV;

const cemeteryAiHeadline = computed(() => {
  if (localModelState.value.isLoaded) return "On-device reading is ready";
  if (localModelState.value.isLoading) {
    return `Downloading… ${localModelState.value.loadProgress.toFixed(0)}%`;
  }
  const s = selectedLocation.value?.aiStatus || "teacher";
  if (s === "training") return "Improving the shared model";
  if (s === "error") {
    return (
      selectedLocation.value?.aiTrainError ||
      "Shared-model training needs attention"
    );
  }
  return "On-device reading downloads in the background";
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
    coverageMessage.value = status.ready ? "" : status.message;
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
  quota: 0,
  totalItems: 0,
  breakdown: {
    cache: { size: 0, items: 0 },
    database: { size: 0, items: 0 },
    assets: { size: 0, items: 0 },
    tiles: { size: 0, items: 0 },
    images: { size: 0, items: 0 },
    models: { size: 0, items: 0, copies: 0 },
    other: { size: 0, items: 0 },
  },
  items: [],
});

const storageQuotaLabel = computed(() => {
  const quota = storageSummary.value.quota;
  if (!quota) return "";
  return `of ${formatBytes(quota)}`;
});

const storageRows = computed(() => {
  const breakdown = storageSummary.value.breakdown;
  const modelCopies = breakdown.models.copies;
  const rows = [
    {
      label: "AI model",
      size: breakdown.models.size,
      detail:
        breakdown.models.size === 0
          ? "Not downloaded"
          : modelCopies > 1
            ? `${modelCopies} versions`
            : "",
    },
    {
      label: "Map tiles",
      size: breakdown.tiles.size,
      detail: "",
    },
    {
      label: "Photos",
      size: breakdown.images.size,
      detail: "",
    },
    {
      label: "App data",
      size: breakdown.database.size,
      detail: "",
    },
  ];
  if (breakdown.cache.size > 0) {
    rows.push({
      label: "Other files",
      size: breakdown.cache.size,
      detail: "",
    });
  }
  return rows;
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

<style scoped>
.settings-page :deep(.p-accordionheader) {
  min-height: 3.25rem;
  font-size: 1rem;
}

.settings-page :deep(.p-accordioncontent-content) {
  padding-top: 0.25rem;
  padding-right: 0.25rem;
  padding-bottom: 0.75rem;
  padding-left: 0.25rem;
}

.settings-page :deep(.icon-hit.p-button) {
  width: 2.75rem;
  height: 2.75rem;
  padding: 0;
}

.settings-page :deep(.link-btn.p-button) {
  justify-content: flex-start;
  min-height: 2.75rem;
  padding-right: 0;
  padding-left: 0;
}

.settings-page :deep(.p-button.w-full) {
  min-height: 2.75rem;
}
</style>
