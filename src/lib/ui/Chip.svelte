<script lang="ts">
  let { label = "", severity = "secondary", class: className = "" }: { label?: string; severity?: string; class?: string } =
    $props();
</script>

<span class="inline-flex rounded-full bg-surface-100 px-2 py-0.5 text-xs font-medium text-surface-700 {className}">
  {label || severity}
</span>
