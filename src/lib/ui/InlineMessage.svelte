<script lang="ts">
  import Message from "./Message.svelte";
  import type { Snippet } from "svelte";

  let { severity = "error", closable = false, children }: { severity?: string; closable?: boolean; children?: Snippet } =
    $props();
</script>

<Message {severity} {closable}>{#if children}{@render children()}{/if}</Message>
