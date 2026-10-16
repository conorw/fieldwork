<script lang="ts">
  let {
    value = $bindable(""),
    class: className = "",
    rows = 4,
    ...rest
  }: {
    value?: string;
    class?: string;
    rows?: number;
    [key: string]: unknown;
  } = $props();
</script>

<textarea
  bind:value
  {rows}
  class="w-full rounded-lg border border-surface-300 bg-surface-0 px-3 py-2 text-surface-900 {className}"
  {...rest}
></textarea>
