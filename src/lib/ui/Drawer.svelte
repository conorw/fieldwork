<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    visible = $bindable(false),
    header = "",
    position = "left",
    class: className = "",
    children,
  }: {
    visible?: boolean;
    header?: string;
    position?: string;
    class?: string;
    children?: Snippet;
  } = $props();
</script>

{#if visible}
  <div class="fixed inset-0 z-50">
    <button type="button" class="absolute inset-0 bg-black/40" aria-label="Close panel" onclick={() => (visible = false)}></button>
    <aside
      class="absolute top-0 flex h-full w-full max-w-sm flex-col bg-surface-0 p-4 text-surface-900 shadow-xl {position === 'right' ? 'right-0' : 'left-0'} {className}"
      role="dialog"
    >
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-lg font-semibold">{header}</h2>
        <button type="button" aria-label="Close" onclick={() => (visible = false)}>×</button>
      </div>
      <div class="min-h-0 flex-1 overflow-auto">
        {#if children}{@render children()}{/if}
      </div>
    </aside>
  </div>
{/if}
