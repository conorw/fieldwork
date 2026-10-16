<script lang="ts">
  let {
    value = $bindable(""),
    options = [],
    optionLabel = "label",
    optionValue = "value",
    placeholder = "",
    class: className = "",
    disabled = false,
    ...rest
  }: {
    value?: unknown;
    options?: unknown[];
    optionLabel?: string;
    optionValue?: string;
    placeholder?: string;
    class?: string;
    disabled?: boolean;
    [key: string]: unknown;
  } = $props();

  function labelOf(option: unknown) {
    if (option && typeof option === "object") return String((option as Record<string, unknown>)[optionLabel] ?? "");
    return String(option ?? "");
  }
  function valueOf(option: unknown) {
    if (option && typeof option === "object" && optionValue in (option as object)) {
      return (option as Record<string, unknown>)[optionValue];
    }
    return option;
  }
</script>

<select
  class="w-full rounded-lg border border-surface-300 bg-surface-0 px-3 py-2 text-surface-900 {className}"
  {disabled}
  value={value == null ? "" : String(value)}
  onchange={(event) => {
    const selected = (options ?? []).find((option) => String(valueOf(option)) === event.currentTarget.value);
    value = selected === undefined ? event.currentTarget.value : valueOf(selected);
  }}
  {...rest}
>
  {#if placeholder}
    <option value="" disabled>{placeholder}</option>
  {/if}
  {#each options ?? [] as option, index (index)}
    <option value={String(valueOf(option) ?? "")}>{labelOf(option)}</option>
  {/each}
</select>
