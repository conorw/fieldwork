// Local browser-based LLM service for headstone analysis
// All heavy inference is delegated to a Web Worker to avoid Vite import analysis
// issues with @huggingface/transformers and to keep the main thread responsive.

import type { HeadstoneAnalysisResult } from "../utils/headstoneAnalysisService";
import type { PersonData } from "../stores/persons";

interface ModelState {
  isLoaded: boolean;
  isLoading: boolean;
  loadProgress: number;
  error: string | null;
}

class LocalLLMService {
  private modelState: ModelState = {
    isLoaded: false,
    isLoading: false,
    loadProgress: 0,
    error: null,
  };

  private worker: Worker | null = null;
  // Pending promise resolvers for the single in-flight analyze request
  private analyzeResolve: ((text: string) => void) | null = null;
  private analyzeReject: ((err: Error) => void) | null = null;

  private readonly VLM_MODEL = "onnx-community/paligemma-3b-mix-224";

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Spawn the Web Worker and start downloading the model in the background.
   */
  async initialize(): Promise<void> {
    if (this.modelState.isLoaded || this.modelState.isLoading) return;

    try {
      this.modelState.isLoading = true;
      this.modelState.error = null;
      this.modelState.loadProgress = 0;

      this.worker = new Worker(
        new URL("../workers/llmWorker.ts", import.meta.url),
        { type: "module" },
      );

      this.worker.onmessage = (event) => this.handleWorkerMessage(event);
      this.worker.onerror = (err) =>
        this.handleWorkerError(err.message ?? "Worker error");

      this.worker.postMessage({ type: "initialize" });
    } catch (err) {
      this.modelState.isLoading = false;
      this.modelState.error = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  private handleWorkerMessage(event: MessageEvent) {
    const msg = event.data;

    switch (msg.type) {
      case "loading":
        this.modelState.isLoading = true;
        break;

      case "progress":
        this.modelState.loadProgress = msg.progress;
        window.dispatchEvent(
          new CustomEvent("llm-download-progress", {
            detail: { progress: msg.progress },
          }),
        );
        break;

      case "ready":
        this.modelState.isLoaded = true;
        this.modelState.isLoading = false;
        this.modelState.loadProgress = 100;
        window.dispatchEvent(new CustomEvent("llm-download-complete"));
        console.log("✅ LocalLLMService: PaliGemma ready via WebGPU");
        break;

      case "result":
        if (this.analyzeResolve) {
          this.analyzeResolve(msg.text);
          this.analyzeResolve = null;
          this.analyzeReject = null;
        }
        break;

      case "error":
        this.modelState.error = msg.error;
        if (!this.modelState.isLoaded) {
          // Error during loading
          this.modelState.isLoading = false;
          window.dispatchEvent(
            new CustomEvent("llm-load-error", { detail: { error: msg.error } }),
          );
        }
        if (this.analyzeReject) {
          this.analyzeReject(new Error(msg.error));
          this.analyzeResolve = null;
          this.analyzeReject = null;
        }
        break;
    }
  }

  private handleWorkerError(message: string) {
    console.error("❌ LocalLLMService Worker error:", message);
    this.modelState.isLoading = false;
    this.modelState.error = message;
    if (this.analyzeReject) {
      this.analyzeReject(new Error(message));
      this.analyzeResolve = null;
      this.analyzeReject = null;
    }
  }

  // ─── Inference ────────────────────────────────────────────────────────────

  /**
   * Analyze a headstone image using PaliGemma; returns parsed HeadstoneAnalysisResult.
   */
  async analyzeImage(
    imageFile: File,
    _base64Data: string,
  ): Promise<HeadstoneAnalysisResult> {
    if (!this.modelState.isLoaded || !this.worker) {
      throw new Error("Local model is not loaded yet.");
    }

    console.log(
      "[LocalLLMService] analyzeImage called, worker exists:",
      !!this.worker,
    );

    return new Promise((resolve, reject) => {
      const imageUrl = URL.createObjectURL(imageFile);
      const prompt = this.createStructuredPrompt();

      console.log(
        "[LocalLLMService] Created imageUrl, sending analyze message",
      );

      this.analyzeResolve = (text: string) => {
        console.log("[LocalLLMService] Received result, resolving promise");
        URL.revokeObjectURL(imageUrl);
        try {
          resolve(this.parseStructuredOutput(text));
        } catch (e) {
          reject(e);
        }
      };
      this.analyzeReject = (err: Error) => {
        console.log(
          "[LocalLLMService] Received error, rejecting promise:",
          err.message,
        );
        URL.revokeObjectURL(imageUrl);
        reject(err);
      };

      this.worker!.postMessage({ type: "analyze", imageUrl, prompt });
      console.log("[LocalLLMService] Message sent to worker");
    });
  }

  // ─── Prompt & parsing ─────────────────────────────────────────────────────

  private createStructuredPrompt(): string {
    return `Extract deceased person information from this headstone image and return ONLY valid JSON.

Analyze the image and extract:
1. Complete transcription of all visible text (preserve line breaks)
2. All deceased persons mentioned with their details
3. Names, dates, relationships, epitaphs, and any other information

Return a JSON object with this exact structure:
{
  "full_text_transcription": "Complete transcription of all text visible on the headstone, preserving line breaks",
  "persons": [
    {
      "title": "", "forename": "", "middle_name": "", "surname": "", "full_name": "",
      "known_as": "", "maiden_name": "", "gender": "",
      "date_of_birth": "", "date_of_death": "", "age_at_death": null, "time_of_death": "",
      "birth_city": "", "birth_sub_country": "", "birth_country": "",
      "address_line1": "", "address_line2": "", "town": "", "county": "", "country": "", "postcode": "",
      "mobile": "", "landline": "", "email_address": "",
      "marital_status": "", "race": "", "ethnicity": "",
      "deceased": true, "person_of_interest": false, "veteran": false,
      "cause_of_death": "", "notes": ""
    }
  ]
}

Rules:
- Use empty strings "" for missing data
- Set deceased=true for all persons
- Return ONLY the JSON object, no markdown, no explanation.

JSON:`;
  }

  private parseStructuredOutput(
    generatedText: string,
  ): HeadstoneAnalysisResult {
    let parsedData: any = null;

    const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsedData = JSON.parse(jsonMatch[0]);
      } catch {
        console.warn(
          "LocalLLMService: Failed to parse JSON, using raw text fallback",
        );
      }
    }

    if (!parsedData) {
      parsedData = { full_text_transcription: generatedText, persons: [] };
    }
    if (!parsedData.full_text_transcription)
      parsedData.full_text_transcription = "Unrecognized text.";
    if (!Array.isArray(parsedData.persons)) parsedData.persons = [];

    const now = new Date().toISOString();
    const persons: PersonData[] = parsedData.persons.map((p: any) => ({
      id: "",
      plot_id: "",
      title: p.title || "",
      forename: p.forename || "",
      middle_name: p.middle_name || "",
      surname: p.surname || "",
      full_name:
        p.full_name ||
        `${p.forename || ""} ${p.surname || ""}`.trim() ||
        "Unknown",
      known_as: p.known_as || "",
      maiden_name: p.maiden_name || "",
      gender: p.gender || "",
      date_of_birth: p.date_of_birth || "",
      date_of_death: p.date_of_death || "",
      age_at_death: p.age_at_death || null,
      time_of_death: p.time_of_death || "",
      birth_city: p.birth_city || "",
      birth_sub_country: p.birth_sub_country || "",
      birth_country: p.birth_country || "",
      address_line1: p.address_line1 || "",
      address_line2: p.address_line2 || "",
      town: p.town || "",
      county: p.county || "",
      country: p.country || "",
      postcode: p.postcode || "",
      mobile: "",
      landline: "",
      email_address: "",
      marital_status: p.marital_status || "",
      race: p.race || "",
      ethnicity: p.ethnicity || "",
      deceased: true,
      person_of_interest: p.person_of_interest || false,
      veteran: p.veteran || false,
      cause_of_death: p.cause_of_death || "",
      notes: p.notes || "",
      created_by: "local-llm-webgpu",
      date_created: now,
      last_updated_by: "local-llm-webgpu",
      last_updated_datetime: now,
    }));

    return {
      success: true,
      persons,
      full_text_transcription: parsedData.full_text_transcription,
      raw_analysis: generatedText,
      metadata: {
        analysis_timestamp: now,
        model_used: this.VLM_MODEL,
        confidence_level: "high",
      },
    };
  }

  // ─── State accessors ──────────────────────────────────────────────────────

  getState(): ModelState {
    return { ...this.modelState };
  }

  isReady(): boolean {
    return (
      this.modelState.isLoaded &&
      !this.modelState.isLoading &&
      !this.modelState.error
    );
  }

  reset(): void {
    this.worker?.terminate();
    this.worker = null;
    this.modelState = {
      isLoaded: false,
      isLoading: false,
      loadProgress: 0,
      error: null,
    };
  }
}

export const localLLMService = new LocalLLMService();
