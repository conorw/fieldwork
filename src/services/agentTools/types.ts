export interface JsonSchemaProperty {
  type: "string" | "boolean" | "number";
  description?: string;
  enum?: string[];
}

export interface JsonSchema {
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  readOnly: boolean;
  execute: (input: Record<string, unknown>) => Promise<AgentToolResult>;
}

export interface AgentToolResult {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

export interface LanguageModelToolBinding {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  execute: (input: Record<string, unknown>) => Promise<string>;
}
