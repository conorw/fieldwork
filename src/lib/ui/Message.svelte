<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    severity = "info",
    closable = false,
    class: className = "",
    icon,
    children,
  }: {
    severity?: string;
    closable?: boolean;
    class?: string;
    icon?: Snippet;
    children?: Snippet;
  } = $props();

  let open = $state(true);
  const tone =
    severity === "error"
      ? "bg-red-50 text-red-800"
      : severity === "success"
        ? "bg-emerald-50 text-emerald-800"
        : severity === "warn"
          ? "bg-amber-50 text-amber-800"
          : "bg-sky-50 text-sky-800";
</script>

{#if open}
  <div class="flex items-start justify-between gap-2 rounded-lg px-3 py-2 text-sm {tone} {className}" role="status">
    <div class="flex items-start gap-2">
      {#if icon}{@render icon()}{/if}
      <div>{#if children}{@render children()}{/if}</div>
    </div>
    {#if closable}
      <button type="button" onclick={() => (open = false)} aria-label="Dismiss">×</button>
    {/if}
  </div>
{/if}
