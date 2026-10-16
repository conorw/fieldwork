<script lang="ts">
  let {
    value = $bindable(""),
    class: className = "",
    type = "text",
    ...rest
  }: {
    value?: string | number | null;
    class?: string;
    type?: string;
    [key: string]: unknown;
  } = $props();
</script>

<input
  {type}
  bind:value
  class="w-full rounded-lg border border-surface-300 bg-surface-0 px-3 py-2 text-surface-900 outline-none focus:border-primary-500 {className}"
  {...rest}
/>
