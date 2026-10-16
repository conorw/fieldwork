<script lang="ts">
  import type { Snippet } from "svelte";
  import { styleAttr } from "./cls";

  let {
    visible = $bindable(false),
    header = "",
    modal = false,
    closable = true,
    style = undefined,
    class: className = "",
    children,
  }: {
    visible?: boolean;
    header?: string;
    modal?: boolean;
    closable?: boolean;
    style?: unknown;
    class?: string;
    children?: Snippet;
  } = $props();
</script>

{#if visible}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    {#if modal}
      <button type="button" class="absolute inset-0 bg-black/40" aria-label="Close dialog" onclick={() => (visible = false)}></button>
    {/if}
    <div
      class="relative z-10 max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl bg-surface-0 p-4 text-surface-900 shadow-xl {className}"
      style={styleAttr(style)}
      role="dialog"
      aria-modal={modal}
    >
      <div class="mb-3 flex items-center justify-between gap-3">
        <h2 class="text-lg font-semibold">{header}</h2>
        {#if closable}
          <button type="button" class="text-xl leading-none text-surface-500" aria-label="Close" onclick={() => (visible = false)}>×</button>
        {/if}
      </div>
      {#if children}{@render children()}{/if}
    </div>
  </div>
{/if}
