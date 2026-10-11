<template>
  <div v-if="visible" class="fixed inset-0 z-[4000]" role="presentation">
    <button
      type="button"
      class="absolute inset-0 bg-black/40"
      aria-label="Close cemetery assistant"
      @click="close"
    ></button>
    <aside
      class="absolute inset-y-0 right-0 z-10 flex w-full max-w-md flex-col bg-surface-0 text-surface-900 shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-label="Cemetery assistant"
      @click.stop
    >
      <header
        class="flex shrink-0 items-center justify-between border-b border-surface-200 px-4 py-3"
      >
        <h2 class="text-base font-semibold">Cemetery assistant</h2>
        <button
          type="button"
          class="flex h-10 w-10 items-center justify-center rounded-full text-surface-700 hover:bg-surface-100"
          aria-label="Close cemetery assistant"
          @click="close"
        >
          <i class="pi pi-times" aria-hidden="true"></i>
        </button>
      </header>
      <div class="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <p
        v-if="availability.state === 'unavailable'"
        class="m-0 rounded-lg bg-surface-100 px-3 py-2 text-sm text-surface-800"
        role="status"
      >
        {{ availability.reason }}
      </p>
      <p
        v-else-if="availability.state === 'downloadable' && !downloading"
        class="m-0 text-sm text-surface-700"
      >
        The on-device model downloads the first time you ask a question.
      </p>
      <p
        v-if="downloading"
        class="m-0 text-sm text-surface-700"
        role="status"
      >
        Downloading the on-device model… {{ downloadProgress }}%
      </p>

      <div
        class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto"
        aria-live="polite"
      >
        <div
          v-if="messages.length === 0 && availability.state !== 'unavailable'"
          class="flex flex-col gap-2"
        >
          <p class="m-0 text-sm text-surface-700">
            Choose an action, or ask in your own words.
          </p>
          <div class="flex flex-wrap gap-2" role="group" aria-label="Assistant actions">
            <button
              v-for="action in actions"
              :key="action.tool"
              type="button"
              class="rounded-full border border-surface-400 bg-surface-200 px-3 py-1.5 text-left text-sm text-surface-900 hover:bg-surface-300 disabled:opacity-40"
              :disabled="inputDisabled"
              @click="useAction(action)"
            >
              {{ action.label }}
            </button>
          </div>
        </div>
        <template v-for="message in messages" :key="message.id">
          <div
            v-if="message.role === 'user'"
            class="ml-8 whitespace-pre-line rounded-xl bg-primary-700 px-3 py-2 text-sm text-white"
          >
            {{ message.text }}
          </div>
          <div
            v-else-if="message.role === 'error'"
            class="mr-8 whitespace-pre-line rounded-xl bg-red-100 px-3 py-2 text-sm text-red-900 dark:bg-red-950 dark:text-red-100"
          >
            {{ message.text }}
          </div>
          <div
            v-else-if="message.view"
            class="mr-2 overflow-hidden rounded-xl bg-surface-200 text-sm text-surface-900"
          >
            <p class="m-0 px-3 pt-2.5 font-medium">{{ message.view.title }}</p>
            <table
              v-if="message.view.rows?.length"
              class="mt-1 w-full border-collapse"
            >
              <thead>
                <tr>
                  <th
                    v-for="column in message.view.columns"
                    :key="column"
                    class="px-3 py-1 text-left text-[11px] font-medium uppercase tracking-wide text-surface-600"
                  >
                    {{ column }}
                  </th>
                  <th
                    v-if="message.view.rows?.some((row) => row.plotId)"
                    class="px-3 py-1 text-right text-[11px] font-medium uppercase tracking-wide text-surface-600"
                  >
                    Open
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(row, rowIndex) in message.view.rows"
                  :key="row.plotId || rowIndex"
                  class="border-t border-surface-300"
                >
                  <td
                    v-for="(cell, cellIndex) in row.cells"
                    :key="cellIndex"
                    class="px-3 py-1.5"
                  >
                    {{ cell }}
                  </td>
                  <td v-if="row.plotId" class="px-3 py-1.5 text-right">
                    <span class="inline-flex gap-2">
                      <button
                        type="button"
                        class="font-medium text-surface-900 underline"
                        @click="openPlotOnMap(row.plotId)"
                      >
                        Map
                      </button>
                      <button
                        type="button"
                        class="font-medium text-surface-900 underline"
                        @click="openPlotDetails(row.plotId)"
                      >
                        Details
                      </button>
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
            <ul v-if="message.view.cards?.length" class="m-0 list-none p-0">
              <li
                v-for="(card, cardIndex) in message.view.cards"
                :key="cardIndex"
                class="border-t border-surface-300 px-3 py-2"
              >
                <p class="m-0 font-medium">{{ card.title }}</p>
                <dl
                  v-if="card.fields.length"
                  class="mt-1 grid grid-cols-2 gap-x-3 gap-y-1"
                >
                  <div v-for="field in card.fields" :key="field.label">
                    <dt class="text-[11px] uppercase tracking-wide text-surface-600">
                      {{ field.label }}
                    </dt>
                    <dd class="m-0">{{ field.value }}</dd>
                  </div>
                </dl>
                <p v-if="card.note" class="m-0 mt-1 text-xs text-surface-600">
                  {{ card.note }}
                </p>
                <p v-if="card.plotId" class="m-0 mt-1 flex gap-3 text-xs">
                  <button
                    type="button"
                    class="font-medium text-surface-900 underline"
                    @click="openPlotOnMap(card.plotId)"
                  >
                    Map
                  </button>
                  <button
                    type="button"
                    class="font-medium text-surface-900 underline"
                    @click="openPlotDetails(card.plotId)"
                  >
                    Details
                  </button>
                </p>
              </li>
            </ul>
            <p
              v-if="message.view.note"
              class="m-0 px-3 py-2 text-xs text-surface-600"
            >
              {{ message.view.note }}
            </p>
            <div v-else class="h-2"></div>
          </div>
          <div
            v-else
            class="mr-8 whitespace-pre-line rounded-xl bg-surface-200 px-3 py-2 text-sm text-surface-900"
          >
            {{ message.text }}
          </div>
        </template>
        <p v-if="activity" class="m-0 text-xs text-surface-600" role="status">
          {{ activity }}
        </p>
      </div>

      <p v-if="listening" class="m-0 text-xs text-surface-600" role="status">
        Listening…
      </p>
      <form class="flex items-end gap-2" @submit.prevent="send">
        <Textarea
          ref="draftInput"
          v-model="draft"
          rows="2"
          auto-resize
          class="flex-1"
          placeholder="Ask about this cemetery"
          aria-label="Message the cemetery assistant"
          :disabled="inputDisabled"
          @keydown.enter.exact.prevent="send"
        />
        <button
          type="button"
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
          :class="
            listening
              ? 'bg-red-600 text-white'
              : 'text-surface-700 hover:bg-surface-200'
          "
          :aria-pressed="listening"
          :aria-label="listening ? 'Stop dictating' : 'Dictate a message'"
          :title="
            speechSupported
              ? listening
                ? 'Stop dictating'
                : 'Dictate a message'
              : 'Speech input needs Chrome'
          "
          :disabled="inputDisabled || !speechSupported"
          @click="toggleMic"
        >
          <i
            :class="listening ? 'pi pi-stop' : 'pi pi-microphone'"
            aria-hidden="true"
          ></i>
        </button>
        <Button
          type="submit"
          icon="pi pi-send"
          label="Send"
          :disabled="inputDisabled || !draft.trim()"
          :loading="busy"
        />
      </form>
      </div>
    </aside>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import Button from "primevue/button";
import Textarea from "primevue/textarea";
import { useLocationsStore } from "../stores/locations";
import { useMapStore } from "../stores/map";
import { usePowerSyncStore } from "../stores/powersync";
import {
  askCemeteryAssistant,
  prepareCemeteryAssistant,
  resetCemeteryAssistant,
} from "../services/localAgentService";

const props = defineProps({
  visible: { type: Boolean, default: false },
});
const emit = defineEmits(["update:visible"]);
const router = useRouter();
const locationsStore = useLocationsStore();
const mapStore = useMapStore();
const powerSyncStore = usePowerSyncStore();
const draftInput = ref(null);

function plotPhrase(plot) {
  if (!plot) return "";
  const place = [plot.section, plot.row, plot.number].filter(Boolean).join(" ");
  return place ? `plot ${place} (id ${plot.id})` : `plot id ${plot.id}`;
}

const actions = computed(() => {
  const phrase = plotPhrase(mapStore.selectedPlot);
  return [
    {
      tool: "get_selected_cemetery",
      label: "This cemetery",
      prompt: "Which cemetery is open?",
    },
    {
      tool: "list_plots",
      label: "List plots",
      prompt: "List the plots in this cemetery.",
    },
    {
      tool: "search_people",
      label: "Find a person",
      prompt: "Search for people named ",
      draft: true,
    },
    {
      tool: "get_plot",
      label: "Plot details",
      prompt: phrase
        ? `Show the details of ${phrase}.`
        : "Show the details of plot ",
      draft: !phrase,
    },
    {
      tool: "focus_cemetery",
      label: "Center on me",
      prompt: "Center the map on my GPS position.",
    },
    {
      tool: "focus_plot",
      label: "Show on map",
      prompt: phrase ? `Zoom the map to ${phrase}.` : "Zoom the map to plot ",
      draft: !phrase,
    },
    {
      tool: "update_plot",
      label: "Update a plot",
      prompt: phrase
        ? `Update the notes on ${phrase} to say `
        : "Update the notes on plot ",
      draft: true,
    },
    {
      tool: "add_person",
      label: "Add a person",
      prompt: phrase
        ? `Add a person to ${phrase} named `
        : "Add a person named ",
      draft: true,
    },
    {
      tool: "create_plot_at_gps",
      label: "Plot at GPS",
      prompt: "Create a single grave at my GPS position.",
    },
    {
      tool: "begin_plot_drawing",
      label: "Draw a plot",
      prompt: "Turn on drawing so I can outline a plot.",
    },
    {
      tool: "read_headstone",
      label: "Read headstone",
      prompt: phrase
        ? `Read the headstone on ${phrase}.`
        : "Read the headstone on plot ",
      draft: !phrase,
    },
  ];
});

const availability = ref({ state: "ready", reason: "" });
const messages = ref([]);
const draft = ref("");
const busy = ref(false);
const activity = ref("");
const downloading = ref(false);
const downloadProgress = ref(0);
const listening = ref(false);
const speechSupported = ref(false);
let messageId = 0;
let recognition = null;
let draftBeforeSpeech = "";

function recognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

speechSupported.value = Boolean(recognitionCtor());

function stopListening() {
  recognition?.stop();
  recognition = null;
  listening.value = false;
}

function toggleMic() {
  if (listening.value) {
    stopListening();
    return;
  }
  const Ctor = recognitionCtor();
  if (!Ctor || inputDisabled.value) return;

  const session = new Ctor();
  session.lang = navigator.language || "en-GB";
  session.interimResults = true;
  session.continuous = false;
  draftBeforeSpeech = draft.value.trim();

  session.onresult = (event) => {
    let said = "";
    for (let i = 0; i < event.results.length; i += 1) {
      said += event.results[i][0].transcript;
    }
    const spoken = said.trim();
    draft.value = draftBeforeSpeech
      ? `${draftBeforeSpeech} ${spoken}`.trim()
      : spoken;
  };
  session.onerror = (event) => {
    listening.value = false;
    if (event.error === "aborted" || event.error === "no-speech") return;
    const text =
      event.error === "not-allowed" || event.error === "service-not-allowed"
        ? "Allow the microphone to dictate a question."
        : "Could not hear that. Try the microphone again.";
    messages.value.push({ id: ++messageId, role: "error", text });
  };
  session.onend = () => {
    listening.value = false;
    recognition = null;
  };

  recognition = session;
  listening.value = true;
  try {
    session.start();
  } catch {
    stopListening();
    messages.value.push({
      id: ++messageId,
      role: "error",
      text: "Could not start the microphone.",
    });
  }
}

const inputDisabled = computed(
  () => busy.value || availability.value.state === "unavailable",
);

function close() {
  emit("update:visible", false);
}

async function loadPlotRecord(plotId) {
  const db = powerSyncStore.powerSync;
  if (!db?.get) return null;
  try {
    return await db.get("SELECT * FROM plots WHERE id = ?", [plotId]);
  } catch {
    return null;
  }
}

async function openPlotDetails(plotId) {
  close();
  await router.push(`/plots/${plotId}`);
}

async function openPlotOnMap(plotId) {
  close();
  if (router.currentRoute.value.path !== "/") {
    await router.push("/");
  }
  const plot = await loadPlotRecord(plotId);
  if (!plot?.geometry) return;
  const started = Date.now();
  while (!mapStore.map && Date.now() - started < 4000) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!mapStore.map) return;
  await mapStore.zoomToPlot(plot);
}

function onKeydown(event) {
  if (event.key === "Escape" && props.visible) close();
}

let availabilityTimer = 0;

watch(
  () => props.visible,
  (open) => {
    window.clearTimeout(availabilityTimer);
    if (!open) {
      stopListening();
      return;
    }
    // The panel is already in the DOM. Check the on-device model after
    // paint so a slow availability call cannot hold the sidebar closed.
    availabilityTimer = window.setTimeout(() => {
      if (!props.visible) return;
      prepareCemeteryAssistant().then((status) => {
        if (!props.visible) return;
        availability.value = {
          state: status.state,
          reason: status.reason || "",
        };
      });
    }, 0);
  },
);

watch(
  () => locationsStore.selectedLocation?.id ?? null,
  () => {
    resetCemeteryAssistant();
  },
);

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => {
  window.clearTimeout(availabilityTimer);
  window.removeEventListener("keydown", onKeydown);
  stopListening();
});

async function useAction(action) {
  if (inputDisabled.value) return;
  draft.value = action.prompt;
  if (action.draft) {
    stopListening();
    await nextTick();
    const field = draftInput.value?.$el;
    field?.focus?.();
    if (field && typeof field.setSelectionRange === "function") {
      const cursor = action.prompt.indexOf("named ") === -1
        ? field.value.length
        : action.prompt.indexOf("named ") + "named ".length;
      field.setSelectionRange(cursor, cursor);
    }
    return;
  }
  await send();
}

const send = async () => {
  stopListening();
  const text = draft.value.trim();
  if (!text || inputDisabled.value) return;
  draft.value = "";
  messages.value.push({ id: ++messageId, role: "user", text });
  busy.value = true;
  activity.value = "";
  try {
    const answer = await askCemeteryAssistant(text, {
      onTool(name) {
        activity.value = `Using ${name}…`;
      },
      onDownload(progress) {
        downloading.value = true;
        downloadProgress.value = progress;
        if (progress >= 100) downloading.value = false;
      },
    });
    messages.value.push({
      id: ++messageId,
      role: "assistant",
      text: answer.text,
      view: answer.view,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The assistant failed.";
    if (message.includes("unavailable")) {
      availability.value = { state: "unavailable", reason: message };
    }
    messages.value.push({ id: ++messageId, role: "error", text: message });
  } finally {
    busy.value = false;
    activity.value = "";
  }
};
</script>
