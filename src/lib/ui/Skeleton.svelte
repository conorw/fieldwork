<script lang="ts">
  let { class: className = "", height = "1rem", width = "100%" }: { class?: string; height?: string; width?: string } =
    $props();
</script>

<div class="animate-pulse rounded bg-surface-200 {className}" style="height: {height}; width: {width}"></div>
