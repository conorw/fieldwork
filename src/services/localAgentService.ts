import { getFieldAgentRegistry } from "./agentTools/install";
import {
  formatToolTrace,
  incompleteAssistantMessage,
  parsePromptResult,
  presentToolResult,
  routeAssistantMessage,
  toolResponsePrompt,
  type AssistantMessage,
  type ToolTrace,
} from "./agentReply";
import { useLocationsStore } from "../stores/locations";

const SESSION_OPTIONS = {
  expectedInputs: [
    { type: "text", languages: ["en"] },
    { type: "tool-response" },
  ],
  expectedOutputs: [
    { type: "text", languages: ["en"] },
    { type: "tool-call" },
  ],
};

const SYSTEM_PROMPT = `You help record and look up graves in the cemetery that is currently open in Fieldwork.
Answer only from tool results. Never invent people, plots, plot numbers, or dates.
If a tool returns no matches, say that nothing was found.
If a tool returns an error, explain that error briefly and do not guess a result.
Use search_people for name questions. Use focus_plot when asked to show a plot.`;

const UNAVAILABLE =
  "The on-device assistant is unavailable in this browser. It needs desktop Chrome with the Prompt API and chrome://flags/#prompt-api-tool-use enabled.";

export interface AssistantAvailability {
  state: "ready" | "downloadable" | "unavailable";
  reason?: string;
}

interface LanguageModelHost {
  LanguageModel?: LanguageModelFactory;
}

const toolListener: {
  current: ((name: string, resultJson: string) => void) | null;
} = {
  current: null,
};

let session: LanguageModelSession | null = null;
let sessionLocationId: string | null = null;

function languageModel(): LanguageModelFactory | null {
  return (globalThis as LanguageModelHost).LanguageModel ?? null;
}

function unavailableStatus(status: string): boolean {
  return status === "unavailable" || status === "no";
}

export function resetCemeteryAssistant(): void {
  session?.destroy?.();
  session = null;
  sessionLocationId = null;
}

export async function prepareCemeteryAssistant(): Promise<AssistantAvailability> {
  const model = languageModel();
  if (!model) return { state: "unavailable", reason: UNAVAILABLE };
  try {
    const status = await model.availability(SESSION_OPTIONS);
    if (unavailableStatus(status)) {
      return { state: "unavailable", reason: UNAVAILABLE };
    }
    if (status === "downloadable" || status === "downloading" || status === "after-download") {
      return { state: "downloadable" };
    }
    return { state: "ready" };
  } catch {
    return { state: "unavailable", reason: UNAVAILABLE };
  }
}

async function ensureSession(
  onDownload?: (progress: number) => void,
): Promise<LanguageModelSession> {
  const locationId = useLocationsStore().selectedLocation?.id ?? null;
  if (session && sessionLocationId !== locationId) {
    resetCemeteryAssistant();
  }
  if (session) return session;

  const model = languageModel();
  if (!model) throw new Error(UNAVAILABLE);

  const created = await model.create({
    ...SESSION_OPTIONS,
    initialPrompts: [{ role: "system", content: SYSTEM_PROMPT }],
    tools: getFieldAgentRegistry().toLanguageModelTools((name, resultJson) => {
      toolListener.current?.(name, resultJson);
    }),
    monitor(monitor: EventTarget) {
      monitor.addEventListener("downloadprogress", (event) => {
        const progress = event as Event & { loaded?: number };
        if (typeof progress.loaded === "number") {
          onDownload?.(Math.round(progress.loaded * 100));
        }
      });
    },
  });
  session = created;
  sessionLocationId = locationId;
  return created;
}

export async function askCemeteryAssistant(
  message: string,
  hooks?: {
    onTool?: (name: string) => void;
    onDownload?: (progress: number) => void;
  },
): Promise<AssistantMessage> {
  const text = message.trim();
  if (!text) throw new Error("Enter a question first.");
  if (!useLocationsStore().selectedLocation) {
    throw new Error("Choose a cemetery first.");
  }
  const incomplete = incompleteAssistantMessage(text);
  if (incomplete) throw new Error(incomplete);

  const registry = getFieldAgentRegistry();
  const route = routeAssistantMessage(text);
  if (route) {
    hooks?.onTool?.(route.name);
    const outcome = await registry.execute(route.name, route.input);
    return presentToolResult(route.name, JSON.stringify(outcome));
  }

  const trace: ToolTrace[] = [];
  toolListener.current = (name, resultJson) => {
    hooks?.onTool?.(name);
    trace.push({ name, json: resultJson });
  };
  try {
    const active = await ensureSession(hooks?.onDownload);
    let pending: string | unknown[] = text;
    let ranToolsManually = false;

    for (let step = 0; step < 3; step += 1) {
      const before = trace.length;
      let result: unknown;
      try {
        result = await active.prompt(pending);
      } catch (error) {
        if (trace.length) return { text: formatToolTrace(trace) };
        throw error;
      }

      const parsed = parsePromptResult(result);
      const executedByBrowser = trace.length > before;
      if (parsed.text) return { text: parsed.text };

      if (parsed.toolCalls.length > 0 && !executedByBrowser && !ranToolsManually) {
        ranToolsManually = true;
        const calls = [];
        for (const call of parsed.toolCalls) {
          hooks?.onTool?.(call.name);
          const outcome = await registry.execute(call.name, call.arguments);
          const json = JSON.stringify(outcome);
          trace.push({ name: call.name, json });
          calls.push({ ...call, json });
        }
        pending = toolResponsePrompt(calls);
        continue;
      }
      break;
    }

    if (trace.length) return { text: formatToolTrace(trace) };
    return { text: "The assistant finished without a written answer." };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    if (/tool use|not enabled|unavailable/i.test(detail)) {
      throw new Error(UNAVAILABLE);
    }
    if (/kErrorUnknown|unknown error/i.test(detail)) {
      resetCemeteryAssistant();
      throw new Error(
        "The on-device model failed. Use an action chip, or ask to list plots or search for a name.",
      );
    }
    throw error instanceof Error ? error : new Error("The assistant failed.");
  } finally {
    toolListener.current = null;
  }
}
