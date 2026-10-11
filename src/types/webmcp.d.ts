export {};

declare global {
  interface ModelContextTool {
    name: string;
    description: string;
    inputSchema: object;
    execute: (
      input: Record<string, unknown>,
    ) => Promise<unknown> | unknown;
    annotations?: {
      readOnlyHint?: boolean;
    };
  }

  interface ModelContext {
    registerTool(
      tool: ModelContextTool,
      options?: { signal?: AbortSignal },
    ): Promise<void>;
  }

  interface Document {
    modelContext?: ModelContext;
  }
}
