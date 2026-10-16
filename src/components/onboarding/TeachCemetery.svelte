<script lang="ts">
import Button from "$lib/ui/Button.svelte";
import Message from "$lib/ui/Message.svelte";

import { computed, onMounted, ref, watch } from "vue";
import { useOnline } from "@vueuse/core";
import HeadstoneConfirmCard from "@/components/headstone/HeadstoneConfirmCard.svelte";
import { headstoneAnalysisService } from "@/utils/headstoneAnalysisService";
import {
  countTrainingExamples,
  saveReviewedTrainingExample,
} from "@/utils/headstoneTrainingService";
import { evaluateTrainingCoverage } from "@/utils/trainingCoverage";
import { hasGlobalAdapterCached } from "@/services/globalAdapterService";
import { maybeAutoStartTraining } from "@/services/autoTrainService";
import { useLocationsStore } from "@/stores/locations";
import type { PersonData } from "@/stores/persons";
import type {
  HeadstonePhysicalAttrs,
  HeadstoneReasoningTarget,
  StoneType,
} from "@/types/headstoneTraining";
import { emptyPhysicalAttrs } from "@/types/headstoneTraining";

const props = $props<{ locationId: string }>();
function emit(event: string, ...args: any[]) {
  const name = "on" + String(event).split(/[:-]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
  const handler = typeof props === "undefined" ? undefined : (props as any)[name];
  if (typeof handler === "function") handler(...args);
}

const locationsStore = useLocationsStore();
const isOnline = useOnline();
const fileInput = ref<HTMLInputElement | null>(null);
const analyzing = ref(false);
const saving = ref(false);
const preview = ref<string | null>(null);
const imageUrl = ref("");
const coverage = ref(
  evaluateTrainingCoverage({
    total: 0,
    byStoneType: {},
    hasGlobalAdapter: false,
  }),
);

const pendingConfirm = ref<{
  persons: PersonData[];
  transcription: string;
  epitaph: string;
  physical: HeadstonePhysicalAttrs;
} | null>(null);

const lastReviewMessage = ref("");
const lastReviewWasCorrection = ref(false);

async function refreshCoverage() {
  const hasGlobal = await hasGlobalAdapterCached();
  const counts = await countTrainingExamples(props.locationId);
  coverage.value = evaluateTrainingCoverage({
    total: counts.total,
    byStoneType: counts.byStoneType,
    hasGlobalAdapter: hasGlobal,
  });
}

onMounted(() => {
  refreshCoverage();
});

watch(
  () => props.locationId,
  () => refreshCoverage(),
);

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (preview.value) URL.revokeObjectURL(preview.value);
  preview.value = URL.createObjectURL(file);
  analyzing.value = true;
  pendingConfirm.value = null;
  try {
    // Store a blob URL for teaching; plot upload path may replace with Blob URL later
    imageUrl.value = preview.value;
    const result = await headstoneAnalysisService.analyzeHeadstoneImage(
      file,
      `teach-${Date.now()}`,
    );
    // Prefer uploaded URL from analysis path if available; else keep object URL
    // Teaching examples need a durable URL — upload via existing image pipeline if present
    const uploaded = await uploadTeachImage(file);
    if (uploaded) imageUrl.value = uploaded;

    pendingConfirm.value = {
      persons: result.persons || [],
      transcription: result.full_text_transcription || "",
      epitaph: result.shared_epitaph || "",
      physical: result.physical || emptyPhysicalAttrs(),
    };
  } catch (err) {
    console.error(err);
    pendingConfirm.value = {
      persons: [],
      transcription: "",
      epitaph: "",
      physical: emptyPhysicalAttrs(),
    };
  } finally {
    analyzing.value = false;
    input.value = "";
  }
}

async function uploadTeachImage(file: File): Promise<string | null> {
  try {
    const { imageProcessingService } = await import(
      "@/utils/imageProcessingService"
    );
    const res = await imageProcessingService.uploadImage(file, {
      locationId: props.locationId,
      teach: true,
    });
    return res?.url || null;
  } catch (e) {
    console.warn("Teach upload failed, using data URL fallback", e);
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function clearPending() {
  pendingConfirm.value = null;
}

async function onConfirmed(payload: {
  stoneType: StoneType;
  target: HeadstoneReasoningTarget;
  wasCorrected?: boolean;
}) {
  saving.value = true;
  try {
    await saveReviewedTrainingExample({
      locationId: props.locationId,
      imageUrl: imageUrl.value,
      stoneType: payload.stoneType,
      target: payload.target,
      wasCorrected: !!payload.wasCorrected,
    });
    pendingConfirm.value = null;
    lastReviewWasCorrection.value = !!payload.wasCorrected;
    lastReviewMessage.value = payload.wasCorrected
      ? "Correction saved — this cemetery and the shared model will learn from your fix."
      : "Confirmed — this stone helps teach this cemetery and improve reading elsewhere.";
    await refreshCoverage();
    if (coverage.value.ready) {
      const loc = locationsStore.locations.find((l) => l.id === props.locationId);
      if (loc) await maybeAutoStartTraining(loc);
    }
  } finally {
    saving.value = false;
  }
}

async function finish() {
  const loc = locationsStore.locations.find((l) => l.id === props.locationId);
  if (loc) await maybeAutoStartTraining(loc);
  emit("done");
}

const progressLabel = computed(() => coverage.value.message);
void progressLabel;
</script>

<div class="space-y-6"><div><h3 class="text-xl font-semibold mb-1">Help improve reading</h3><p class="text-sm text-surface-600"> Optional. Photograph a few real stones and check the names. Plot photos you already take are sampled in the background — this just gives clearer labels. You can skip and add plots right away. </p><p class="text-sm mt-2 font-medium">{coverage.value.message}</p></div>{#if !isOnline.value}<Message severity="info" closable={false}> You need a connection for extra teaching photos. Plot photos are still sampled in the background, and on-device reading works without teaching. </Message>{:else}<Message severity="info" closable={false}> Use Wi‑Fi if you can — the first offline model download is large. </Message>{/if}<div class="space-y-2"><p class="text-sm font-medium">Suggested kinds (any order)</p><ul class="text-sm text-surface-600 list-disc pl-5"><li>One person</li><li>Couple</li><li>Family</li><li>Weathered or hard to read</li></ul></div>{#if !pendingConfirm.value}<div class="space-y-3"><input class="hidden" bind:this={fileInput.value} type="file" accept="image/*" capture="environment" onchange={onFile} /><Button class="w-full" label="Take or choose a photo" icon="pi pi-camera" loading={analyzing.value} disabled={!isOnline.value} onclick={(event) => {  fileInput.value?.click() }}></Button>{#if preview.value}<div class="rounded overflow-hidden max-h-64"><img class="max-h-64 object-contain w-full" src={preview.value} alt="Stone preview" /></div>{/if}</div>{/if}{#if pendingConfirm.value}<HeadstoneConfirmCard persons={pendingConfirm.value.persons} transcription={pendingConfirm.value.transcription} epitaph={pendingConfirm.value.epitaph} physical={pendingConfirm.value.physical} saving={saving.value} allow-skip onConfirmed={onConfirmed} onSkip={clearPending}></HeadstoneConfirmCard>{/if}{#if lastReviewMessage.value}<Message class="mt-2" severity={lastReviewWasCorrection.value ? 'warn' : 'success'} closable={false} data-testid="teach-review-message">{lastReviewMessage.value}</Message>{/if}<div class="flex flex-col sm:flex-row gap-2">{#if coverage.value.ready}<Button class="flex-1" label="Done" onclick={finish}></Button>{/if}<Button class="flex-1" label="Finish later" severity="secondary" outlined onclick={(event) => {  emit('later') }}></Button></div></div>
