<script lang="ts">
  let {
    value = $bindable(""),
    class: className = "",
    feedback: _feedback = false,
    toggleMask = false,
    ...rest
  }: {
    value?: string;
    class?: string;
    feedback?: boolean;
    toggleMask?: boolean;
    [key: string]: unknown;
  } = $props();

  let shown = $state(false);
</script>

<span class="relative block">
  <input
    type={shown ? "text" : "password"}
    bind:value
    class="w-full rounded-lg border border-surface-300 bg-surface-0 px-3 py-2 text-surface-900 {className}"
    {...rest}
  />
  {#if toggleMask}
    <button
      type="button"
      class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-surface-500"
      onclick={() => (shown = !shown)}
    >
      {shown ? "Hide" : "Show"}
    </button>
  {/if}
</span>
