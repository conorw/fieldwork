<template>
  <div class="min-h-screen flex items-center justify-center bg-surface-50 p-4">
    <Card class="w-full max-w-2xl">
      <template #title>
        <h2 class="text-2xl font-semibold">Welcome to Fieldwork!</h2>
      </template>
      <template #content>
        <div class="space-y-6">
          <p class="text-surface-600">
            To get started, you need to either create a new location or join an
            existing one.
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

          <OnboardingLocationSelector
            v-if="showLocationSelector"
            @close="showLocationSelector = false"
          />
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import Card from "primevue/card";
import Button from "primevue/button";
import OnboardingLocationSelector from "@/components/onboarding/OnboardingLocationSelector.vue";

const router = useRouter();
const showLocationSelector = ref(false);

const createLocation = () => {
  router.push("/locations");
};
</script>
