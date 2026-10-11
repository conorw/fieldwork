import { json } from "./env";
import { analyzeHeadstoneWithOpenAI } from "./lib/analyzeHeadstone";

export async function handleAnalyzeHeadstone(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return json(
      { error: "Method Not Allowed", message: "Only POST is supported" },
      405,
    );
  }

  try {
    const body = (await request.json()) as {
      imageData?: string;
      mimeType?: string;
    };
    if (!body.imageData) {
      return json({ error: "Missing imageData", success: false }, 400);
    }
    if (!body.mimeType) {
      return json({ error: "Missing mimeType", success: false }, 400);
    }
    const supported = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!supported.includes(body.mimeType.toLowerCase())) {
      return json({ error: "Unsupported image format", success: false }, 400);
    }

    const analysis = await analyzeHeadstoneWithOpenAI(
      body.imageData,
      body.mimeType,
    );
    return json({
      success: true,
      persons: analysis.persons,
      full_text_transcription: analysis.full_text_transcription,
      shared_epitaph: analysis.shared_epitaph,
      physical: analysis.physical,
      metadata: {
        analysis_timestamp: new Date().toISOString(),
        model_used: "gpt-4o-mini",
        confidence_level: "high",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("OPENAI_API_KEY") ? 500 : 500;
    return json(
      { error: "Analysis Failed", message, success: false },
      status,
    );
  }
}
