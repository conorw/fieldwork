<script lang="ts">
  let {
    value = $bindable(false),
    binary: _binary = true,
    inputId = undefined,
    class: className = "",
    disabled = false,
  }: {
    value?: boolean;
    binary?: boolean;
    inputId?: string;
    class?: string;
    disabled?: boolean;
  } = $props();
</script>

<input id={inputId} type="checkbox" bind:checked={value} {disabled} class="h-4 w-4 {className}" />
