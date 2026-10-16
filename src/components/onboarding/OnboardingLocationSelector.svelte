<script lang="ts">
import Button from "$lib/ui/Button.svelte";
import Card from "$lib/ui/Card.svelte";
import InputText from "$lib/ui/InputText.svelte";
import ProgressSpinner from "$lib/ui/ProgressSpinner.svelte";
let props = $props<Record<string, any>>();

import { ref, computed, onMounted } from "vue";
import { useAuthStore } from "@/stores/auth";
import { usePowerSyncStore } from "@/stores/powersync";
import { useToast } from "primevue/usetoast";

function emit(event: string, ...args: any[]) {
  const name = "on" + String(event).split(/[:-]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
  const handler = typeof props === "undefined" ? undefined : (props as any)[name];
  if (typeof handler === "function") handler(...args);
}

const authStore = useAuthStore();
const powerSyncStore = usePowerSyncStore();
const toast = useToast();
const searchQuery = ref("");
const locations = ref<any[]>([]);
const isLoading = ref(false);
const isRequesting = ref(false);

const filteredLocations = computed(() => {
  if (!searchQuery.value) return locations.value;
  const query = searchQuery.value.toLowerCase();
  return locations.value.filter((loc) =>
    loc.name.toLowerCase().includes(query),
  );
});

const loadPublicLocations = async () => {
  isLoading.value = true;
  try {
    // Use PowerSync to load public locations (works offline)
    if (!powerSyncStore.powerSync) {
      throw new Error("PowerSync not initialized");
    }

    const results = (await powerSyncStore.powerSync.getAll(
      "SELECT id, name, is_public FROM locations WHERE is_public = 'true' OR is_public = true",
    )) as any[];

    locations.value = results || [];
  } catch (error) {
    console.error("Error loading public locations:", error);
    toast.add({
      severity: "error",
      summary: "Error",
      detail: "Failed to load locations",
    });
  } finally {
    isLoading.value = false;
  }
};

const requestToJoin = async (locationId: string) => {
  if (!authStore.user || !powerSyncStore.powerSync) return;

  isRequesting.value = true;
  try {
    // Use PowerSync to create join request (works offline, will sync to Supabase)
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await powerSyncStore.powerSync.execute(
      "INSERT INTO location_requests (id, location_id, user_id, user_email, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [
        requestId,
        locationId,
        authStore.user.id,
        authStore.user.email || null,
        "pending",
        new Date().toISOString(),
      ],
    );

    toast.add({
      severity: "success",
      summary: "Success",
      detail: "Join request sent",
    });

    emit("close");
  } catch (error) {
    console.error("Error sending join request:", error);
    toast.add({
      severity: "error",
      summary: "Error",
      detail: "Failed to send join request",
    });
  } finally {
    isRequesting.value = false;
  }
};

onMounted(() => {
  loadPublicLocations();
});
</script>

<Card>{#snippet title()}<div class="flex items-center justify-between"><span>Join a cemetery</span><Button icon="pi pi-times" text rounded onclick={(event) => {  emit('close') }}></Button></div>{/snippet}{#snippet content()}<div class="space-y-4"><InputText class="w-full" bind:value={searchQuery.value} placeholder="Search locations..."></InputText>{#if isLoading.value}<div class="text-center py-4"><ProgressSpinner></ProgressSpinner></div>{:else if filteredLocations.value.length === 0}<div class="text-center py-4 text-surface-500"> No public locations found </div>{:else}<div class="space-y-2">{#each filteredLocations.value as location (location.id)}<div class="p-4 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"><div class="flex items-center justify-between"><div><h3 class="font-semibold">{location.name}</h3><p class="text-sm text-surface-600">{location.description || "No description"}</p></div><Button disabled={isRequesting.value} size="small" onclick={(event) => {  requestToJoin(location.id) }}> Request to Join </Button></div></div>{/each}</div>{/if}</div>{/snippet}</Card>
