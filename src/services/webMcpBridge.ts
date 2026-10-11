import type { AgentToolRegistry } from "./agentTools/registry";

/**
 * Publish the registry to a browser agent. Missing WebMCP is a no-op so
 * Capacitor and other browsers keep working. Abort the signal to drop the tools.
 */
export async function registerWebMcpTools(
  registry: AgentToolRegistry,
  signal: AbortSignal,
): Promise<void> {
  if (typeof document === "undefined") return;
  const modelContext = document.modelContext;
  if (!modelContext || typeof modelContext.registerTool !== "function") return;

  for (const tool of registry.list()) {
    if (signal.aborted) return;
    await modelContext.registerTool(
      {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: { readOnlyHint: tool.readOnly },
        execute: async (input) =>
          registry.execute(tool.name, input ?? {}),
      },
      { signal },
    );
  }
}
