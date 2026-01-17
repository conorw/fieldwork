// Local browser-based LLM service for headstone analysis
// Uses PP-OCRv4 (via Gutenye/ONNX) for text extraction + Text generation for structured output
import { pipeline, env } from "@xenova/transformers";
import { ocrService } from "./ocrService";
import type { HeadstoneAnalysisResult } from "../utils/headstoneAnalysisService";
import type { PersonData } from "../stores/persons";

// Configure Transformers.js to use remote models from Hugging Face
env.allowLocalModels = false;
env.allowRemoteModels = true;

interface ModelState {
  isLoaded: boolean;
  isLoading: boolean;
  loadProgress: number;
  error: string | null;
  ocrServiceReady: boolean;
  textPipeline: any | null;
}

class LocalLLMService {
  private modelState: ModelState = {
    isLoaded: false,
    isLoading: false,
    loadProgress: 0,
    error: null,
    ocrServiceReady: false,
    textPipeline: null,
  };

  // Using PP-OCRv4 (Gutenye/ONNX) for text extraction
  // Text generation model: For creating structured JSON output
  private readonly TEXT_MODEL = "Xenova/gpt2";

  /**
   * Initialize and load both vision and text models
   */
  async initialize(): Promise<void> {
    if (this.modelState.isLoaded) {
      console.log("LocalLLMService: Models already loaded");
        // Ensure OCR service is initialized even if other models are loaded
      if (!this.modelState.ocrServiceReady) {
        console.log("LocalLLMService: OCR service not initialized, initializing now...");
        await ocrService.initialize();
        this.modelState.ocrServiceReady = true;
        console.log("✅ LocalLLMService: OCR service initialized");
      }
      return;
    }

    if (this.modelState.isLoading) {
      console.log("LocalLLMService: Models are already loading, waiting...");
      while (this.modelState.isLoading && !this.modelState.isLoaded) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return;
    }

    this.modelState.isLoading = true;
    this.modelState.error = null;
    this.modelState.loadProgress = 0;

    try {
      console.log("🚀 LocalLLMService: Starting model initialization...");
      console.log("📦 LocalLLMService: OCR: PP-OCRv4 via Gutenye/ONNX");
      console.log("📦 LocalLLMService: Text model:", this.TEXT_MODEL);

      // Initialize OCR service (0-40% progress) - REQUIRED
      console.log(
        "🔍 LocalLLMService: Initializing OCR service for text extraction...",
      );
      await ocrService.initialize();
      this.modelState.ocrServiceReady = true;
      this.modelState.loadProgress = 40;
      console.log("✅ LocalLLMService: OCR service initialized");

      // Create a progress callback for text model
      const progressCallback = (progress: any) => {
        if (progress.progress !== undefined) {
          // Progress for text model (40-100%)
          const modelProgress = progress.progress * 0.6;
          this.modelState.loadProgress = 40 + modelProgress * 100;
          console.log(
            `📥 LocalLLMService: Downloading models... ${this.modelState.loadProgress.toFixed(1)}%`,
          );
        }
        if (progress.status) {
          console.log(`📥 LocalLLMService: ${progress.status}`);
        }
      };

      // Load text generation model (for structured output)
      console.log("📝 LocalLLMService: Loading text generation model...");
      this.modelState.textPipeline = await pipeline(
        "text-generation",
        this.TEXT_MODEL,
        {
          progress_callback: progressCallback,
        },
      );
      console.log("✅ LocalLLMService: Text model loaded");

      this.modelState.isLoaded = true;
      this.modelState.isLoading = false;
      this.modelState.loadProgress = 100;
      console.log("✅ LocalLLMService: All models loaded successfully!");
      console.log("✅ LocalLLMService: Ready for headstone analysis");
    } catch (error) {
      console.error("❌ LocalLLMService: Error loading models:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      // Provide user-friendly error messages
      if (
        errorMessage.includes("Unauthorized") ||
        errorMessage.includes("401")
      ) {
        this.modelState.error =
          "Model not publicly available. The selected model requires authentication or is not accessible.";
        console.error(
          "❌ LocalLLMService: Model access denied (401). This model may not be publicly available.",
        );
      } else if (
        errorMessage.includes("404") ||
        errorMessage.includes("Not Found") ||
        errorMessage.includes("Could not locate file")
      ) {
        this.modelState.error = `Model not found: The selected model does not have the required files or may not exist.`;
        console.error("❌ LocalLLMService: Model file not found (404).");
      } else if (
        errorMessage.includes("ERR_NAME_NOT_RESOLVED") ||
        errorMessage.includes("Failed to fetch") ||
        errorMessage.includes("Network error")
      ) {
        this.modelState.error =
          "Network error: Unable to download models from Hugging Face. Please check your internet connection and try again.";
        console.error(
          "❌ LocalLLMService: Network/DNS error. Check internet connection.",
        );
      } else if (
        errorMessage.includes("403") ||
        errorMessage.includes("Forbidden")
      ) {
        this.modelState.error =
          "Access denied: The model may require authentication or special permissions.";
        console.error("❌ LocalLLMService: Model access denied (403).");
      } else {
        this.modelState.error = errorMessage;
      }

      this.modelState.isLoading = false;
      this.modelState.isLoaded = false;
      throw error;
    }
  }

  /**
   * Analyze a headstone image using vision model + text generation
   */
  async analyzeImage(
    imageFile: File,
    base64Data: string,
  ): Promise<HeadstoneAnalysisResult> {
    try {
      // Ensure models are loaded
      if (!this.modelState.isLoaded) {
        console.log(
          "🔄 LocalLLMService: Models not loaded, initializing now...",
        );
        await this.initialize();
      } else {
        console.log(
          "✅ LocalLLMService: Models already loaded, ready to analyze",
        );
        // If OCR service wasn't initialized before, initialize it now (REQUIRED)
        if (!this.modelState.ocrServiceReady) {
          console.log(
            "🔄 LocalLLMService: OCR service not initialized, initializing now...",
          );
          await ocrService.initialize();
          this.modelState.ocrServiceReady = true;
          console.log("✅ LocalLLMService: OCR service initialized");
        }
      }

      if (
        !this.modelState.ocrServiceReady ||
        !this.modelState.textPipeline
      ) {
        throw new Error(
          "Models not available. OCR or text models not loaded.",
        );
      }

      console.log("🔍 LocalLLMService: Processing image...");

      // Preprocess image for better OCR results
      const processedImage = await this.preprocessImageForOCR(
        base64Data,
        imageFile.type,
      );
      const imageUrl = URL.createObjectURL(processedImage);

      // Step 1: Extract text using OCR (REQUIRED)
      console.log("📸 LocalLLMService: Extracting text using OCR...");
      let ocrText = "";
      let boundingBoxes: number[][][] = [];

      if (!this.modelState.ocrServiceReady) {
        throw new Error(
          "OCR service not initialized. Cannot proceed with text extraction.",
        );
      }

      // Use PP-OCRv4 OCR service
      console.log("🔍 LocalLLMService: Using OCR service for text extraction");
      const ocrResults = await ocrService.recognize(processedImage);
      ocrText = ocrResults.map((r) => r.text).join("\n");
      boundingBoxes = ocrResults.map((r) => r.bbox);
      console.log(
        `✅ LocalLLMService: OCR extracted ${ocrResults.length} text regions: "${ocrText.substring(0, 100)}..."`,
      );

      URL.revokeObjectURL(imageUrl);

      console.log("📋 LocalLLMService: OCR extracted text:", ocrText);

      // Use only OCR text - no image description fallback
      const extractedText = ocrText.trim();

      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error("No text could be extracted from the image by OCR");
      }

      // Step 2: Generate structured JSON output using text generation model
      // Enhance prompt with layout information from bounding boxes if available
      console.log("🤖 LocalLLMService: Generating structured output...");
      const structuredPrompt = this.createStructuredPrompt(
        extractedText,
        boundingBoxes,
      );

      const textResult = await this.modelState.textPipeline(structuredPrompt, {
        max_new_tokens: 1024,
        temperature: 0.1,
        return_full_text: false,
        do_sample: false,
      });

      // Extract generated text
      let generatedText = "";
      if (Array.isArray(textResult) && textResult.length > 0) {
        generatedText =
          textResult[0]?.generated_text ||
          textResult.map((r: any) => r.generated_text || "").join("\n");
      } else if (textResult?.generated_text) {
        generatedText = textResult.generated_text;
      } else if (typeof textResult === "string") {
        generatedText = textResult;
      }

      // Remove the prompt from the output
      const generatedOnly = generatedText.startsWith(structuredPrompt)
        ? generatedText.slice(structuredPrompt.length).trim()
        : generatedText.trim();

      console.log(
        "📋 LocalLLMService: Generated structured output:",
        generatedOnly,
      );

      return this.parseStructuredOutput(generatedOnly, extractedText);
    } catch (error) {
      console.error("LocalLLMService: Error analyzing image:", error);
      throw error;
    }
  }

  /**
   * Create a prompt for structured JSON generation based on extracted text
   * @param extractedText - OCR extracted text
   * @param boundingBoxes - Optional bounding boxes for layout understanding
   */
  private createStructuredPrompt(
    extractedText: string,
    boundingBoxes?: number[][][],
  ): string {
    // Add layout information if bounding boxes are available
    let layoutInfo = "";
    if (boundingBoxes && boundingBoxes.length > 0) {
      // Group text by vertical position (top to bottom) to understand layout
      const textLines = extractedText.split("\n").filter((line) => line.trim());
      layoutInfo = `\n\nLayout information (text positions from top to bottom):`;
      textLines.forEach((line, idx) => {
        if (boundingBoxes[idx]) {
          const bbox = boundingBoxes[idx];
          const avgY = bbox.reduce((sum, pt) => sum + pt[1], 0) / bbox.length;
          layoutInfo += `\n- Line ${idx + 1} (Y position: ${avgY.toFixed(0)}): ${line}`;
        }
      });
    }

    return `Extract deceased person information from this headstone text and return ONLY valid JSON.

Headstone text:
${extractedText}${layoutInfo}

Analyze the text and extract:
1. Complete transcription of all visible text (preserve line breaks)
2. All deceased persons mentioned with their details
3. Names, dates, relationships, epitaphs, and any other information

Return a JSON object with this exact structure:
{
  "full_text_transcription": "Complete transcription of all text visible on the headstone, preserving line breaks",
  "persons": [
    {
      "title": "",
      "forename": "",
      "middle_name": "",
      "surname": "",
      "full_name": "",
      "known_as": "",
      "maiden_name": "",
      "gender": "",
      "date_of_birth": "",
      "date_of_death": "",
      "age_at_death": null,
      "time_of_death": "",
      "birth_city": "",
      "birth_sub_country": "",
      "birth_country": "",
      "address_line1": "",
      "address_line2": "",
      "town": "",
      "county": "",
      "country": "",
      "postcode": "",
      "mobile": "",
      "landline": "",
      "email_address": "",
      "marital_status": "",
      "race": "",
      "ethnicity": "",
      "deceased": true,
      "person_of_interest": false,
      "veteran": false,
      "cause_of_death": "",
      "notes": ""
    }
  ]
}

Rules:
- Use empty strings "" for missing data
- Set deceased=true for all persons
- Include epitaphs, relationships, and memorial messages in notes field
- Extract dates in YYYY-MM-DD format if possible
- Calculate age_at_death from dates if available
- Parse names carefully (first, middle, last, maiden names)
- Return ONLY the JSON object, no other text or explanation

JSON:`;
  }

  /**
   * Parse structured JSON output and convert to HeadstoneAnalysisResult format
   */
  private parseStructuredOutput(
    generatedText: string,
    extractedText: string,
  ): HeadstoneAnalysisResult {
    try {
      // Try to extract JSON from the generated text
      let parsedData: any = null;

      // Look for JSON object in the output
      const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsedData = JSON.parse(jsonMatch[0]);
          console.log(
            "✅ LocalLLMService: Successfully parsed structured JSON",
          );
        } catch (parseError) {
          console.warn("LocalLLMService: Failed to parse JSON, using fallback");
        }
      }

      // If parsing failed, create a basic structure from extracted text
      if (!parsedData) {
        console.warn(
          "⚠️ LocalLLMService: Could not parse structured JSON, using extracted text only",
        );
        parsedData = {
          full_text_transcription: extractedText,
          persons: [],
        };
      }

      // Ensure required fields exist
      if (!parsedData.full_text_transcription) {
        parsedData.full_text_transcription = extractedText;
      }
      if (!Array.isArray(parsedData.persons)) {
        parsedData.persons = [];
      }

      // Convert to PersonData format
      const persons: PersonData[] = parsedData.persons.map((person: any) => ({
        id: "",
        plot_id: "",
        title: person.title || "",
        forename: person.forename || "",
        middle_name: person.middle_name || "",
        surname: person.surname || "",
        full_name:
          person.full_name ||
          `${person.forename || ""} ${person.surname || ""}`.trim() ||
          "Unknown",
        known_as: person.known_as || "",
        maiden_name: person.maiden_name || "",
        gender: person.gender || "",
        date_of_birth: person.date_of_birth || "",
        date_of_death: person.date_of_death || "",
        age_at_death: person.age_at_death || null,
        time_of_death: person.time_of_death || "",
        birth_city: person.birth_city || "",
        birth_sub_country: person.birth_sub_country || "",
        birth_country: person.birth_country || "",
        address_line1: person.address_line1 || "",
        address_line2: person.address_line2 || "",
        town: person.town || "",
        county: person.county || "",
        country: person.country || "",
        postcode: person.postcode || "",
        mobile: person.mobile || "",
        landline: person.landline || "",
        email_address: person.email_address || "",
        marital_status: person.marital_status || "",
        race: person.race || "",
        ethnicity: person.ethnicity || "",
        deceased: person.deceased !== undefined ? person.deceased : true,
        person_of_interest: person.person_of_interest || false,
        veteran: person.veteran || false,
        cause_of_death: person.cause_of_death || "",
        notes: person.notes || "",
        created_by: "local-llm",
        date_created: new Date().toISOString(),
        last_updated_by: "local-llm",
        last_updated_datetime: new Date().toISOString(),
      }));

      return {
        success: true,
        persons,
        full_text_transcription: parsedData.full_text_transcription,
        raw_analysis: generatedText,
        metadata: {
          analysis_timestamp: new Date().toISOString(),
          model_used: `${ocrService.getModelVersion()} + ${this.TEXT_MODEL}`,
          confidence_level: "medium",
        },
      };
    } catch (error) {
      console.error("LocalLLMService: Error parsing structured output:", error);
      throw new Error(
        `Failed to parse structured output: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }


  /**
   * Preprocess image for better OCR results
   * Enhances contrast and prepares image for text extraction
   */
  private async preprocessImageForOCR(
    base64Data: string,
    mimeType: string,
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }

        // Set canvas size to image size
        canvas.width = img.width;
        canvas.height = img.height;

        // Draw image
        ctx.drawImage(img, 0, 0);

        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Enhanced preprocessing for headstone images
        // Apply grayscale, increase contrast, and sharpen edges
        for (let i = 0; i < data.length; i += 4) {
          // Convert to grayscale using luminance formula
          const gray =
            data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;

          // Increase contrast significantly (2.0x) for engraved text
          const contrast = 2.0;
          const factor =
            (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));
          let newGray = Math.min(255, Math.max(0, factor * (gray - 128) + 128));

          // Apply threshold to make text more distinct (binarization effect)
          // This helps with engraved text that has shadows
          const threshold = 128;
          if (newGray < threshold) {
            newGray = Math.max(0, newGray - 30); // Make dark areas darker
          } else {
            newGray = Math.min(255, newGray + 30); // Make light areas lighter
          }

          // Set RGB to grayscale value
          data[i] = newGray;
          data[i + 1] = newGray;
          data[i + 2] = newGray;
          // Alpha stays the same
        }

        // Apply sharpening filter to enhance text edges
        const sharpenKernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
        const tempData = new Uint8ClampedArray(data);
        for (let y = 1; y < canvas.height - 1; y++) {
          for (let x = 1; x < canvas.width - 1; x++) {
            let r = 0,
              g = 0,
              b = 0;
            for (let ky = -1; ky <= 1; ky++) {
              for (let kx = -1; kx <= 1; kx++) {
                const idx = ((y + ky) * canvas.width + (x + kx)) * 4;
                const kernelIdx = (ky + 1) * 3 + (kx + 1);
                r += tempData[idx] * sharpenKernel[kernelIdx];
                g += tempData[idx + 1] * sharpenKernel[kernelIdx];
                b += tempData[idx + 2] * sharpenKernel[kernelIdx];
              }
            }
            const idx = (y * canvas.width + x) * 4;
            data[idx] = Math.min(255, Math.max(0, r));
            data[idx + 1] = Math.min(255, Math.max(0, g));
            data[idx + 2] = Math.min(255, Math.max(0, b));
          }
        }

        // Put processed image data back
        ctx.putImageData(imageData, 0, 0);

        // Convert to blob
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Failed to convert canvas to blob"));
            }
          },
          mimeType || "image/jpeg",
          0.95,
        );
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = `data:${mimeType};base64,${base64Data}`;
    });
  }

  /**
   * Get current model state
   */
  getState(): ModelState {
    return { ...this.modelState };
  }

  /**
   * Check if models are ready
   */
  isReady(): boolean {
    return this.modelState.isLoaded && !this.modelState.isLoading;
  }

  /**
   * Reset model state (useful for error recovery)
   */
  reset(): void {
    const wasOcrReady = this.modelState.ocrServiceReady;
    this.modelState = {
      isLoaded: false,
      isLoading: false,
      loadProgress: 0,
      error: null,
      ocrServiceReady: false,
      textPipeline: null,
    };
      // Reset OCR service if it was initialized
    if (wasOcrReady) {
      ocrService.reset();
    }
  }
}

// Export singleton instance
export const localLLMService = new LocalLLMService();
