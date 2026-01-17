// Gutenye OCR service for browser-based OCR using PP-OCRv4 models via ONNX Runtime Web
// Provides text detection and recognition with bounding boxes and confidence scores
// Uses @gutenye/ocr-browser which supports PP-OCRv4 models

import Ocr from '@gutenye/ocr-browser';
import * as ort from 'onnxruntime-web';

// Configure ONNX Runtime Web WASM paths synchronously at module load time
// This MUST happen before any ONNX operations, including Ocr.create()
if (typeof window !== 'undefined') {
  try {
    // Configure WASM paths - use base path string for simplicity
    // ONNX Runtime Web will look for WASM files relative to this path
    // WASM files are in public/wasm/ directory and served from /wasm/
    ort.env.wasm.wasmPaths = '/wasm/';
    
    // Also configure numThreads for better performance
    ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4;
    
    // Set log level to see what's happening
    ort.env.logLevel = 'warning';
    
    console.log('✅ ONNX Runtime Web WASM paths configured:', ort.env.wasm.wasmPaths);
    console.log('✅ ONNX Runtime Web numThreads:', ort.env.wasm.numThreads);
  } catch (err) {
    console.warn('⚠️ Failed to configure ONNX Runtime Web WASM paths:', err);
  }
}

// Define OCR result and service state interfaces
export interface OCRResult {
  text: string;
  bbox: number[][]; // [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]
  confidence: number;
  flaggedForReview?: boolean; // Flagged for active learning
}

export interface OCRServiceState {
  isLoaded: boolean;
  isLoading: boolean;
  loadProgress: number;
  error: string | null;
  modelVersion: string;
}

class GutenyeOCRService {
  private state: OCRServiceState = {
    isLoaded: false,
    isLoading: false,
    loadProgress: 0,
    error: null,
    modelVersion: "ppocrv4-mobile-v1.0",
  };

  private ocrInstance: any = null;

  // Model configuration
  private readonly MODEL_VERSION = "ppocrv4-mobile-v1.0";
  private readonly LOW_CONFIDENCE_THRESHOLD = 0.7;

  // Default model paths - can be overridden via environment or config
  // These will be served from public directory or CDN
  private readonly DEFAULT_MODELS = {
    detectionPath: '/models/ch_PP-OCRv4_det_infer.onnx',
    recognitionPath: '/models/ch_PP-OCRv4_rec_infer.onnx',
    dictionaryPath: '/models/ppocr_keys_v1.txt',
  };

  /**
   * Initialize and load Gutenye OCR models (PP-OCRv4)
   */
  async initialize(options?: {
    detectionPath?: string;
    recognitionPath?: string;
    dictionaryPath?: string;
  }): Promise<void> {
    if (this.state.isLoaded) {
      console.log("GutenyeOCRService: Models already loaded");
      return;
    }

    if (this.state.isLoading) {
      console.log("GutenyeOCRService: Models are already loading, waiting...");
      while (this.state.isLoading && !this.state.isLoaded) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return;
    }

    this.state.isLoading = true;
    this.state.error = null;
    this.state.loadProgress = 0;

    try {
      console.log("🚀 GutenyeOCRService: Starting PP-OCRv4 model initialization...");
      console.log("📦 GutenyeOCRService: Model version:", this.MODEL_VERSION);

      // Determine model paths
      const models = {
        detectionPath: options?.detectionPath || this.DEFAULT_MODELS.detectionPath,
        recognitionPath: options?.recognitionPath || this.DEFAULT_MODELS.recognitionPath,
        dictionaryPath: options?.dictionaryPath || this.DEFAULT_MODELS.dictionaryPath,
      };

      console.log("📦 GutenyeOCRService: Loading models from:", models);

      // Update progress
      this.state.loadProgress = 30;

      // Check if model files exist before attempting to load
      // This provides better error messages than ONNX Runtime's WASM errors
      try {
        const detectionResponse = await fetch(models.detectionPath, { method: 'HEAD' });
        if (!detectionResponse.ok) {
          throw new Error(
            `PP-OCRv4 model files not found. Please download the required model files:\n` +
            `- ${models.detectionPath}\n` +
            `- ${models.recognitionPath}\n` +
            `- ${models.dictionaryPath}\n\n` +
            `Place them in the /public/models/ directory.\n` +
            `See docs/OCR_MODEL_SETUP.md for download instructions.\n\n` +
            `HTTP Status: ${detectionResponse.status}`
          );
        }
      } catch (fetchError) {
        // If HEAD request fails, check if it's a network error or 404
        if (fetchError instanceof TypeError || fetchError instanceof Error) {
          const errorMsg = fetchError.message || String(fetchError);
          if (errorMsg.includes('Failed to fetch') || errorMsg.includes('404')) {
            throw new Error(
              `PP-OCRv4 model files not found at ${models.detectionPath}.\n\n` +
              `Please download the required model files:\n` +
              `1. ch_PP-OCRv4_det_infer.onnx (detection model)\n` +
              `2. ch_PP-OCRv4_rec_infer.onnx (recognition model)\n` +
              `3. ppocr_keys_v1.txt (dictionary file)\n\n` +
              `Place them in the /public/models/ directory.\n` +
              `See docs/OCR_MODEL_SETUP.md for download instructions.`
            );
          }
        }
        // Re-throw if it's not a fetch error
        throw fetchError;
      }

      // Create OCR instance with PP-OCRv4 models
      // Ensure ONNX Runtime WASM paths are configured before creating the instance
      if (typeof window !== 'undefined' && ort.env.wasm) {
        console.log('🔧 GutenyeOCRService: ONNX Runtime WASM paths:', ort.env.wasm.wasmPaths);
      }
      
      // Configure ONNX Runtime options to use WASM backend
      // This ensures ONNX Runtime uses the correct execution provider
      const onnxOptions: ort.InferenceSession.SessionOptions = {
        executionProviders: ['wasm'],
        // Ensure WASM paths are set
        ...(ort.env.wasm?.wasmPaths && {
          // WASM paths are already configured globally above
        }),
      };
      
      this.ocrInstance = await Ocr.create({
        models,
        isDebug: false,
        onnxOptions,
      });

      this.state.loadProgress = 100;
      this.state.isLoaded = true;
      this.state.isLoading = false;
      console.log("✅ GutenyeOCRService: PP-OCRv4 models loaded successfully!");
    } catch (error) {
      console.error("❌ GutenyeOCRService: Error loading models:", error);
      
      // Provide helpful error message for WASM/ONNX errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStr = String(error);
      
      // Check if this is a WASM/ONNX error indicating missing model files
      if (
        errorMessage.includes('no available backend') ||
        errorMessage.includes('WebAssembly') ||
        errorMessage.includes('magic word') ||
        errorMessage.includes('CompileError') ||
        errorStr.includes('<!DOCTYPE') ||
        errorStr.includes('expected magic word')
      ) {
        const helpfulError = new Error(
          `PP-OCRv4 model files are missing or invalid.\n\n` +
          `The ONNX Runtime is trying to load model files but cannot find them.\n\n` +
          `Required files:\n` +
          `- /public/models/ch_PP-OCRv4_det_infer.onnx\n` +
          `- /public/models/ch_PP-OCRv4_rec_infer.onnx\n` +
          `- /public/models/ppocr_keys_v1.txt\n\n` +
          `Please download these files and place them in the /public/models/ directory.\n` +
          `See docs/OCR_MODEL_SETUP.md for download instructions.\n\n` +
          `Original error: ${errorMessage}`
        );
        this.state.error = helpfulError.message;
        this.state.isLoading = false;
        this.state.isLoaded = false;
        throw helpfulError;
      }
      
      this.state.error = errorMessage;
      this.state.isLoading = false;
      this.state.isLoaded = false;
      throw error;
    }
  }

  /**
   * Run OCR on an image
   * @param image - Image as Blob, File, ImageData, HTMLImageElement, or image URL
   * @returns Array of OCR results with text, bounding boxes, and confidence scores
   */
  async recognize(image: Blob | File | ImageData | string | HTMLImageElement): Promise<OCRResult[]> {
    if (!this.state.isLoaded) {
      console.log(
        "🔄 GutenyeOCRService: Models not loaded, initializing now...",
      );
      await this.initialize();
    }

    if (!this.ocrInstance) {
      throw new Error("OCR instance not initialized");
    }

    try {
      console.log("🔍 GutenyeOCRService: Running OCR on image...");

      // Convert image to format expected by Gutenye OCR
      const imagePath = await this.prepareImage(image);

      // Run OCR detection
      // Gutenye OCR detect() returns TextLine[] with { text, score, frame: { top, left, width, height } }
      const results = await this.ocrInstance.detect(imagePath);

      // Format results to match our OCRResult interface
      const ocrResults: OCRResult[] = this.formatOCRResults(results);

      console.log(
        `✅ GutenyeOCRService: OCR complete, found ${ocrResults.length} text regions`,
      );

      return ocrResults;
    } catch (error) {
      console.error("GutenyeOCRService: Error during OCR:", error);
      throw error;
    }
  }

  /**
   * Prepare image for OCR processing
   * Gutenye OCR accepts: string (URL/path), HTMLImageElement, or ImageData
   */
  private async prepareImage(
    image: Blob | File | ImageData | string | HTMLImageElement,
  ): Promise<string | HTMLImageElement | ImageData> {
    // If already an HTMLImageElement, return it
    if (image instanceof HTMLImageElement) {
      return image;
    }

    // If string URL, return as-is
    if (typeof image === "string") {
      return image;
    }

    // If ImageData, return as-is
    if (image instanceof ImageData) {
      return image;
    }

    // Convert Blob/File to data URL or HTMLImageElement
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(image as Blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load image from Blob/File"));
      };
      img.src = url;
    });
  }

  /**
   * Format OCR results from Gutenye OCR output to our standard format
   * Gutenye OCR returns: TextLine[] with { text: string, score: number, frame: { top, left, width, height } }
   */
  private formatOCRResults(results: any[]): OCRResult[] {
    console.log("📋 GutenyeOCRService: Formatting OCR results:", results);

    if (!Array.isArray(results)) {
      console.warn("⚠️ GutenyeOCRService: Unexpected result format:", results);
      return [];
    }

    return results.map((result: any) => {
      const text = result.text || "";
      const confidence = result.score || 0.9; // Gutenye provides score (0-1)
      const frame = result.frame || { top: 0, left: 0, width: 0, height: 0 };

      // Convert frame (top, left, width, height) to bbox format [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]
      const bbox: number[][] = [
        [frame.left, frame.top],
        [frame.left + frame.width, frame.top],
        [frame.left + frame.width, frame.top + frame.height],
        [frame.left, frame.top + frame.height],
      ];

      return {
        text,
        bbox,
        confidence,
        flaggedForReview: confidence < this.LOW_CONFIDENCE_THRESHOLD,
      };
    });
  }

  /**
   * Get OCR results as plain text (concatenated)
   */
  async recognizeText(image: Blob | File | ImageData | string | HTMLImageElement): Promise<string> {
    const results = await this.recognize(image);
    return results.map((r) => r.text).join("\n");
  }

  /**
   * Get OCR results with low-confidence detections flagged
   */
  async recognizeWithConfidence(
    image: Blob | File | ImageData | string | HTMLImageElement,
  ): Promise<{
    results: OCRResult[];
    lowConfidenceResults: OCRResult[];
    averageConfidence: number;
    confidenceStats: {
      min: number;
      max: number;
      median: number;
      lowConfidenceCount: number;
      totalCount: number;
    };
  }> {
    const results = await this.recognize(image);
    const lowConfidenceResults = results.filter(
      (r) => r.confidence < this.LOW_CONFIDENCE_THRESHOLD,
    );

    const confidences = results.map((r) => r.confidence).sort((a, b) => a - b);
    const averageConfidence =
      results.length > 0
        ? results.reduce((sum, r) => sum + r.confidence, 0) / results.length
        : 0;

    const medianConfidence =
      confidences.length > 0
        ? confidences.length % 2 === 0
          ? (confidences[confidences.length / 2 - 1] +
              confidences[confidences.length / 2]) /
            2
          : confidences[Math.floor(confidences.length / 2)]
        : 0;

    return {
      results,
      lowConfidenceResults,
      averageConfidence,
      confidenceStats: {
        min: confidences.length > 0 ? confidences[0] : 0,
        max: confidences.length > 0 ? confidences[confidences.length - 1] : 0,
        median: medianConfidence,
        lowConfidenceCount: lowConfidenceResults.length,
        totalCount: results.length,
      },
    };
  }

  /**
   * Check if a result should be flagged for user review (active learning)
   */
  shouldFlagForReview(result: OCRResult): boolean {
    return result.confidence < this.LOW_CONFIDENCE_THRESHOLD;
  }

  /**
   * Get statistics about OCR confidence for active learning
   */
  getConfidenceStatistics(results: OCRResult[]): {
    average: number;
    min: number;
    max: number;
    median: number;
    lowConfidenceRatio: number;
    flaggedCount: number;
  } {
    if (results.length === 0) {
      return {
        average: 0,
        min: 0,
        max: 0,
        median: 0,
        lowConfidenceRatio: 0,
        flaggedCount: 0,
      };
    }

    const confidences = results.map((r) => r.confidence).sort((a, b) => a - b);
    const flaggedCount = results.filter((r) =>
      this.shouldFlagForReview(r),
    ).length;

    return {
      average:
        confidences.reduce((sum, c) => sum + c, 0) / confidences.length,
      min: confidences[0],
      max: confidences[confidences.length - 1],
      median:
        confidences.length % 2 === 0
          ? (confidences[confidences.length / 2 - 1] +
              confidences[confidences.length / 2]) /
            2
          : confidences[Math.floor(confidences.length / 2)],
      lowConfidenceRatio: flaggedCount / results.length,
      flaggedCount,
    };
  }

  /**
   * Get current service state
   */
  getState(): OCRServiceState {
    return { ...this.state };
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.state.isLoaded && !this.state.isLoading;
  }

  /**
   * Get model version
   */
  getModelVersion(): string {
    return this.state.modelVersion;
  }

  /**
   * Reset service state
   */
  reset(): void {
    this.state = {
      isLoaded: false,
      isLoading: false,
      loadProgress: 0,
      error: null,
      modelVersion: this.MODEL_VERSION,
    };
    this.ocrInstance = null;
  }

  /**
   * Get low confidence threshold
   */
  getLowConfidenceThreshold(): number {
    return this.LOW_CONFIDENCE_THRESHOLD;
  }
}

// Export singleton instance
export const gutenyeOCRService = new GutenyeOCRService();
