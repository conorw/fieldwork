export {};

declare global {
  interface LanguageModelTool {
    name: string;
    description: string;
    inputSchema: object;
    execute: (input: Record<string, unknown>) => Promise<string>;
  }

  interface LanguageModelSession {
    prompt(input: string | unknown[]): Promise<unknown>;
    destroy?: () => void;
  }

  interface LanguageModelFactory {
    availability(options?: Record<string, unknown>): Promise<string>;
    create(options: Record<string, unknown>): Promise<LanguageModelSession>;
  }
}
