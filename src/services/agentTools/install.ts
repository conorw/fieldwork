import { createLiveFieldTools } from "./fieldToolsLive";
import { AgentToolRegistry, createAgentToolRegistry } from "./registry";
import { registerWebMcpTools } from "../webMcpBridge";

let registry: AgentToolRegistry | null = null;
let controller: AbortController | null = null;
let generation = 0;

export function getFieldAgentRegistry(): AgentToolRegistry {
  if (!registry) {
    registry = createAgentToolRegistry(createLiveFieldTools());
  }
  return registry;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    registry = null;
  });
}

export async function syncFieldAgentTools(active: boolean): Promise<void> {
  const current = ++generation;
  controller?.abort();
  controller = null;
  if (!active) return;
  const next = new AbortController();
  controller = next;
  await registerWebMcpTools(getFieldAgentRegistry(), next.signal);
  if (current !== generation) next.abort();
}
