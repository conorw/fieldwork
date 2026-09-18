<template>
  <div class="space-y-4" data-testid="headstone-confirm-card">
    <div
      class="p-3 rounded-lg border"
      :class="
        correctionMode
          ? 'border-amber-300 bg-amber-50'
          : 'border-surface-200 bg-surface-50'
      "
    >
      <p class="text-sm font-medium mb-1">
        {{
          correctionMode
            ? "Fix what the app got wrong"
            : "Check the names"
        }}
      </p>
      <p class="text-xs text-surface-600">
        <template v-if="correctionMode">
          Your corrections teach
          <strong>this cemetery</strong> and improve reading for
          <strong>other cemeteries</strong> (weights only — never your photos).
        </template>
        <template v-else>
          Confirm if it looks right, or say it’s wrong and fix the fields.
          Confirmed stones train offline reading for this place and help the
          shared model.
        </template>
      </p>
    </div>

    <Message
      v-if="correctionMode"
      severity="warn"
      :closable="false"
      data-testid="correction-banner"
    >
      Marked as incorrect — edit names and dates below, then save your
      correction.
    </Message>

    <div v-if="!decision && !correctionMode" class="flex flex-col sm:flex-row gap-2">
      <Button
        label="Looks correct"
        icon="pi pi-check"
        class="flex-1"
        data-testid="btn-looks-correct"
        :loading="saving"
        :disabled="!canConfirm || saving"
        @click="acceptAsCorrect"
      />
      <Button
        label="Something's wrong"
        icon="pi pi-pencil"
        severity="warn"
        outlined
        class="flex-1"
        data-testid="btn-something-wrong"
        :disabled="saving"
        @click="enterCorrectionMode"
      />
    </div>

    <div class="space-y-2">
      <label class="text-sm font-medium">What kind of stone?</label>
      <div class="grid grid-cols-2 gap-2">
        <Button
          v-for="(label, kind) in kindLabels"
          :key="kind"
          :label="label"
          size="small"
          :severity="stoneKind === kind ? undefined : 'secondary'"
          :outlined="stoneKind !== kind"
          :data-testid="`kind-${kind}`"
          @click="onKindChange(kind as StaffStoneKind)"
        />
      </div>
    </div>

    <div
      class="p-3 border rounded-lg space-y-3 border-surface-200"
      data-testid="physical-attrs"
    >
      <p class="text-sm font-medium">Monument</p>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div class="space-y-1">
          <label class="text-xs text-surface-600">Material</label>
          <Dropdown
            v-model="physical.material"
            :options="materialOptions"
            optionLabel="label"
            optionValue="value"
            class="w-full"
            data-testid="physical-material"
            @change="markEdited"
          />
        </div>
        <div class="space-y-1">
          <label class="text-xs text-surface-600">Type / form</label>
          <Dropdown
            v-model="physical.form"
            :options="formOptions"
            optionLabel="label"
            optionValue="value"
            class="w-full"
            data-testid="physical-form"
            @change="markEdited"
          />
        </div>
        <div class="space-y-1">
          <label class="text-xs text-surface-600">Condition</label>
          <Dropdown
            v-model="physical.condition"
            :options="conditionOptions"
            optionLabel="label"
            optionValue="value"
            class="w-full"
            data-testid="physical-condition"
            @change="markEdited"
          />
        </div>
      </div>
      <InputText
        v-model="physical.detail"
        class="w-full"
        placeholder="Detail (e.g. polished dark grey, fresh soil)"
        data-testid="physical-detail"
        @update:model-value="markEdited"
      />
    </div>

    <div
      v-for="(person, index) in people"
      :key="index"
      class="p-3 border rounded-lg space-y-2"
      :class="correctionMode ? 'border-amber-200' : 'border-surface-200'"
      :data-testid="`person-row-${index}`"
    >
      <div class="flex justify-between items-center">
        <span class="text-sm font-medium">Person {{ index + 1 }}</span>
        <Button
          v-if="people.length > 1"
          icon="pi pi-trash"
          text
          rounded
          severity="danger"
          size="small"
          @click="removePerson(index)"
        />
      </div>
      <InputText
        v-model="person.full_name"
        class="w-full"
        placeholder="Full name"
        :data-testid="`person-name-${index}`"
        @update:model-value="markEdited"
      />
      <InputText
        :model-value="(person.relationships || []).join(', ')"
        class="w-full"
        placeholder="Relationship (e.g. dear husband, wife and mother)"
        :data-testid="`person-rel-${index}`"
        @update:model-value="
          (v) => {
            person.relationships = String(v || '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            markEdited();
          }
        "
      />
      <InputText
        v-model="person.occupation"
        class="w-full"
        placeholder="Occupation / regiment (if any)"
        :data-testid="`person-occ-${index}`"
        @update:model-value="markEdited"
      />
      <div class="grid grid-cols-2 gap-2">
        <InputText
          v-model="person.date_of_birth"
          class="w-full"
          placeholder="Born (year or date)"
          :data-testid="`person-born-${index}`"
          @update:model-value="markEdited"
        />
        <InputText
          v-model="person.date_of_death"
          class="w-full"
          placeholder="Died (year or date)"
          :data-testid="`person-died-${index}`"
          @update:model-value="markEdited"
        />
      </div>
    </div>

    <div class="space-y-2 p-3 border rounded-lg border-surface-200">
      <label class="text-sm font-medium">Shared epitaph</label>
      <InputText
        v-model="epitaph"
        class="w-full"
        placeholder="e.g. With love we remember · Always missed, never forgotten"
        data-testid="shared-epitaph"
        @update:model-value="markEdited"
      />
      <label class="text-sm font-medium">Full inscription</label>
      <Textarea
        v-model="transcriptionText"
        class="w-full"
        rows="4"
        autoResize
        placeholder="Complete text from the stone"
        data-testid="full-transcription"
        @update:model-value="markEdited"
      />
    </div>

    <Button
      label="Add another person"
      size="small"
      severity="secondary"
      text
      icon="pi pi-plus"
      data-testid="btn-add-person"
      @click="addPerson"
    />

    <div class="flex flex-col sm:flex-row gap-2">
      <Button
        v-if="correctionMode || decision === 'correct' || userEdited"
        :label="
          correctionMode || userEdited ? 'Save correction' : 'Confirm'
        "
        class="flex-1"
        :severity="correctionMode || userEdited ? 'warning' : undefined"
        :loading="saving"
        :disabled="!canConfirm || saving"
        data-testid="btn-confirm-stone"
        @click="confirm"
      />
      <Button
        v-if="allowSkip"
        label="Skip for now"
        class="flex-1"
        severity="secondary"
        outlined
        data-testid="btn-skip-confirm"
        :disabled="saving"
        @click="$emit('skip')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import Dropdown from "primevue/dropdown";
import InputText from "primevue/inputtext";
import Textarea from "primevue/textarea";
import Message from "primevue/message";
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

const props = withDefaults(
  defineProps<{
    persons: PersonData[];
    transcription?: string;
    epitaph?: string;
    physical?: HeadstonePhysicalAttrs | null;
    allowSkip?: boolean;
    saving?: boolean;
  }>(),
  {
    allowSkip: false,
    saving: false,
    transcription: "",
    epitaph: "",
    physical: null,
  },
);

const emit = defineEmits<{
  confirmed: [
    payload: {
      stoneType: StoneType;
      stoneKind: StaffStoneKind;
      target: HeadstoneReasoningTarget;
      persons: ConfirmPersonInput[];
      wasCorrected: boolean;
      epitaph: string;
      transcription: string;
      physical: HeadstonePhysicalAttrs;
    },
  ];
  skip: [];
}>();

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
    [props.persons, props.transcription, props.epitaph, props.physical] as const,
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
