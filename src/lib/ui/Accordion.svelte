<script lang="ts">
  import type { Snippet } from "svelte";
  let { children, class: className = "" }: { children?: Snippet; class?: string } = $props();
</script>

<div class="divide-y divide-surface-200 overflow-hidden rounded-xl border border-surface-200 bg-surface-0 {className}">
  {#if children}{@render children()}{/if}
</div>
