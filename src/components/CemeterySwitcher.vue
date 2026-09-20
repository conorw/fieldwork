<template>
  <Drawer
    v-model:visible="open"
    header="Cemeteries"
    position="left"
    class="w-full max-w-sm"
  >
    <div class="flex flex-col gap-3">
      <p class="text-sm text-surface-600 m-0">
        Choose which cemetery you’re recording, or create a new one.
      </p>

      <button
        v-for="loc in locations"
        :key="loc.id"
        type="button"
        class="flex items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition-colors"
        :class="
          loc.id === selectedId
            ? 'border-primary-300 bg-primary-50'
            : 'border-surface-200 bg-surface-0 hover:bg-surface-50'
        "
        @click="choose(loc.id)"
      >
        <span class="min-w-0">
          <span class="block truncate font-medium text-surface-900">{{
            loc.name
          }}</span>
          <span class="block text-xs text-surface-500">{{
            loc.isPublic ? "Public" : "Private"
          }}</span>
        </span>
        <i
          v-if="loc.id === selectedId"
          class="pi pi-check text-primary-600"
          aria-hidden="true"
        ></i>
      </button>

      <p v-if="locations.length === 0" class="text-sm text-surface-500">
        You don’t have a cemetery yet.
      </p>

      <Button
        label="Create a new cemetery"
        icon="pi pi-plus"
        class="w-full"
        @click="createNew"
      />
    </div>
  </Drawer>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import Drawer from "primevue/drawer";
import Button from "primevue/button";
import { useLocationsStore } from "@/stores/locations";

const open = defineModel<boolean>("visible", { default: false });

const router = useRouter();
const locationsStore = useLocationsStore();

const locations = computed(() => locationsStore.locations);
const selectedId = computed(() => locationsStore.selectedLocationId);

function choose(id: string) {
  locationsStore.selectLocation(id);
  open.value = false;
  if (router.currentRoute.value.path === "/locations") {
    router.push("/");
  }
}

function createNew() {
  open.value = false;
  router.push("/locations");
}
</script>
