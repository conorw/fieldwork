<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    class: className = "",
    title,
    header,
    content,
    footer,
    children,
  }: {
    class?: string;
    title?: Snippet;
    header?: Snippet;
    content?: Snippet;
    footer?: Snippet;
    children?: Snippet;
  } = $props();
</script>

<section class="rounded-xl border border-surface-200 bg-surface-0 text-surface-900 shadow-sm {className}">
  {#if header}<div class="border-b border-surface-200 px-4 py-3">{@render header()}</div>{/if}
  {#if title}<h2 class="px-4 pt-4 text-lg font-semibold">{@render title()}</h2>{/if}
  <div class="px-4 py-4">
    {#if content}{@render content()}{:else if children}{@render children()}{/if}
  </div>
  {#if footer}<div class="border-t border-surface-200 px-4 py-3">{@render footer()}</div>{/if}
</section>
