<script lang="ts">
  let { src = "", alt = "", class: className = "", preview: _preview = false }: { src?: string; alt?: string; class?: string; preview?: boolean } =
    $props();
</script>

<img {src} {alt} class="max-w-full {className}" />
