<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    label = "",
    icon = "",
    severity = "primary",
    text = false,
    rounded = false,
    outlined = false,
    loading = false,
    disabled = false,
    type = "button",
    title = undefined,
    size = "normal",
    class: className = "",
    onclick,
    children,
    ...rest
  }: {
    label?: string;
    icon?: string;
    severity?: string;
    text?: boolean;
    rounded?: boolean;
    outlined?: boolean;
    loading?: boolean;
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
    title?: string;
    size?: string;
    class?: string;
    onclick?: (event: MouseEvent) => void;
    children?: Snippet;
    [key: string]: unknown;
  } = $props();

  const tone =
    severity === "danger"
      ? "text-red-700 hover:bg-red-50"
      : severity === "secondary" || severity === "contrast"
        ? "text-surface-700 hover:bg-surface-100"
        : "text-white bg-primary-600 hover:bg-primary-700";
</script>

<button
  {...rest}
  {type}
  {title}
  class="inline-flex items-center justify-center gap-2 font-medium disabled:opacity-50 {size === 'small'
    ? 'min-h-8 px-2 py-1 text-xs'
    : size === 'large'
      ? 'min-h-12 px-4 py-3 text-base'
      : 'min-h-10 px-3 py-2 text-sm'} {rounded}
    ? 'rounded-full'
    : 'rounded-lg'} {text || outlined ? 'bg-transparent' : ''} {text || outlined
    ? severity === 'danger'
      ? 'text-red-700'
      : 'text-surface-700 hover:bg-surface-100'
    : tone} {className}"
  disabled={disabled || loading}
  {onclick}
>
  {#if loading}
    <i class="pi pi-spin pi-spinner"></i>
  {:else if icon}
    <i class={icon}></i>
  {/if}
  {#if label}<span>{label}</span>{/if}
  {#if children}{@render children()}{/if}
</button>
