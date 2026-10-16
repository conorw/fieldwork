<script lang="ts">
  let { value = "", severity = "secondary", class: className = "" }: { value?: string; severity?: string; class?: string } =
    $props();
</script>

<span class="inline-flex rounded bg-surface-100 px-2 py-0.5 text-xs uppercase text-surface-600 {className}">{value || severity}</span>
