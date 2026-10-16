<script lang="ts">
  import type { Snippet } from "svelte";
  let { header, children }: { header?: Snippet; children?: Snippet } = $props();
</script>

<details class="group" open>
  <summary class="cursor-pointer list-none px-4 py-3 font-medium text-surface-900">
    {#if header}{@render header()}{/if}
  </summary>
  <div class="px-4 pb-4">
    {#if children}{@render children()}{/if}
  </div>
</details>
