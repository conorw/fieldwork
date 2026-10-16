<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    class: className = "",
    start,
    end,
    children,
  }: {
    class?: string;
    start?: Snippet;
    end?: Snippet;
    children?: Snippet;
  } = $props();
</script>

<div class="flex items-center justify-between gap-2 border-b border-surface-200 bg-surface-0 px-3 py-2 {className}">
  <div class="min-w-0">{#if start}{@render start()}{:else if children}{@render children()}{/if}</div>
  <div class="flex items-center">{#if end}{@render end()}{/if}</div>
</div>
