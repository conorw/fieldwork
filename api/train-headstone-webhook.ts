// Webhook for Hugging Face Jobs training completion.
// Verifies TRAIN_WEBHOOK_SECRET, updates location adapter metadata,
// and publishes the shared global adapter so every cemetery benefits.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  getSupabaseAdmin,
  updateLocationAiState,
  upsertGlobalAdapter,
} from "./lib/trainHelpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const secret = process.env.TRAIN_WEBHOOK_SECRET;
    if (!secret) {
      return res.status(500).json({ error: "TRAIN_WEBHOOK_SECRET not configured" });
    }

    const headerSecret =
      (req.headers["x-train-webhook-secret"] as string) ||
      (req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "");

    if (!headerSecret || headerSecret !== secret) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const locationId = body?.locationId as string | undefined;
    const status = body?.status as "success" | "failure" | undefined;

    if (!locationId || !status) {
      return res
        .status(400)
        .json({ error: "locationId and status are required" });
    }

    const admin = getSupabaseAdmin();

    if (status === "success") {
      const adapterUrl = body.adapterUrl as string | undefined;
      const adapterVersion = body.adapterVersion as string | undefined;
      const exportMode = body.exportMode as string | undefined;
      if (!adapterUrl || !adapterVersion) {
        return res.status(400).json({
          error: "adapterUrl and adapterVersion required on success",
        });
      }
      // On-device Transformers.js requires merged ONNX — reject missing/non-onnx
      if (exportMode !== "onnx") {
        await updateLocationAiState(admin, locationId, {
          ai_status: "error",
          ai_train_error:
            "Offline model export failed (ONNX required). Online reading still works.",
          ai_train_job_id: body.jobId ?? null,
        });
        return res.status(200).json({ ok: true, ai_status: "error" });
      }

      await updateLocationAiState(admin, locationId, {
        ai_status: "local",
        adapter_url: adapterUrl,
        adapter_version: adapterVersion,
        ai_train_error: null,
        ai_train_job_id: body.jobId ?? null,
      });

      // Broadcast smarter shared weights to all cemeteries / clients
      const globalAdapterUrl = body.globalAdapterUrl as string | undefined;
      const globalAdapterVersion =
        (body.globalAdapterVersion as string | undefined) || adapterVersion;
      let globalPersisted = false;
      if (globalAdapterUrl) {
        try {
          await upsertGlobalAdapter(admin, {
            global_adapter_url: globalAdapterUrl.replace(/\/?$/, "/"),
            global_adapter_version: globalAdapterVersion,
            notes: `Updated from location ${locationId}`,
          });
          globalPersisted = true;
        } catch (e) {
          console.error("upsertGlobalAdapter failed:", e);
        }
      }

      return res.status(200).json({
        ok: true,
        ai_status: "local",
        globalAdapterUrl: globalAdapterUrl ?? null,
        globalAdapterVersion: globalAdapterVersion ?? null,
        globalPersisted,
      });
    }

    await updateLocationAiState(admin, locationId, {
      ai_status: "error",
      ai_train_error: body.error || "Training failed",
      ai_train_job_id: body.jobId ?? null,
    });

    // Stay usable on GPT — clients treat error like teacher with a banner
    return res.status(200).json({ ok: true, ai_status: "error" });
  } catch (err) {
    console.error("train-headstone-webhook error:", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
