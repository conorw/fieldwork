<template>
  <div
    class="min-h-screen bg-surface-50 p-4 flex items-start sm:items-center justify-center"
    data-testid="fone-onboarding-demo"
  >
    <Card class="w-full max-w-2xl">
      <template #title>
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-2xl font-semibold" data-testid="demo-title">
            {{ titles[step] }}
          </h2>
          <span class="text-xs text-surface-500" data-testid="demo-step-label">
            Step {{ stepIndex + 1 }} of {{ steps.length }}
          </span>
        </div>
      </template>
      <template #content>
        <!-- Welcome -->
        <div v-if="step === 'welcome'" class="space-y-6" data-testid="step-welcome">
          <p class="text-surface-600">
            Create a new cemetery, teach the app from a real stone photo, then
            create the plot with the extracted names.
          </p>
          <Button
            class="w-full"
            size="large"
            label="Create New Location"
            data-testid="btn-create-location"
            @click="go('create')"
          />
        </div>

        <!-- Create cemetery -->
        <div v-else-if="step === 'create'" class="space-y-4" data-testid="step-create">
          <label class="text-sm font-medium block">Cemetery name</label>
          <InputText
            v-model="cemeteryName"
            class="w-full"
            placeholder="Enter location name"
            data-testid="input-cemetery-name"
          />
          <div
            class="h-32 rounded-lg border border-surface-200 bg-surface-100 flex items-center justify-center text-sm text-surface-500"
            data-testid="map-extent-preview"
          >
            Map extent · 1 km × 1 km survey area
          </div>
          <Button
            class="w-full"
            label="Save Location"
            data-testid="btn-save-location"
            :disabled="cemeteryName.trim().length < 3"
            @click="go('teach')"
          />
        </div>

        <!-- Teach: show photo + analyzing -->
        <div v-else-if="step === 'teach'" class="space-y-4" data-testid="step-teach">
          <p class="text-sm text-surface-600">
            Photograph a stone at
            <strong data-testid="saved-cemetery-name">{{ cemeteryName }}</strong>
            so the app can learn this cemetery.
          </p>
          <Button
            v-if="!analyzing && !extracted"
            label="Take or choose a photo"
            icon="pi pi-camera"
            class="w-full"
            data-testid="btn-take-photo"
            @click="runExtraction"
          />
          <div
            v-if="showPreview"
            class="rounded overflow-hidden border border-surface-200 max-h-72"
          >
            <img
              :src="stoneSrc"
              alt="Headstone"
              class="max-h-72 object-contain w-full"
              data-testid="stone-preview"
            />
          </div>
          <Message v-if="analyzing" severity="info" :closable="false" data-testid="analyzing">
            Reading headstone…
          </Message>
        </div>

        <!-- Confirm extraction -->
        <div v-else-if="step === 'confirm'" class="space-y-4" data-testid="step-confirm">
          <div class="rounded overflow-hidden border border-surface-200 max-h-48">
            <img
              :src="stoneSrc"
              alt="Headstone"
              class="max-h-48 object-contain w-full"
              data-testid="stone-preview"
            />
          </div>
          <div class="p-3 rounded-lg border border-surface-200 bg-surface-50">
            <p class="text-sm font-medium mb-1">Check the names</p>
            <p class="text-xs text-surface-600">
              Fix anything that looks wrong, then confirm. This teaches the app
              your cemetery’s stones.
            </p>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <Button
              v-for="(label, kind) in kindLabels"
              :key="kind"
              :label="label"
              size="small"
              :severity="stoneKind === kind ? undefined : 'secondary'"
              :outlined="stoneKind !== kind"
              :data-testid="`kind-${kind}`"
              @click="stoneKind = kind"
            />
          </div>
          <div
            v-for="(person, index) in people"
            :key="index"
            class="p-3 border border-surface-200 rounded-lg space-y-2"
            :data-testid="`person-row-${index}`"
          >
            <span class="text-sm font-medium">Person {{ index + 1 }}</span>
            <p
              v-if="person.relationship"
              class="text-xs text-surface-500"
              :data-testid="`person-rel-${index}`"
            >
              {{ person.relationship }}
            </p>
            <InputText
              v-model="person.full_name"
              class="w-full"
              placeholder="Full name"
              :data-testid="`person-name-${index}`"
            />
            <div class="grid grid-cols-2 gap-2">
              <InputText
                v-model="person.born"
                class="w-full"
                placeholder="Born"
                :data-testid="`person-born-${index}`"
              />
              <InputText
                v-model="person.died"
                class="w-full"
                placeholder="Died"
                :data-testid="`person-died-${index}`"
              />
            </div>
          </div>
          <p class="text-xs text-surface-500" data-testid="epitaph">
            {{ epitaph }}
          </p>
          <Button
            label="Confirm"
            class="w-full"
            data-testid="btn-confirm-stone"
            @click="go('plot')"
          />
        </div>

        <!-- Create plot from extraction -->
        <div v-else-if="step === 'plot'" class="space-y-4" data-testid="step-plot">
          <p class="text-sm font-medium" data-testid="wizard-step">
            Create plot · photo + confirmed names
          </p>
          <div class="rounded overflow-hidden border max-h-40">
            <img
              :src="stoneSrc"
              alt="Headstone"
              class="max-h-40 object-contain w-full"
              data-testid="plot-photo"
            />
          </div>
          <div class="p-3 rounded-lg bg-green-50 border border-green-200 text-sm" data-testid="gps-stable">
            GPS stable · ready to save
          </div>
          <InputText v-model="plotSection" class="w-full" placeholder="Section" data-testid="input-section" />
          <InputText v-model="plotRow" class="w-full" placeholder="Row" data-testid="input-row" />
          <InputText v-model="plotNumber" class="w-full" placeholder="Number" data-testid="input-number" />
          <div class="text-sm space-y-1 border rounded p-3" data-testid="plot-persons">
            <p v-for="(p, i) in people" :key="i" :data-testid="`plot-person-${i}`">
              {{ p.full_name }}
              <span class="text-surface-500"> · {{ p.born }} — {{ p.died }}</span>
            </p>
          </div>
          <Button
            label="Create plot"
            class="w-full"
            data-testid="btn-create-plot"
            @click="createPlot"
          />
        </div>

        <!-- Done -->
        <div v-else-if="step === 'done'" class="space-y-4" data-testid="step-done">
          <Message severity="success" :closable="false" data-testid="plot-created">
            Plot {{ plotSection }}-{{ plotRow }}-{{ plotNumber }} created with
            Dennis William Fone and Beryl Jean Fone.
          </Message>
          <div
            class="h-40 rounded-lg border bg-emerald-50 flex flex-col items-center justify-center gap-1"
            data-testid="map-ready"
          >
            <span class="font-semibold">{{ cemeteryName }}</span>
            <span class="text-sm text-surface-600" data-testid="plot-ref">
              {{ plotSection }}-{{ plotRow }}-{{ plotNumber }}
            </span>
            <span class="text-xs text-surface-500">Couple stone · taught + plotted</span>
          </div>
          <p class="text-xs text-center text-surface-400" data-testid="demo-complete">
            Onboarding + extraction + plot creation complete
          </p>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import Card from "primevue/card";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Message from "primevue/message";

type Step = "welcome" | "create" | "teach" | "confirm" | "plot" | "done";

const stoneSrc = "/e2e/fone-headstone.webp";

const steps: Step[] = ["welcome", "create", "teach", "confirm", "plot", "done"];
const titles: Record<Step, string> = {
  welcome: "Welcome to Fieldwork!",
  create: "Create New Location",
  teach: "Teach this cemetery",
  confirm: "Check the names",
  plot: "Create plot",
  done: "Ready for the field",
};

const kindLabels = {
  one_person: "One person",
  couple: "Couple",
  family: "Family",
  other: "Other / weathered",
} as const;

const step = ref<Step>("welcome");
const cemeteryName = ref("Oakwood Cemetery");
const analyzing = ref(false);
const extracted = ref(false);
const showPreview = ref(false);
const stoneKind = ref<keyof typeof kindLabels>("couple");
const epitaph = ref("Always missed, never forgotten");

const people = ref([
  {
    full_name: "Dennis William Fone",
    born: "1933-06-25",
    died: "2020-10-01",
    relationship: "dear husband · spouse of Beryl Jean Fone",
  },
  {
    full_name: "Beryl Jean Fone",
    born: "1948-02-02",
    died: "2021-11-01",
    relationship: "dear wife and mother · spouse of Dennis William Fone",
  },
]);

const plotSection = ref("A");
const plotRow = ref("12");
const plotNumber = ref("18");

const stepIndex = computed(() => steps.indexOf(step.value));

function go(next: Step) {
  step.value = next;
}

async function runExtraction() {
  showPreview.value = true;
  analyzing.value = true;
  extracted.value = false;
  // Brief pause so the video shows “Reading headstone…”
  await new Promise((r) => setTimeout(r, 1400));
  analyzing.value = false;
  extracted.value = true;
  stoneKind.value = "couple";
  go("confirm");
}

function createPlot() {
  go("done");
}
</script>
