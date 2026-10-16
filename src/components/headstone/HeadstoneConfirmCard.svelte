<script lang="ts">
import { cls } from "$lib/ui/cls";
import Button from "$lib/ui/Button.svelte";
import Dropdown from "$lib/ui/Select.svelte";
import InputText from "$lib/ui/InputText.svelte";
import Message from "$lib/ui/Message.svelte";
import Textarea from "$lib/ui/Textarea.svelte";

import { computed, ref, watch } from "vue";
import type { PersonData } from "@/stores/persons";
import type {
  HeadstonePhysicalAttrs,
  HeadstoneReasoningTarget,
  StaffStoneKind,
  StoneType,
} from "@/types/headstoneTraining";
import {
  emptyPhysicalAttrs,
  MONUMENT_FORM_LABELS,
  MONUMENT_FORMS,
  normalizePhysicalAttrs,
  STAFF_STONE_KIND_LABELS,
  STONE_CONDITION_LABELS,
  STONE_CONDITIONS,
  STONE_MATERIAL_LABELS,
  STONE_MATERIALS,
} from "@/types/headstoneTraining";
import {
  inferStaffStoneKind,
  personDataToConfirmInputs,
  personsToReasoningTarget,
  staffKindToStoneType,
  type ConfirmPersonInput,
} from "@/utils/reasoningMapper";

const props = $props<{
  persons: PersonData[];
  transcription?: string;
  epitaph?: string;
  physical?: HeadstonePhysicalAttrs | null;
  allowSkip?: boolean;
  saving?: boolean;
  [key: string]: unknown;
}>();

function prop(camel: string, fallback?: unknown) {
  const kebab = camel.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  return props[camel] ?? props[kebab] ?? fallback;
}

function emit(event: string, ...args: any[]) {
  const name = "on" + String(event).split(/[:-]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
  const handler = typeof props === "undefined" ? undefined : (props as any)[name];
  if (typeof handler === "function") handler(...args);
}

const allowSkip = $derived(!!prop("allowSkip", false));
const saving = $derived(!!prop("saving", false));

const kindLabels = STAFF_STONE_KIND_LABELS;
const materialOptions = STONE_MATERIALS.map((value) => ({
  value,
  label: STONE_MATERIAL_LABELS[value],
}));
const formOptions = MONUMENT_FORMS.map((value) => ({
  value,
  label: MONUMENT_FORM_LABELS[value],
}));
const conditionOptions = STONE_CONDITIONS.map((value) => ({
  value,
  label: STONE_CONDITION_LABELS[value],
}));

const people = ref<ConfirmPersonInput[]>([]);
const stoneKind = ref<StaffStoneKind>("one_person");
const epitaph = ref("");
const transcriptionText = ref("");
const physical = ref<HeadstonePhysicalAttrs>(emptyPhysicalAttrs());
const baseline = ref("");
const correctionMode = ref(false);
const decision = ref<"correct" | null>(null);
const userEdited = ref(false);
const originalPrediction = ref<HeadstoneReasoningTarget | null>(null);

function snapshotPeople(list: ConfirmPersonInput[]) {
  return JSON.stringify({
    people: list.map((p) => ({
      full_name: (p.full_name || "").trim(),
      date_of_birth: (p.date_of_birth || "").trim(),
      date_of_death: (p.date_of_death || "").trim(),
      relationships: p.relationships || [],
      occupation: (p.occupation || "").trim(),
    })),
    epitaph: epitaph.value.trim(),
    transcription: transcriptionText.value.trim(),
    physical: physical.value,
  });
}

watch(
  () =>
    [prop("persons"), prop("transcription"), prop("epitaph"), prop("physical")] as const,
  ([persons, transcription, sharedEpitaph, phys]) => {
    people.value =
      persons && persons.length > 0
        ? personDataToConfirmInputs(persons)
        : [{ full_name: "", date_of_birth: "", date_of_death: "" }];
    transcriptionText.value = transcription || "";
    epitaph.value =
      sharedEpitaph ||
      inferEpitaphFromTranscription(transcription || "") ||
      "";
    physical.value = normalizePhysicalAttrs(phys || undefined);
    stoneKind.value = inferStaffStoneKind(people.value.length);
    baseline.value = snapshotPeople(people.value);
    correctionMode.value = false;
    decision.value = null;
    userEdited.value = false;
    originalPrediction.value = personsToReasoningTarget(people.value, {
      stoneKind: stoneKind.value,
      epitaph: epitaph.value,
      notes: transcriptionText.value,
      physical: physical.value,
      evidenceFallback: transcriptionText.value || "Model prediction",
    });
  },
  { immediate: true, deep: true },
);

/** Pull common memorial lines when API didn't return shared_epitaph */
function inferEpitaphFromTranscription(text: string): string {
  if (!text.trim()) return "";
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const memorial =
    /^(with love|we remember|always|in loving|rest in|gone but|forever|missed|remembered|together|at rest)/i;
  const hits = lines.filter((l) => memorial.test(l) && l.length < 80);
  return hits.slice(0, 4).join(" · ");
}

const canConfirm = computed(() =>
  people.value.some((p) => (p.full_name || "").trim().length > 0),
);

function markEdited() {
  if (snapshotPeople(people.value) !== baseline.value) {
    userEdited.value = true;
  }
}

function onKindChange(kind: StaffStoneKind) {
  if (kind !== stoneKind.value) {
    stoneKind.value = kind;
    userEdited.value = true;
  }
}

function addPerson() {
  people.value.push({ full_name: "", date_of_birth: "", date_of_death: "" });
  userEdited.value = true;
}

function removePerson(index: number) {
  people.value.splice(index, 1);
  userEdited.value = true;
}

function enterCorrectionMode() {
  correctionMode.value = true;
  decision.value = null;
}

function acceptAsCorrect() {
  decision.value = "correct";
  correctionMode.value = false;
  // If they already edited, treat as correction
  confirm();
}

function confirm() {
  const filtered = people.value.filter((p) => (p.full_name || "").trim());
  const wasCorrected =
    correctionMode.value ||
    userEdited.value ||
    snapshotPeople(filtered) !== baseline.value;

  const target = personsToReasoningTarget(filtered, {
    stoneKind: stoneKind.value,
    epitaph: epitaph.value.trim(),
    notes: transcriptionText.value.trim(),
    physical: physical.value,
    evidenceFallback: wasCorrected
      ? "Staff correction"
      : transcriptionText.value.trim() || "Staff confirmed",
  });

  target.review = {
    was_corrected: wasCorrected,
    source: wasCorrected ? "correction" : "confirm",
    prediction: originalPrediction.value || undefined,
  };

  emit("confirmed", {
    stoneType: staffKindToStoneType(stoneKind.value),
    stoneKind: stoneKind.value,
    target,
    persons: filtered,
    wasCorrected,
    epitaph: epitaph.value.trim(),
    transcription: transcriptionText.value.trim(),
    physical: normalizePhysicalAttrs(physical.value),
  });
}
</script>

<div class="space-y-4" data-testid="headstone-confirm-card"><div class="p-3 rounded-lg border {cls(
        correctionMode.value
          ? 'border-amber-300 bg-amber-50'
          : 'border-surface-200 bg-surface-50'
      )}"><p class="text-sm font-medium mb-1">{correctionMode.value
            ? "Fix what the app got wrong"
            : "Check the names"}</p><p class="text-xs text-surface-600">{#if correctionMode.value} Your corrections teach <strong>this cemetery</strong> and improve reading for <strong>other cemeteries</strong> (weights only — never your photos). {:else} Confirm names if you can. You can also skip — plot photos still help improve reading in the background. {/if}</p></div>{#if correctionMode.value}<Message severity="warn" closable={false} data-testid="correction-banner"> Marked as incorrect — edit names and dates below, then save your correction. </Message>{/if}{#if !decision.value && !correctionMode.value}<div class="flex flex-col sm:flex-row gap-2"><Button class="flex-1" label="Looks correct" icon="pi pi-check" data-testid="btn-looks-correct" loading={saving} disabled={!canConfirm.value || saving} onclick={acceptAsCorrect}></Button><Button class="flex-1" label="Something's wrong" icon="pi pi-pencil" severity="warn" outlined data-testid="btn-something-wrong" disabled={saving} onclick={enterCorrectionMode}></Button></div>{/if}<div class="space-y-2"><label class="text-sm font-medium">What kind of stone?</label><div class="grid grid-cols-2 gap-2">{#each kindLabels as label, kind (kind)}<Button label={label} size="small" severity={stoneKind.value === kind ? undefined : 'secondary'} outlined={stoneKind.value !== kind} data-testid={`kind-${kind}`} onclick={(event) => {  onKindChange(kind as StaffStoneKind) }}></Button>{/each}</div></div><div class="p-3 border rounded-lg space-y-3 border-surface-200" data-testid="physical-attrs"><p class="text-sm font-medium">Monument</p><div class="grid grid-cols-1 sm:grid-cols-3 gap-2"><div class="space-y-1"><label class="text-xs text-surface-600">Material</label><Dropdown class="w-full" bind:value={physical.value.material} options={materialOptions} optionLabel="label" optionValue="value" data-testid="physical-material" onChange={markEdited}></Dropdown></div><div class="space-y-1"><label class="text-xs text-surface-600">Type / form</label><Dropdown class="w-full" bind:value={physical.value.form} options={formOptions} optionLabel="label" optionValue="value" data-testid="physical-form" onChange={markEdited}></Dropdown></div><div class="space-y-1"><label class="text-xs text-surface-600">Condition</label><Dropdown class="w-full" bind:value={physical.value.condition} options={conditionOptions} optionLabel="label" optionValue="value" data-testid="physical-condition" onChange={markEdited}></Dropdown></div></div><InputText class="w-full" bind:value={physical.value.detail} placeholder="Detail (e.g. polished dark grey, fresh soil)" data-testid="physical-detail" onUpdateModelValue={markEdited}></InputText></div>{#each people.value as person, index (index)}<div class="p-3 border rounded-lg space-y-2 {cls(correctionMode.value ? 'border-amber-200' : 'border-surface-200')}" data-testid={`person-row-${index}`}><div class="flex justify-between items-center"><span class="text-sm font-medium">Person {index + 1}</span>{#if people.value.length > 1}<Button icon="pi pi-trash" text rounded severity="danger" size="small" onclick={(event) => {  removePerson(index) }}></Button>{/if}</div><InputText class="w-full" bind:value={person.full_name} placeholder="Full name" data-testid={`person-name-${index}`} onUpdateModelValue={markEdited}></InputText><InputText class="w-full" model-value={(person.relationships || []).join(', ')} placeholder="Relationship (e.g. dear husband, wife and mother)" data-testid={`person-rel-${index}`} onUpdateModelValue={(event) => {  
          (v) => {
            person.relationships = String(v || '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            markEdited();
          }
         }}></InputText><InputText class="w-full" bind:value={person.occupation} placeholder="Occupation / regiment (if any)" data-testid={`person-occ-${index}`} onUpdateModelValue={markEdited}></InputText><div class="grid grid-cols-2 gap-2"><InputText class="w-full" bind:value={person.date_of_birth} placeholder="Born (year or date)" data-testid={`person-born-${index}`} onUpdateModelValue={markEdited}></InputText><InputText class="w-full" bind:value={person.date_of_death} placeholder="Died (year or date)" data-testid={`person-died-${index}`} onUpdateModelValue={markEdited}></InputText></div></div>{/each}<div class="space-y-2 p-3 border rounded-lg border-surface-200"><label class="text-sm font-medium">Shared epitaph</label><InputText class="w-full" bind:value={epitaph.value} placeholder="e.g. With love we remember · Always missed, never forgotten" data-testid="shared-epitaph" onUpdateModelValue={markEdited}></InputText><label class="text-sm font-medium">Full inscription</label><Textarea class="w-full" bind:value={transcriptionText.value} rows="4" autoResize placeholder="Complete text from the stone" data-testid="full-transcription" onUpdateModelValue={markEdited}></Textarea></div><Button label="Add another person" size="small" severity="secondary" text icon="pi pi-plus" data-testid="btn-add-person" onclick={addPerson}></Button><div class="flex flex-col sm:flex-row gap-2">{#if correctionMode.value || decision.value === 'correct' || userEdited.value}<Button class="flex-1" label={
          correctionMode.value || userEdited.value ? 'Save correction' : 'Confirm'
        } severity={correctionMode.value || userEdited.value ? 'warning' : undefined} loading={saving} disabled={!canConfirm.value || saving} data-testid="btn-confirm-stone" onclick={confirm}></Button>{/if}{#if allowSkip}<Button class="flex-1" label="Skip for now" severity="secondary" outlined data-testid="btn-skip-confirm" disabled={saving} onclick={(event) => {  emit('skip') }}></Button>{/if}</div></div>
