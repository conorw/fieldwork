<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden bg-surface-50">
    <!-- Top bar -->
    <Toolbar class="border-0 border-b-1 surface-border">
      <template #start>
        <div class="flex min-w-0 items-center gap-2">
          <button
            type="button"
            class="flex min-w-0 items-center gap-1 rounded-lg px-1 py-1 text-left transition-colors hover:bg-surface-100"
            :title="
              locationName ? `Switch cemetery (${locationName})` : 'Choose a cemetery'
            "
            :aria-expanded="showCemeteries"
            aria-haspopup="dialog"
            @click="showCemeteries = true"
          >
            <h1
              class="max-w-[45vw] truncate text-lg font-semibold text-surface-900 sm:max-w-none sm:text-xl"
            >
              {{ locationName || "Choose a cemetery" }}
            </h1>
            <i class="pi pi-angle-down text-xs text-surface-500"></i>
          </button>

          <!-- Offline is normal for a field app, so this reassures rather
               than alarms. -->
          <span
            v-if="!isOnline"
            class="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
            role="status"
          >
            <i class="pi pi-wifi text-[10px]"></i>
            <span class="hidden sm:inline">Offline — saved on device</span>
            <span class="sm:hidden">Offline</span>
          </span>
        </div>
      </template>

      <template #end>
        <div class="flex items-center gap-1">
          <!-- Desktop navigation. Mobile uses the bottom tab bar instead. -->
          <nav class="hidden items-center gap-1 sm:flex" aria-label="Main">
            <router-link
              v-for="item in navItems"
              :key="item.to"
              :to="item.to"
              class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
              :class="
                isActive(item.to)
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900'
              "
              :aria-current="isActive(item.to) ? 'page' : undefined"
            >
              <i :class="['pi', item.icon]"></i>
              <span>{{ item.label }}</span>
            </router-link>
          </nav>

          <div
            v-if="authStore.isAuthenticated"
            class="flex items-center gap-2 border-l border-surface-200 pl-2 sm:ml-2"
          >
            <Avatar
              :label="userInitials"
              shape="circle"
              class="h-8 w-8"
              :title="authStore.user?.email || ''"
            />
            <Button
              icon="pi pi-sign-out"
              text
              rounded
              severity="secondary"
              @click="handleLogout"
              v-tooltip.bottom="'Sign out'"
              aria-label="Sign out"
            />
          </div>
        </div>
      </template>
    </Toolbar>

    <!-- Main Content -->
    <main class="min-h-0 flex-1">
      <router-view />
    </main>

    <!-- Mobile bottom navigation: thumb-reachable, labelled, 56px targets -->
    <nav
      class="shrink-0 border-t border-surface-200 bg-surface-0 pb-[env(safe-area-inset-bottom)] sm:hidden"
      aria-label="Main"
    >
      <div class="flex">
        <router-link
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 transition-colors active:bg-surface-100"
          :class="isActive(item.to) ? 'text-primary-600' : 'text-surface-500'"
          :aria-current="isActive(item.to) ? 'page' : undefined"
        >
          <i :class="['pi', item.icon, 'text-lg']"></i>
          <span class="text-[11px] font-medium">{{ item.label }}</span>
        </router-link>
      </div>
    </nav>

    <CemeterySwitcher v-model:visible="showCemeteries" />

    <!-- Install Prompt -->
    <InstallPrompt />
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useLocationsStore } from "../../stores/locations";
import { useAuthStore } from "../../stores/auth";
import { useOnline } from "@vueuse/core";
import Button from "primevue/button";
import Avatar from "primevue/avatar";
import InstallPrompt from "../InstallPrompt.vue";
import CemeterySwitcher from "../CemeterySwitcher.vue";

const route = useRoute();
const router = useRouter();
const locationsStore = useLocationsStore();
const authStore = useAuthStore();
const showCemeteries = ref(false);

const isOnline = useOnline();
const locationName = computed(
  () => locationsStore.selectedLocation?.name || "",
);

const navItems = [
  { to: "/", label: "Map", icon: "pi-map" },
  { to: "/plots", label: "Plots", icon: "pi-list" },
  { to: "/settings", label: "Settings", icon: "pi-cog" },
];

// "/" is a prefix of every route, so it needs an exact match while the others
// should stay highlighted on nested routes such as /plots/:id.
const isActive = (to) =>
  to === "/" ? route.path === "/" : route.path.startsWith(to);

const userInitials = computed(() => {
  if (!authStore.user) return "?";
  const email = authStore.user.email || "";
  return email.charAt(0).toUpperCase();
});

const handleLogout = async () => {
  await authStore.logout();
  router.push("/auth");
};
</script>
