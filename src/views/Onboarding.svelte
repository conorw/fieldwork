<script lang="ts">
import Button from "$lib/ui/Button.svelte";
import Card from "$lib/ui/Card.svelte";

import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import OnboardingLocationSelector from "@/components/onboarding/OnboardingLocationSelector.svelte";
import TeachCemetery from "@/components/onboarding/TeachCemetery.svelte";
import { useLocationsStore } from "@/stores/locations";

const router = useRouter();
const route = useRoute();
const locationsStore = useLocationsStore();
const showLocationSelector = ref(false);
const teachMode = ref(false);
const teachLocationId = ref<string | null>(null);

const existingLocationId = computed(
  () =>
    locationsStore.selectedLocationId ||
    locationsStore.locations[0]?.id ||
    null,
);

function startTeach(locationId: string) {
  teachLocationId.value = locationId;
  teachMode.value = true;
}

watch(
  () => route.query.teach,
  (v) => {
    if (v === "1" && existingLocationId.value) {
      startTeach(existingLocationId.value);
    }
  },
  { immediate: true },
);

const createLocation = () => {
  router.push("/locations");
};

function onTeachDone() {
  teachMode.value = false;
  router.push("/");
}

function onTeachLater() {
  teachMode.value = false;
  router.push("/");
}
</script>

<div class="min-h-screen flex items-center justify-center bg-surface-50 p-4"><Card class="w-full max-w-2xl">{#snippet title()}<h2 class="text-2xl font-semibold">{teachMode.value ? "Help improve reading" : "Welcome to Fieldwork"}</h2>{/snippet}{#snippet content()}<div class="space-y-6">{#if teachMode.value && teachLocationId.value}<TeachCemetery location-id={teachLocationId.value} onDone={onTeachDone} onLater={onTeachLater}></TeachCemetery>{:else}<p class="text-surface-600"> Create a cemetery or join one you already belong to. You can photograph headstones straight away — on-device reading starts in the background. </p><div class="flex flex-col sm:flex-row gap-4"><Button class="flex-1" size="large" onclick={createLocation}> Create a cemetery </Button><Button class="flex-1" severity="secondary" size="large" onclick={(event) => {  showLocationSelector.value = true }}> Join a cemetery </Button></div>{#if showLocationSelector.value}<OnboardingLocationSelector onClose={(event) => {  showLocationSelector.value = false }}></OnboardingLocationSelector>{/if}{/if}</div>{/snippet}</Card></div>
