<template>
  <div class="h-full bg-surface-50 p-4">
    <Card v-if="location">
      <template #title>
        <div class="flex items-center justify-between">
          <span>Location Settings: {{ location.name }}</span>
          <Button
            icon="pi pi-arrow-left"
            label="Back"
            text
            @click="router.push('/locations')"
          />
        </div>
      </template>
      <template #content>
        <div class="space-y-6">
          <!-- Location Details -->
          <div>
            <h3 class="text-lg font-semibold mb-4">Location Details</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium mb-1">Name</label>
                <InputText v-model="location.name" class="w-full" />
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Public</label>
                <InputSwitch v-model="location.is_public" />
              </div>
            </div>
            <Button
              @click="saveLocationDetails"
              :loading="isSaving"
              class="mt-4"
            >
              Save Changes
            </Button>
          </div>

          <!-- Members -->
          <LocationMembersList
            :location-id="locationId"
            :user-role="userRole"
          />

          <!-- Invites -->
          <LocationInvitesManager :location-id="locationId" />

          <!-- Requests -->
          <LocationRequestsManager :location-id="locationId" />
        </div>
      </template>
    </Card>
    <div v-else class="text-center py-8">
      <ProgressSpinner />
      <p class="mt-4">Loading location...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { usePowerSyncStore } from "@/stores/powersync";
import { useLocationsStore } from "@/stores/locations";
import Card from "primevue/card";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import InputSwitch from "primevue/inputswitch";
import ProgressSpinner from "primevue/progressspinner";
import LocationMembersList from "@/components/locations/LocationMembersList.vue";
import LocationInvitesManager from "@/components/locations/LocationInvitesManager.vue";
import LocationRequestsManager from "@/components/locations/LocationRequestsManager.vue";
import { useToast } from "primevue/usetoast";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const powerSyncStore = usePowerSyncStore();
const locationsStore = useLocationsStore();
const toast = useToast();

const locationId = route.params.id as string;
const location = ref<any>(null);
const userRole = ref<string | undefined>(undefined);
const isSaving = ref(false);

const loadLocation = async () => {
  try {
    // Wait for PowerSync to be ready
    if (!powerSyncStore.powerSync) {
      console.log(
        "📍 [LocationSettings] PowerSync not initialized, waiting...",
      );
      // Wait up to 10 seconds for PowerSync to initialize
      let waitCount = 0;
      while (!powerSyncStore.powerSync && waitCount < 100) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        waitCount++;
      }

      if (!powerSyncStore.powerSync) {
        throw new Error("PowerSync not initialized after waiting");
      }
    }

    console.log("📍 [LocationSettings] Loading location:", locationId);

    // Load location from PowerSync
    const locData = (await powerSyncStore.powerSync.get(
      "SELECT * FROM locations WHERE id = ?",
      [locationId],
    )) as any;

    if (!locData) {
      console.error("📍 [LocationSettings] Location not found:", locationId);
      toast.add({
        severity: "error",
        summary: "Error",
        detail: "Location not found",
      });
      router.push("/locations");
      return;
    }

    console.log("📍 [LocationSettings] Location loaded:", {
      id: locData.id,
      name: locData.name,
      owner_id: locData.owner_id,
      current_user_id: authStore.user?.id,
    });

    location.value = {
      ...locData,
      name: locData.name,
      is_public: locData.is_public === "true" || locData.is_public === true,
    };

    // Check user role from PowerSync
    if (authStore.user) {
      // First check if user is owner (from locations table)
      const isOwner = locData.owner_id === authStore.user.id;

      if (isOwner) {
        userRole.value = "owner";
        console.log("📍 [LocationSettings] User is owner of location");
      } else {
        // Check location_members table
        const memberData = (await powerSyncStore.powerSync.get(
          "SELECT role FROM location_members WHERE location_id = ? AND user_id = ?",
          [locationId, authStore.user.id],
        )) as any;

        userRole.value = memberData?.role || undefined;
        console.log(
          "📍 [LocationSettings] User role from location_members:",
          userRole.value,
        );
      }

      // Check if user has permission (owner or admin)
      if (userRole.value !== "owner" && userRole.value !== "admin") {
        console.warn(
          "📍 [LocationSettings] Access denied - user role:",
          userRole.value,
        );
        toast.add({
          severity: "warn",
          summary: "Access Denied",
          detail: "You do not have permission to access this page",
        });
        router.push("/locations");
        return;
      }

      console.log(
        "📍 [LocationSettings] Access granted - user role:",
        userRole.value,
      );
    } else {
      console.warn("📍 [LocationSettings] No authenticated user");
      router.push("/auth");
      return;
    }
  } catch (error) {
    console.error("📍 [LocationSettings] Error loading location:", error);
    toast.add({
      severity: "error",
      summary: "Error",
      detail: `Failed to load location: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
    router.push("/locations");
  }
};

const saveLocationDetails = async () => {
  if (!location.value || !powerSyncStore.powerSync) return;

  isSaving.value = true;
  try {
    // Use PowerSync to update location (will sync to Supabase)
    await powerSyncStore.powerSync.execute(
      "UPDATE locations SET name = ?, is_public = ?, date_modified = ? WHERE id = ?",
      [
        location.value.name,
        location.value.is_public ? "true" : "false",
        new Date().toISOString(),
        locationId,
      ],
    );

    // Also update via locations store to refresh local state
    await locationsStore.updateLocation(locationId, {
      name: location.value.name,
      isPublic: location.value.is_public,
    });

    toast.add({
      severity: "success",
      summary: "Success",
      detail: "Location updated",
    });
  } catch (error) {
    console.error("Error saving location:", error);
    toast.add({
      severity: "error",
      summary: "Error",
      detail: "Failed to save location",
    });
  } finally {
    isSaving.value = false;
  }
};

onMounted(() => {
  loadLocation();
});
</script>
