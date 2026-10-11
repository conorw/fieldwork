import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

type ResCapture = {
  statusCode: number;
  body: any;
  headers: Record<string, string>;
};

/**
 * Invoke a Worker-style fetch handler with a synthetic Request.
 */
export async function invokeHandler(
  handler: (request: Request) => Promise<Response>,
  options: {
    method?: string;
    url?: string;
    headers?: Record<string, string | undefined>;
    body?: unknown;
    query?: Record<string, string>;
  } = {},
): Promise<ResCapture> {
  const method = options.method || "GET";
  const headers = new Headers();
  for (const [name, value] of Object.entries(options.headers || {})) {
    if (value !== undefined) headers.set(name, value);
  }
  const proto = headers.get("x-forwarded-proto") || "http";
  const host = headers.get("host") || "localhost";
  const url = new URL(options.url || "/", `${proto}://${host}`);
  for (const [key, value] of Object.entries(options.query || {})) {
    url.searchParams.set(key, value);
  }

  let body: string | undefined;
  if (options.body !== undefined && method !== "GET" && method !== "HEAD") {
    body = JSON.stringify(options.body);
    headers.set("content-type", "application/json");
  }

  const response = await handler(new Request(url, { method, headers, body }));
  const raw = await response.text();
  let parsed: unknown = raw;
  try {
    parsed = raw ? JSON.parse(raw) : undefined;
  } catch {
    // non-JSON body
  }
  return {
    statusCode: response.status,
    body: parsed,
    headers: Object.fromEntries(response.headers.entries()),
  };
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
