<script lang="ts">
  let { label = "", class: className = "", title = "" }: { label?: string; class?: string; title?: string } = $props();
</script>

<span
  {title}
  class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-800 {className}"
>
  {label}
</span>
