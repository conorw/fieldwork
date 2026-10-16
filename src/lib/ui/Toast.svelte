<script lang="ts">
  import { toastItems } from "./toasts.svelte";
  const items = $derived(toastItems());
</script>

<div class="pointer-events-none fixed left-1/2 top-4 z-[80] flex w-[min(24rem,calc(100%-2rem))] -translate-x-1/2 flex-col gap-2">
  {#each items as toast (toast.id)}
    <div
      class="pointer-events-auto rounded-lg px-4 py-3 text-sm text-white shadow-lg {toast.severity === 'error'
        ? 'bg-red-700'
        : toast.severity === 'success'
          ? 'bg-emerald-700'
          : toast.severity === 'warn'
            ? 'bg-amber-700'
            : 'bg-slate-800'}"
      role="status"
    >
      {#if toast.summary}<p class="font-semibold">{toast.summary}</p>{/if}
      {#if toast.detail}<p>{toast.detail}</p>{/if}
    </div>
  {/each}
</div>
