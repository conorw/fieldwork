/**
 * GET /api/global-adapter
 * Public (anon) pointer to the latest shared VLM weights so every client
 * can poll and auto-download smarter models. Never returns cemetery photos.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  getGlobalAdapterRow,
  getSupabaseAdmin,
} from "./lib/trainHelpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Allow CDN/browser caching briefly; clients also poll on an interval
  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");

  try {
    const envUrl =
      process.env.VITE_GLOBAL_ADAPTER_URL ||
      process.env.GLOBAL_ADAPTER_URL ||
      null;

    let row: Awaited<ReturnType<typeof getGlobalAdapterRow>> = null;
    try {
      const admin = getSupabaseAdmin();
      row = await getGlobalAdapterRow(admin);
    } catch (e) {
      console.warn("global-adapter: DB unavailable, using env", e);
    }

    const adapterUrl = (
      row?.global_adapter_url ||
      envUrl ||
      ""
    ).replace(/\/?$/, "/");

    if (!adapterUrl || adapterUrl === "/") {
      return res.status(200).json({
        error: "No global adapter published yet",
        adapterUrl: null,
        version: null,
      });
    }

    return res.status(200).json({
      adapterUrl,
      version: row?.global_adapter_version || "unknown",
      updatedAt: row?.updated_at || new Date().toISOString(),
      source: row?.global_adapter_url ? "database" : "env",
      kind: "global_lora",
      note: "Weights only — no cemetery photos",
    });
  } catch (err) {
    console.error("global-adapter error:", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
