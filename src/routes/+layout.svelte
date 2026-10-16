<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { computed, onUnmounted, ref, watch } from "vue";
  import { hideNavbar, routeGuard } from "@/compat/router";
  import { useToast } from "primevue/usetoast";
  import ConfirmDialog from "$lib/ui/ConfirmDialog.svelte";
  import Toast from "$lib/ui/Toast.svelte";
  import MainLayout from "@/components/layouts/MainLayout.svelte";
  import { boot } from "$lib/boot";
  import { toastService } from "@/services/toastService";
  import { useAuthStore } from "@/stores/auth";
  import { useLocationsStore } from "@/stores/locations";
  import { syncFieldAgentTools } from "@/services/agentTools/install";
  import { ensureLocalModelForLocation, ensureSharedLocalModel } from "@/services/adapterInstallService";
  import { onLocationBecameLocal } from "@/services/autoTrainService";
  import { onGlobalAdapterUpdated, startGlobalAdapterPolling } from "@/services/globalAdapterService";
  import { absorbGlobalForLocation, startGlobalLearningSync } from "@/services/globalLearningService";
  import "primeicons/primeicons.css";
  import "../style.css";

  let { children } = $props();
  let ready = $state(false);

  const toast = useToast();
  const authStore = useAuthStore();
  const locationsStore = useLocationsStore();

  $effect(() => {
    const path = page.url.pathname;
    const search = page.url.search;
    let cancelled = false;
    ready = false;
    routeGuard(path, search, authStore)
      .then((redirect) => {
        if (cancelled) return;
        if (redirect) {
          goto(redirect, { replaceState: true });
          return;
        }
        ready = true;
      })
      .catch((error) => {
        console.error("Route guard failed:", error);
        if (!cancelled) ready = true;
      });
    return () => {
      cancelled = true;
    };
  });

  watch(
    () => authStore.isAuthenticated && !!locationsStore.selectedLocation,
    (active) => {
      syncFieldAgentTools(Boolean(active)).catch((err) =>
        console.warn("WebMCP tool registration:", err),
      );
    },
    { immediate: true },
  );

  onUnmounted(() => {
    syncFieldAgentTools(false).catch((err) =>
      console.warn("WebMCP tool registration:", err),
    );
  });

  const bare = computed(() => hideNavbar(page.url.pathname));

  const llmDownloading = ref(false);
  const llmProgress = ref(0);
  const aiBanner = ref("");
  const prevAiStatus = ref("");

  watch(
    () => locationsStore.selectedLocation,
    (loc) => {
      if (!loc) {
        aiBanner.value = "";
        return;
      }
      if (loc.aiStatus === "training") {
        aiBanner.value = "Improving the shared model in the background…";
      } else if (loc.aiStatus === "error") {
        aiBanner.value =
          loc.aiTrainError ||
          "Shared-model training needs attention — on-device reading still works.";
      } else {
        aiBanner.value = "";
      }

      if (loc.aiStatus === "local" && prevAiStatus.value && prevAiStatus.value !== "local") {
        onLocationBecameLocal(loc).catch((err) => console.warn("Adapter install:", err));
      }
      prevAiStatus.value = loc.aiStatus || "";
    },
    { immediate: true, deep: true },
  );

  onMount(() => {
    toastService.init(toast.add.bind(toast));
    boot();

    const handleProgress = (event: Event) => {
      const detail = (event as CustomEvent<{ progress: number }>).detail;
      llmDownloading.value = true;
      llmProgress.value = detail?.progress ?? 0;
    };
    const handleComplete = () => {
      llmDownloading.value = false;
    };

    window.addEventListener("llm-download-progress", handleProgress);
    window.addEventListener("llm-download-complete", handleComplete);
    window.addEventListener("llm-load-error", handleComplete);

    ensureSharedLocalModel().catch((err) => console.warn("Shared model download deferred:", err));

    const stopLocationWatch = watch(
      () => locationsStore.selectedLocation,
      (loc) => {
        if (loc?.aiStatus === "local" && loc.adapterUrl) {
          ensureLocalModelForLocation(loc).catch((err) =>
            console.warn("Adapter install deferred:", err),
          );
          absorbGlobalForLocation(loc).catch((err) => console.warn("Global absorb deferred:", err));
        } else if (loc) {
          ensureSharedLocalModel().catch((err) =>
            console.warn("Shared model download deferred:", err),
          );
        }
      },
      { immediate: true },
    );

    const stopGlobalPoll = startGlobalAdapterPolling();
    const stopGlobalLearn = startGlobalLearningSync();
    const stopSharedReload = onGlobalAdapterUpdated(() => {
      const loc = locationsStore.selectedLocation;
      if (loc?.aiStatus === "local" && loc.adapterUrl) return;
      ensureSharedLocalModel().catch((err) => console.warn("Shared model download deferred:", err));
    });

    return () => {
      window.removeEventListener("llm-download-progress", handleProgress);
      window.removeEventListener("llm-download-complete", handleComplete);
      window.removeEventListener("llm-load-error", handleComplete);
      stopLocationWatch();
      stopGlobalPoll();
      stopGlobalLearn();
      stopSharedReload();
    };
  });
</script>

<div id="app" class="flex h-full min-h-0 flex-col">
  {#if llmDownloading.value}
    <div
      class="shrink-0 bg-blue-600 text-white text-xs py-1 px-4 text-center shadow-md flex items-center justify-center gap-2"
      role="status"
    >
      <i class="pi pi-spin pi-spinner text-xs"></i>
      <span>Preparing on-device headstone reading… {llmProgress.value.toFixed(0)}%</span>
    </div>
  {/if}
  {#if aiBanner.value}
    <div class="shrink-0 bg-amber-600 text-white text-xs py-1 px-4 text-center" role="status">
      {aiBanner.value}
    </div>
  {/if}
  {#if ready}
    {#if bare.value}
      {@render children?.()}
    {:else}
      <MainLayout>
        {@render children?.()}
      </MainLayout>
    {/if}
  {/if}
  <Toast />
  <ConfirmDialog />
</div>
