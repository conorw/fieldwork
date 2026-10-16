<script lang="ts">
import Button from "$lib/ui/Button.svelte";
import Card from "$lib/ui/Card.svelte";
import InputText from "$lib/ui/InputText.svelte";
import Message from "$lib/ui/Message.svelte";

import { computed, ref } from "vue";

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

<div class="min-h-screen bg-surface-50 p-4 flex items-start sm:items-center justify-center" data-testid="fone-onboarding-demo"><Card class="w-full max-w-2xl">{#snippet title()}<div class="flex items-center justify-between gap-2"><h2 class="text-2xl font-semibold" data-testid="demo-title">{titles[step.value]}</h2><span class="text-xs text-surface-500" data-testid="demo-step-label"> Step {stepIndex.value + 1} of {steps.length}</span></div>{/snippet}{#snippet content()}{#if step.value === 'welcome'}<div class="space-y-6" data-testid="step-welcome"><p class="text-surface-600"> Create a new cemetery, teach the app from a real stone photo, then create the plot with the extracted names. </p><Button class="w-full" size="large" label="Create New Location" data-testid="btn-create-location" onclick={(event) => {  go('create') }}></Button></div>{/if}<div class="space-y-4" data-testid="step-create"><label class="text-sm font-medium block">Cemetery name</label><InputText class="w-full" bind:value={cemeteryName.value} placeholder="Enter location name" data-testid="input-cemetery-name"></InputText><div class="h-32 rounded-lg border border-surface-200 bg-surface-100 flex items-center justify-center text-sm text-surface-500" data-testid="map-extent-preview"> Map extent · 1 km × 1 km survey area </div><Button class="w-full" label="Save Location" data-testid="btn-save-location" disabled={cemeteryName.value.trim().length < 3} onclick={(event) => {  go('teach') }}></Button></div><div class="space-y-4" data-testid="step-teach"><p class="text-sm text-surface-600"> Photograph a stone at <strong data-testid="saved-cemetery-name">{cemeteryName.value}</strong> so the app can learn this cemetery. </p>{#if !analyzing.value && !extracted.value}<Button class="w-full" label="Take or choose a photo" icon="pi pi-camera" data-testid="btn-take-photo" onclick={runExtraction}></Button>{/if}{#if showPreview.value}<div class="rounded overflow-hidden border border-surface-200 max-h-72"><img class="max-h-72 object-contain w-full" src={stoneSrc} alt="Headstone" data-testid="stone-preview" /></div>{/if}{#if analyzing.value}<Message severity="info" closable={false} data-testid="analyzing"> Reading headstone… </Message>{/if}</div><div class="space-y-4" data-testid="step-confirm"><div class="rounded overflow-hidden border border-surface-200 max-h-48"><img class="max-h-48 object-contain w-full" src={stoneSrc} alt="Headstone" data-testid="stone-preview" /></div><div class="p-3 rounded-lg border border-surface-200 bg-surface-50"><p class="text-sm font-medium mb-1">Check the names</p><p class="text-xs text-surface-600"> Fix anything that looks wrong, then confirm. This teaches the app your cemetery’s stones. </p></div><div class="grid grid-cols-2 gap-2">{#each kindLabels as label, kind (kind)}<Button label={label} size="small" severity={stoneKind.value === kind ? undefined : 'secondary'} outlined={stoneKind.value !== kind} data-testid={`kind-${kind}`} onclick={(event) => {  stoneKind.value = kind }}></Button>{/each}</div>{#each people.value as person, index (index)}<div class="p-3 border border-surface-200 rounded-lg space-y-2" data-testid={`person-row-${index}`}><span class="text-sm font-medium">Person {index + 1}</span>{#if person.relationship}<p class="text-xs text-surface-500" data-testid={`person-rel-${index}`}>{person.relationship}</p>{/if}<InputText class="w-full" bind:value={person.full_name} placeholder="Full name" data-testid={`person-name-${index}`}></InputText><div class="grid grid-cols-2 gap-2"><InputText class="w-full" bind:value={person.born} placeholder="Born" data-testid={`person-born-${index}`}></InputText><InputText class="w-full" bind:value={person.died} placeholder="Died" data-testid={`person-died-${index}`}></InputText></div></div>{/each}<p class="text-xs text-surface-500" data-testid="epitaph">{epitaph.value}</p><Button class="w-full" label="Confirm" data-testid="btn-confirm-stone" onclick={(event) => {  go('plot') }}></Button></div><div class="space-y-4" data-testid="step-plot"><p class="text-sm font-medium" data-testid="wizard-step"> Create plot · photo + confirmed names </p><div class="rounded overflow-hidden border max-h-40"><img class="max-h-40 object-contain w-full" src={stoneSrc} alt="Headstone" data-testid="plot-photo" /></div><div class="p-3 rounded-lg bg-green-50 border border-green-200 text-sm" data-testid="gps-stable"> GPS stable · ready to save </div><InputText class="w-full" bind:value={plotSection.value} placeholder="Section" data-testid="input-section"></InputText><InputText class="w-full" bind:value={plotRow.value} placeholder="Row" data-testid="input-row"></InputText><InputText class="w-full" bind:value={plotNumber.value} placeholder="Number" data-testid="input-number"></InputText><div class="text-sm space-y-1 border rounded p-3" data-testid="plot-persons">{#each people.value as p, i (i)}<p data-testid={`plot-person-${i}`}>{p.full_name} <span class="text-surface-500"> · {p.born} — {p.died}</span></p>{/each}</div><Button class="w-full" label="Create plot" data-testid="btn-create-plot" onclick={createPlot}></Button></div><div class="space-y-4" data-testid="step-done"><Message severity="success" closable={false} data-testid="plot-created"> Plot {plotSection.value}-{plotRow.value}-{plotNumber.value} created with Dennis William Fone and Beryl Jean Fone. </Message><div class="h-40 rounded-lg border bg-emerald-50 flex flex-col items-center justify-center gap-1" data-testid="map-ready"><span class="font-semibold">{cemeteryName.value}</span><span class="text-sm text-surface-600" data-testid="plot-ref">{plotSection.value}-{plotRow.value}-{plotNumber.value}</span><span class="text-xs text-surface-500">Couple stone · taught + plotted</span></div><p class="text-xs text-center text-surface-400" data-testid="demo-complete"> Onboarding + extraction + plot creation complete </p></div>{/snippet}</Card></div>
