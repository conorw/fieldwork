import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { VercelRequest, VercelResponse } from "@vercel/node";

type ResCapture = {
  statusCode: number;
  body: any;
  headers: Record<string, string>;
};

/**
 * Invoke a Vercel-style default export handler with a fake req/res.
 */
export async function invokeHandler(
  handler: (req: VercelRequest, res: VercelResponse) => unknown,
  options: {
    method?: string;
    url?: string;
    headers?: Record<string, string | string[] | undefined>;
    body?: unknown;
    query?: Record<string, string | string[]>;
  } = {},
): Promise<ResCapture> {
  const capture: ResCapture = { statusCode: 200, body: undefined, headers: {} };

  const req = {
    method: options.method || "GET",
    url: options.url || "/",
    headers: options.headers || {},
    body: options.body,
    query: options.query || {},
  } as unknown as VercelRequest;

  let resolved = false;
  const res = {
    status(code: number) {
      capture.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      capture.body = payload;
      resolved = true;
      return this;
    },
    setHeader(name: string, value: string) {
      capture.headers[name.toLowerCase()] = value;
      return this;
    },
    end(payload?: string) {
      if (payload !== undefined) capture.body = payload;
      resolved = true;
      return this;
    },
  } as unknown as VercelResponse;

  await handler(req, res);

  // Handlers may return a promise that already called json()
  if (!resolved && capture.body === undefined) {
    // allow microtask flush
    await Promise.resolve();
  }

  return capture;
}

/** Tiny local HTTP server for webhook round-trip tests */
export function listenOnce(
  onRequest: (req: IncomingMessage, res: ServerResponse, body: string) => void,
): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        onRequest(req, res, Buffer.concat(chunks).toString("utf8"));
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") throw new Error("no address");
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () =>
          new Promise((r, j) => server.close((e) => (e ? j(e) : r()))),
      });
    });
  });
}
