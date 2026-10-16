<script lang="ts">
import { cls } from "$lib/ui/cls";
import Button from "$lib/ui/Button.svelte";
import Drawer from "$lib/ui/Drawer.svelte";

import { computed } from "vue";
import { useRouter } from "vue-router";
import { useLocationsStore } from "@/stores/locations";

let { visible: open = $bindable(false) } = $props();

const router = useRouter();
const locationsStore = useLocationsStore();

const locations = computed(() => locationsStore.locations);
const selectedId = computed(() => locationsStore.selectedLocationId);

function choose(id: string) {
  locationsStore.selectLocation(id);
  open = false;
  if (router.currentRoute.value.path === "/locations") {
    router.push("/");
  }
}

function createNew() {
  open = false;
  router.push("/locations");
}
</script>

<Drawer class="w-full max-w-sm" bind:visible={open} header="Cemeteries" position="left"><div class="flex flex-col gap-3"><p class="text-sm text-surface-600 m-0"> Choose which cemetery you’re recording, or create a new one. </p>{#each locations.value as loc (loc.id)}<button class="flex items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition-colors {cls(
          loc.id === selectedId.value
            ? 'border-primary-300 bg-primary-50'
            : 'border-surface-200 bg-surface-0 hover:bg-surface-50'
        )}" type="button" onclick={(event) => {  choose(loc.id) }}><span class="min-w-0"><span class="block truncate font-medium text-surface-900">{loc.name}</span><span class="block text-xs text-surface-500">{loc.isPublic ? "Public" : "Private"}</span></span>{#if loc.id === selectedId.value}<i class="pi pi-check text-primary-600" aria-hidden="true"></i>{/if}</button>{/each}{#if locations.value.length === 0}<p class="text-sm text-surface-500"> You don’t have a cemetery yet. </p>{/if}<Button class="w-full" label="Create a new cemetery" icon="pi pi-plus" onclick={createNew}></Button></div></Drawer>
