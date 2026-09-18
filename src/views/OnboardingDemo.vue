<template>
  <div
    class="min-h-screen bg-surface-50 p-4 flex items-start sm:items-center justify-center"
    data-testid="onboarding-demo"
  >
    <Card class="w-full max-w-2xl">
      <template #title>
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-2xl font-semibold" data-testid="demo-title">
            {{ titles[step] }}
          </h2>
          <span
            class="text-xs text-surface-500 whitespace-nowrap"
            data-testid="demo-step-label"
          >
            Step {{ stepIndex + 1 }} of {{ steps.length }}
          </span>
        </div>
      </template>
      <template #content>
        <!-- 1. Welcome -->
        <div v-if="step === 'welcome'" class="space-y-6" data-testid="step-welcome">
          <p class="text-surface-600">
            To get started, you need to either create a new location or join an
            existing one. After that, you can teach the app a few of your stones
            so reading works offline.
          </p>
          <div class="flex flex-col sm:flex-row gap-4">
            <Button
              class="flex-1"
              size="large"
              label="Create New Location"
              data-testid="btn-create-location"
              @click="go('create')"
            />
            <Button
              class="flex-1"
              size="large"
              severity="secondary"
              label="Join Existing Location"
              data-testid="btn-join-location"
              disabled
            />
          </div>
        </div>

        <!-- 2. Create cemetery -->
        <div v-else-if="step === 'create'" class="space-y-4" data-testid="step-create">
          <p class="text-sm text-surface-600">
            Name the cemetery and set a map area for field work.
          </p>
          <label class="text-sm font-medium block">Cemetery name</label>
          <InputText
            v-model="cemeteryName"
            class="w-full"
            placeholder="Enter location name"
            data-testid="input-cemetery-name"
          />
          <div
            class="h-40 rounded-lg border border-surface-200 bg-surface-100 flex items-center justify-center text-sm text-surface-500"
            data-testid="map-extent-preview"
          >
            Map extent · 1 km × 1 km survey area
          </div>
          <Button
            class="w-full"
            label="Save Location"
            data-testid="btn-save-location"
            :disabled="cemeteryName.trim().length < 3"
            @click="saveLocation"
          />
        </div>

        <!-- 3. Teach intro -->
        <div v-else-if="step === 'teach-intro'" class="space-y-6" data-testid="step-teach-intro">
          <div>
            <h3 class="text-xl font-semibold mb-1">Teach this cemetery</h3>
            <p class="text-sm text-surface-600">
              Photograph a few real stones and check the names. This helps the
              app read headstones offline at
              <strong data-testid="saved-cemetery-name">{{ cemeteryName }}</strong>.
            </p>
            <p class="text-sm mt-2 font-medium" data-testid="coverage-message">
              {{ coverageMessage }}
            </p>
          </div>
          <Message severity="info" :closable="false">
            Use Wi‑Fi if you can — the first offline model download is large.
          </Message>
          <div class="space-y-2">
            <p class="text-sm font-medium">Suggested kinds (any order)</p>
            <ul class="text-sm text-surface-600 list-disc pl-5">
              <li>One person</li>
              <li>Couple</li>
              <li>Family</li>
              <li>Weathered or hard to read</li>
            </ul>
          </div>
          <Button
            label="Take or choose a photo"
            icon="pi pi-camera"
            class="w-full"
            data-testid="btn-take-photo"
            @click="startPhoto(0)"
          />
        </div>

        <!-- 4. Confirm stone -->
        <div v-else-if="step === 'confirm'" class="space-y-4" data-testid="step-confirm">
          <div
            v-if="currentPreview"
            class="rounded overflow-hidden max-h-48 border border-surface-200"
          >
            <img
              :src="currentPreview"
              alt="Stone preview"
              class="max-h-48 object-contain w-full"
              data-testid="stone-preview"
            />
          </div>
          <p class="text-sm font-medium" data-testid="coverage-message">
            {{ coverageMessage }}
          </p>
          <div class="p-3 rounded-lg border border-surface-200 bg-surface-50">
            <p class="text-sm font-medium mb-1">Check the names</p>
            <p class="text-xs text-surface-600">
              Fix anything that looks wrong, then confirm. This teaches the app
              your cemetery’s stones.
            </p>
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
                @click="stoneKind = kind"
              />
            </div>
          </div>
          <div
            v-for="(person, index) in people"
            :key="index"
            class="p-3 border border-surface-200 rounded-lg space-y-2"
            :data-testid="`person-row-${index}`"
          >
            <span class="text-sm font-medium">Person {{ index + 1 }}</span>
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
          <Button
            label="Confirm"
            class="w-full"
            data-testid="btn-confirm-stone"
            @click="confirmStone"
          />
        </div>

        <!-- 5. Teaching progress between stones -->
        <div
          v-else-if="step === 'teach-more'"
          class="space-y-6"
          data-testid="step-teach-more"
        >
          <p class="text-sm font-medium" data-testid="coverage-message">
            {{ coverageMessage }}
          </p>
          <ul class="text-sm space-y-1">
            <li
              v-for="(s, i) in confirmed"
              :key="i"
              class="text-surface-600"
              data-testid="confirmed-stone"
            >
              ✓ {{ s.kindLabel }} — {{ s.summary }}
            </li>
          </ul>
          <Button
            v-if="!coverageReady"
            label="Take or choose a photo"
            icon="pi pi-camera"
            class="w-full"
            data-testid="btn-take-photo"
            @click="startPhoto(confirmed.length)"
          />
          <Button
            v-else
            label="Done — start offline learning"
            class="w-full"
            data-testid="btn-finish-teach"
            @click="go('learning')"
          />
        </div>

        <!-- 6. Offline learning -->
        <div v-else-if="step === 'learning'" class="space-y-6" data-testid="step-learning">
          <Message severity="success" :closable="false">
            Enough confirmed stones to learn this cemetery offline.
          </Message>
          <div
            class="rounded-lg border border-surface-200 p-4 bg-blue-50 text-sm"
            data-testid="learning-banner"
          >
            Learning {{ cemeteryName }}’s stones for offline use…
          </div>
          <div class="w-full bg-surface-200 rounded-full h-2 overflow-hidden">
            <div
              class="bg-blue-600 h-2 transition-all duration-500"
              :style="{ width: `${learnProgress}%` }"
              data-testid="learn-progress"
            />
          </div>
          <Button
            v-if="learnProgress >= 100"
            label="Go to Map"
            class="w-full"
            severity="success"
            data-testid="btn-go-to-map"
            @click="go('map')"
          />
        </div>

        <!-- 7. Map ready -->
        <div v-else-if="step === 'map'" class="space-y-6" data-testid="step-map">
          <Message severity="success" :closable="false">
            {{ cemeteryName }} is ready. Online teaching is done — field reading
            can continue offline once the model finishes downloading on device.
          </Message>
          <div
            class="h-48 rounded-lg border border-surface-200 bg-surface-100 flex flex-col items-center justify-center gap-2"
            data-testid="map-ready"
          >
            <span class="text-lg font-semibold">{{ cemeteryName }}</span>
            <span class="text-sm text-surface-500">Map · plots · offline AI</span>
          </div>
          <p class="text-xs text-surface-500 text-center" data-testid="demo-complete">
            Onboarding complete
          </p>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Card from "primevue/card";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Message from "primevue/message";

type Step =
  | "welcome"
  | "create"
  | "teach-intro"
  | "confirm"
  | "teach-more"
  | "learning"
  | "map";

type StoneKind = "one_person" | "couple" | "family" | "other";

const steps: Step[] = [
  "welcome",
  "create",
  "teach-intro",
  "confirm",
  "teach-more",
  "learning",
  "map",
];

const titles: Record<Step, string> = {
  welcome: "Welcome to Fieldwork!",
  create: "Create New Location",
  "teach-intro": "Teach this cemetery",
  confirm: "Check the names",
  "teach-more": "Teach this cemetery",
  learning: "Offline learning",
  map: "Ready for the field",
};

const kindLabels: Record<StoneKind, string> = {
  one_person: "One person",
  couple: "Couple",
  family: "Family",
  other: "Other / weathered",
};

const DEMO_STONES = [
  {
    kind: "one_person" as StoneKind,
    preview: "/screenshots/plot-detail-narrow.png",
    people: [{ full_name: "John Smith", born: "1920", died: "1998" }],
  },
  {
    kind: "couple" as StoneKind,
    preview: "/screenshots/map-view-wide.png",
    people: [
      { full_name: "Mary Jones", born: "1915", died: "1989" },
      { full_name: "William Jones", born: "1912", died: "1991" },
    ],
  },
  {
    kind: "family" as StoneKind,
    preview: "/screenshots/settings-wide.png",
    people: [
      { full_name: "Robert Wilson", born: "1888", died: "1960" },
      { full_name: "Elizabeth Wilson", born: "1890", died: "1965" },
      { full_name: "Thomas Wilson", born: "1915", died: "1944" },
    ],
  },
];

const step = ref<Step>("welcome");
const cemeteryName = ref("Oakwood Cemetery");
const stoneKind = ref<StoneKind>("one_person");
const people = ref<{ full_name: string; born: string; died: string }[]>([]);
const currentPreview = ref("");
const photoIndex = ref(0);
const confirmed = ref<
  { kind: StoneKind; kindLabel: string; summary: string }[]
>([]);
const learnProgress = ref(0);

const stepIndex = computed(() => Math.max(0, steps.indexOf(step.value)));
const coverageReady = computed(() => confirmed.value.length >= 3);
const coverageMessage = computed(() => {
  const n = confirmed.value.length;
  if (n >= 3) return "Enough confirmed stones to learn this cemetery offline.";
  const remaining = 3 - n;
  return `Confirm ${remaining} more stone${remaining === 1 ? "" : "s"} (${n} of 3).`;
});

function go(next: Step) {
  step.value = next;
}

function saveLocation() {
  if (cemeteryName.value.trim().length < 3) return;
  go("teach-intro");
}

function startPhoto(index: number) {
  photoIndex.value = index;
  const demo = DEMO_STONES[index] || DEMO_STONES[0];
  stoneKind.value = demo.kind;
  people.value = demo.people.map((p) => ({ ...p }));
  currentPreview.value = demo.preview;
  go("confirm");
}

function confirmStone() {
  const summary = people.value.map((p) => p.full_name).join(", ");
  confirmed.value.push({
    kind: stoneKind.value,
    kindLabel: kindLabels[stoneKind.value],
    summary,
  });
  go("teach-more");
}

watch(step, (s) => {
  if (s !== "learning") return;
  learnProgress.value = 0;
  const id = window.setInterval(() => {
    learnProgress.value = Math.min(100, learnProgress.value + 20);
    if (learnProgress.value >= 100) window.clearInterval(id);
  }, 350);
});
</script>
