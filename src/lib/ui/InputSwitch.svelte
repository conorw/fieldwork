<script lang="ts">
  let {
    value = $bindable(false),
    disabled = false,
    class: className = "",
  }: {
    value?: boolean;
    disabled?: boolean;
    class?: string;
  } = $props();
</script>

<button
  type="button"
  role="switch"
  aria-checked={!!value}
  {disabled}
  class="relative h-6 w-11 rounded-full transition-colors {value ? 'bg-primary-600' : 'bg-surface-300'} {className}"
  onclick={() => (value = !value)}
>
  <span class="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all {value ? 'left-5' : 'left-0.5'}"></span>
</button>
