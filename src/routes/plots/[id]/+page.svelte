<script lang="ts">
  import { page } from "$app/state";
  import PlotDetail from "@/views/PlotDetail.svelte";
</script>

<PlotDetail id={page.params.id} />
