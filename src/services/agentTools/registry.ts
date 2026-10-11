import type {
  AgentTool,
  AgentToolResult,
  JsonSchema,
  LanguageModelToolBinding,
} from "./types";

export function validateToolInput(
  schema: JsonSchema,
  input: unknown,
): string | null {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return "Input must be an object.";
  }
  const record = input as Record<string, unknown>;
  for (const key of schema.required ?? []) {
    const value = record[key];
    if (value === undefined || value === null || value === "") {
      return `Missing required field: ${key}.`;
    }
  }
  for (const [key, value] of Object.entries(record)) {
    const property = schema.properties[key];
    if (!property) {
      if (schema.additionalProperties === false) {
        if (key === "geometry") {
          return "Plot geometry cannot be changed from the assistant.";
        }
        return `Unexpected field: ${key}.`;
      }
      continue;
    }
    if (value === undefined || value === null) continue;
    if (property.type === "string" && typeof value !== "string") {
      return `${key} must be a string.`;
    }
    if (property.type === "boolean" && typeof value !== "boolean") {
      return `${key} must be a boolean.`;
    }
    if (property.type === "number" && typeof value !== "number") {
      return `${key} must be a number.`;
    }
    if (property.enum && !property.enum.includes(String(value))) {
      return `${key} must be one of: ${property.enum.join(", ")}.`;
    }
  }
  return null;
}

function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class AgentToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  register(tool: AgentTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  registerAll(tools: AgentTool[]): void {
    for (const tool of tools) this.register(tool);
  }

  list(): AgentTool[] {
    return [...this.tools.values()];
  }

  async execute(
    name: string,
    input: Record<string, unknown> = {},
  ): Promise<AgentToolResult> {
    const tool = this.tools.get(name);
    if (!tool) return { ok: false, error: `Unknown tool: ${name}.` };
    const invalid = validateToolInput(tool.inputSchema, input);
    if (invalid) return { ok: false, error: invalid };
    try {
      return toPlain(await tool.execute(input));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool failed.";
      return { ok: false, error: message };
    }
  }

  toLanguageModelTools(
    onTool?: (name: string, resultJson: string) => void,
  ): LanguageModelToolBinding[] {
    return this.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      execute: async (input: Record<string, unknown> = {}) => {
        const result = await this.execute(tool.name, input ?? {});
        const resultJson = JSON.stringify(result);
        onTool?.(tool.name, resultJson);
        return resultJson;
      },
    }));
  }
}

export function createAgentToolRegistry(
  tools: AgentTool[] = [],
): AgentToolRegistry {
  const registry = new AgentToolRegistry();
  registry.registerAll(tools);
  return registry;
}
