<script lang="ts">
import { cls } from "$lib/ui/cls";
let { children } = $props();
import Avatar from "$lib/ui/Avatar.svelte";
import Button from "$lib/ui/Button.svelte";
import Toolbar from "$lib/ui/Toolbar.svelte";

import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useLocationsStore } from "../../stores/locations";
import { useAuthStore } from "../../stores/auth";
import { useOnline } from "@vueuse/core";
import InstallPrompt from "../InstallPrompt.svelte";
import CemeterySwitcher from "../CemeterySwitcher.svelte";
import CemeteryChat from "../CemeteryChat.svelte";

const route = useRoute();
const router = useRouter();
const locationsStore = useLocationsStore();
const authStore = useAuthStore();
const showCemeteries = ref(false);
const showAssistant = ref(false);

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

const openAssistant = () => {
  showAssistant.value = !showAssistant.value;
};
</script>

<div class="flex h-full min-h-0 flex-col overflow-hidden bg-surface-50"><Toolbar class="border-0 border-b-1 surface-border">{#snippet start()}<div class="flex min-w-0 items-center gap-2"><button class="flex min-w-0 items-center gap-1 rounded-lg px-1 py-1 text-left transition-colors hover:bg-surface-100" type="button" title={
              locationName.value ? `Switch cemetery (${locationName})` : 'Choose a cemetery'
            } aria-expanded={showCemeteries.value} aria-haspopup="dialog" onclick={(event) => {  showCemeteries.value = true }}><h1 class="max-w-[45vw] truncate text-lg font-semibold text-surface-900 sm:max-w-none sm:text-xl">{locationName.value || "Choose a cemetery"}</h1><i class="pi pi-angle-down text-xs text-surface-500"></i></button>{#if !isOnline.value}<span class="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800" role="status"><i class="pi pi-wifi text-[10px]"></i><span class="hidden sm:inline">Offline — saved on device</span><span class="sm:hidden">Offline</span></span>{/if}</div>{/snippet}{#snippet end()}<div class="flex items-center gap-1"><nav class="hidden items-center gap-1 sm:flex" aria-label="Main">{#each navItems as item (item.to)}<a href={item.to} class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors {cls(
                isActive(item.to)
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900'
              )}" aria-current={isActive(item.to) ? 'page' : undefined}><i class={cls(['pi', item.icon])}></i><span>{item.label}</span></a>{/each}</nav>{#if authStore.isAuthenticated}<div class="relative z-30 flex items-center gap-2 border-l border-surface-200 pl-2 sm:ml-2"><button class="flex h-10 w-10 items-center justify-center rounded-full text-surface-700 hover:bg-surface-100" type="button" title="Cemetery assistant" aria-label="Cemetery assistant" aria-expanded={showAssistant.value} onclick={(event) => { event.stopPropagation(); openAssistant(event) }}><i class="pi pi-comments" aria-hidden="true"></i></button><Avatar class="h-8 w-8" label={userInitials.value} shape="circle" title={authStore.user?.email || ''}></Avatar><Button icon="pi pi-sign-out" text rounded severity="secondary" title="Sign out" aria-label="Sign out" onclick={handleLogout}></Button></div>{/if}</div>{/snippet}</Toolbar><main class="min-h-0 flex-1 overflow-hidden">{@render children?.()}</main><nav class="shrink-0 border-t border-surface-200 bg-surface-0 pb-[env(safe-area-inset-bottom)] sm:hidden" aria-label="Main"><div class="flex">{#each navItems as item (item.to)}<a href={item.to} class="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 transition-colors active:bg-surface-100 {cls(isActive(item.to) ? 'text-primary-600' : 'text-surface-500')}" aria-current={isActive(item.to) ? 'page' : undefined}><i class={cls(['pi', item.icon, 'text-lg'])}></i><span class="text-[11px] font-medium">{item.label}</span></a>{/each}</div></nav><CemeterySwitcher bind:visible={showCemeteries.value}></CemeterySwitcher><CemeteryChat visible={showAssistant.value} onUpdateVisible={(event) => {  showAssistant.value = event }}></CemeteryChat><InstallPrompt></InstallPrompt></div>
