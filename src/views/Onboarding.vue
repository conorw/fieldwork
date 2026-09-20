<template>
  <div class="min-h-screen flex items-center justify-center bg-surface-50 p-4">
    <Card class="w-full max-w-2xl">
      <template #title>
        <h2 class="text-2xl font-semibold">
          {{ teachMode ? "Teach this cemetery" : "Welcome to Fieldwork!" }}
        </h2>
      </template>
      <template #content>
        <div class="space-y-6">
          <TeachCemetery
            v-if="teachMode && teachLocationId"
            :location-id="teachLocationId"
            @done="onTeachDone"
            @later="onTeachLater"
          />

          <template v-else>
            <p class="text-surface-600">
              To get started, create a new location or join an existing one.
              On-device reading starts automatically — you do not need to add
              teaching photos first.
            </p>

            <div class="flex flex-col sm:flex-row gap-4">
              <Button @click="createLocation" class="flex-1" size="large">
                Create New Location
              </Button>
              <Button
                @click="showLocationSelector = true"
                severity="secondary"
                class="flex-1"
                size="large"
              >
                Join Existing Location
              </Button>
            </div>

            <Button
              v-if="existingLocationId"
              label="Optional: extra teaching photos"
              class="w-full"
              severity="secondary"
              outlined
              @click="startTeach(existingLocationId)"
            />

            <OnboardingLocationSelector
              v-if="showLocationSelector"
              @close="showLocationSelector = false"
            />
          </template>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Card from "primevue/card";
import Button from "primevue/button";
import OnboardingLocationSelector from "@/components/onboarding/OnboardingLocationSelector.vue";
import TeachCemetery from "@/components/onboarding/TeachCemetery.vue";
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
