// PaddleOCR service for browser-based OCR using Paddle.js
// Provides text detection and recognition with bounding boxes and confidence scores

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

class PaddleOCRService {
  private state: OCRServiceState = {
    isLoaded: false,
    isLoading: false,
    loadProgress: 0,
    error: null,
    modelVersion: "ppocrv3-mobile-v1.0",
  };

  private detectionModel: any = null;
  private recognitionModel: any = null;
  private ocrPipeline: any = null;

  // Model configuration
  private readonly MODEL_VERSION = "ppocrv3-mobile-v1.0";
  private readonly LOW_CONFIDENCE_THRESHOLD = 0.7;

  /**
   * Initialize and load PaddleOCR models
   */
  async initialize(): Promise<void> {
    if (this.state.isLoaded) {
      console.log("PaddleOCRService: Models already loaded");
      return;
    }

    if (this.state.isLoading) {
      console.log("PaddleOCRService: Models are already loading, waiting...");
      while (this.state.isLoading && !this.state.isLoaded) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return;
    }

    this.state.isLoading = true;
    this.state.error = null;
    this.state.loadProgress = 0;

    try {
      console.log("🚀 PaddleOCRService: Starting model initialization...");
      console.log("📦 PaddleOCRService: Model version:", this.MODEL_VERSION);

      // Try to load Paddle.js OCR models
      try {
        const paddleOCR = await this.loadPaddleOCR();
        
        // Initialize OCR pipeline using Paddle.js API
        // According to official docs: await ocr.init();
        // https://github.com/PaddlePaddle/FastDeploy/blob/cd0ee79c91d4ed1103abdc65ff12ccadd23d0827/examples/application/js/WebDemo.md#2
        console.log("🔍 PaddleOCRService: Initializing OCR model...");
        
        if (typeof paddleOCR.init === 'function') {
          console.log("📦 PaddleOCRService: Calling init() method");
          // Initialize without parameters (uses default models)
          // Can optionally pass config: await ocr.init({modelPath: "..."})
          await paddleOCR.init();
          console.log("✅ PaddleOCRService: OCR model initialized successfully");
        } else {
          throw new Error("OCR module does not have init() method. Available methods: " + Object.keys(paddleOCR || {}).join(", "));
        }
        
        // Store the OCR instance for later use
        this.ocrPipeline = paddleOCR;

        this.state.isLoaded = true;
        this.state.isLoading = false;
        this.state.loadProgress = 100;
        console.log("✅ PaddleOCRService: Models loaded successfully!");
      } catch (importError) {
        // If Paddle.js packages don't exist or fail to load, provide helpful error
        console.warn(
          "PaddleOCRService: Paddle.js packages not available",
          importError,
        );
        const errorMsg = importError instanceof Error ? importError.message : String(importError);
        throw new Error(
          `Paddle.js OCR models not available. Please install: npm install @paddlejs-models/ocr @paddlejs/paddlejs-core @paddlejs/paddlejs-backend-webgl @paddlejs-mediapipe/opencv\n\nError: ${errorMsg}`,
        );
      }
    } catch (error) {
      console.error("❌ PaddleOCRService: Error loading models:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.state.error = errorMessage;
      this.state.isLoading = false;
      this.state.isLoaded = false;
      throw error;
    }
  }

  /**
   * Load Paddle.js OCR - uses @paddlejs-models/ocr package via wrapper
   * The wrapper ensures module polyfill is available before loading the actual module
   * Based on: https://github.com/PaddlePaddle/FastDeploy/blob/cd0ee79c91d4ed1103abdc65ff12ccadd23d0827/examples/application/js/WebDemo.md#2
   */
  private async loadPaddleOCR(): Promise<any> {
    try {
      console.log("📦 PaddleOCRService: Attempting to load @paddlejs-models/ocr via wrapper...");
      
      // Use wrapper function that ensures module polyfill is set up
      const { loadPaddleOCRModule } = await import("../utils/paddleOCRWrapper");
      const ocr = await loadPaddleOCRModule();
      
      console.log("✅ PaddleOCRService: Successfully loaded OCR module:", Object.keys(ocr || {}));
      console.log("📦 PaddleOCRService: Module structure:", typeof ocr, Object.keys(ocr || {}));
      
      // Verify the module has the expected API
      if (typeof ocr.init !== 'function' || typeof ocr.recognize !== 'function') {
        console.warn("⚠️ PaddleOCRService: Module doesn't have expected init/recognize methods");
        console.warn("Available methods:", Object.keys(ocr || {}));
      }
      
      return ocr;
    } catch (error) {
      console.error("❌ PaddleOCRService: Failed to load Paddle.js OCR package:", error);
      throw new Error(
        `Paddle.js OCR package not found. Please install: npm install @paddlejs-models/ocr @paddlejs/paddlejs-core @paddlejs/paddlejs-backend-webgl @paddlejs-mediapipe/opencv\n\nError: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Run OCR on an image
   * @param image - Image as Blob, File, ImageData, or image URL
   * @returns Array of OCR results with text, bounding boxes, and confidence scores
   */
  async recognize(image: Blob | File | ImageData | string): Promise<OCRResult[]> {
    if (!this.state.isLoaded) {
      console.log(
        "🔄 PaddleOCRService: Models not loaded, initializing now...",
      );
      await this.initialize();
    }

    if (!this.ocrPipeline) {
      throw new Error("OCR pipeline not initialized");
    }

    try {
      console.log("🔍 PaddleOCRService: Running OCR on image...");

      // Convert image to format expected by Paddle.js
      const imageData = await this.prepareImage(image);

      // Run OCR pipeline using Paddle.js recognize method
      // According to official docs: const res = await ocr.recognize(img);
      // Returns: { text: string[], points: number[][][] }
      // https://github.com/PaddlePaddle/FastDeploy/blob/cd0ee79c91d4ed1103abdc65ff12ccadd23d0827/examples/application/js/WebDemo.md#2
      const results = await this.ocrPipeline.recognize(imageData);

      // Format results
      const ocrResults: OCRResult[] = this.formatOCRResults(results);

      console.log(
        `✅ PaddleOCRService: OCR complete, found ${ocrResults.length} text regions`,
      );

      return ocrResults;
    } catch (error) {
      console.error("PaddleOCRService: Error during OCR:", error);
      throw error;
    }
  }

  /**
   * Prepare image for OCR processing
   * According to docs, recognize() expects HTMLImageElement: const res = await ocr.recognize(img);
   * https://github.com/PaddlePaddle/FastDeploy/blob/cd0ee79c91d4ed1103abdc65ff12ccadd23d0827/examples/application/js/WebDemo.md#2
   */
  private async prepareImage(
    image: Blob | File | ImageData | string,
  ): Promise<HTMLImageElement> {
    // If already an HTMLImageElement, return it
    if (image instanceof HTMLImageElement) {
      return image;
    }

    // If string URL, create image element
    if (typeof image === "string") {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous"; // Handle CORS if needed
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Failed to load image from URL"));
        img.src = image;
      });
    }

    // Convert Blob/File/ImageData to HTMLImageElement
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      if (image instanceof ImageData) {
        // Convert ImageData to data URL
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.putImageData(image, 0, 0);
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("Failed to load image from ImageData"));
          img.src = canvas.toDataURL();
        } else {
          reject(new Error("Failed to get canvas context"));
        }
      } else {
        // Convert Blob/File to object URL
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
      }
    });
  }

  /**
   * Format OCR results from Paddle.js output to our standard format
   * According to official docs, Paddle.js OCR returns: { text: string[], points: number[][][] }
   * https://github.com/PaddlePaddle/FastDeploy/blob/cd0ee79c91d4ed1103abdc65ff12ccadd23d0827/examples/application/js/WebDemo.md#2
   */
  private formatOCRResults(results: any): OCRResult[] {
    console.log("📋 PaddleOCRService: Formatting OCR results:", results);
    
    // According to docs: res.text is string[], res.points is number[][][]
    // Each element in text[] corresponds to a detected text region
    // Each element in points[] is the bounding box for that text region
    if (results && Array.isArray(results.text) && Array.isArray(results.points)) {
      return results.text.map((text: string, index: number) => {
        const bbox = results.points[index] || [];
        // Default confidence if not provided
        const confidence = 0.9; // Paddle.js doesn't always provide confidence scores
        
        return {
          text: text || "",
          bbox: Array.isArray(bbox) && bbox.length === 4 ? bbox : [],
          confidence,
          flaggedForReview: confidence < this.LOW_CONFIDENCE_THRESHOLD,
        };
      });
    }

    // Fallback: if results is an array of objects
    if (Array.isArray(results)) {
      return results.map((result: any) => {
        const confidence = result.confidence || result.score || 0.0;
        const bbox = result.points || result.bbox || result.box || result.polygon || [];
        return {
          text: result.text || result.rec_text || "",
          bbox: Array.isArray(bbox) && bbox.length === 4 ? bbox : [],
          confidence,
          flaggedForReview: confidence < this.LOW_CONFIDENCE_THRESHOLD,
        };
      });
    }

    // Fallback: single result object
    if (results && (results.text || results.points)) {
      const textArray = Array.isArray(results.text) ? results.text : [results.text || ""];
      const pointsArray = Array.isArray(results.points) ? results.points : [results.points || []];
      
      return textArray.map((text: string, index: number) => {
        const bbox = pointsArray[index] || [];
        return {
          text: text || "",
          bbox: Array.isArray(bbox) && bbox.length === 4 ? bbox : [],
          confidence: 0.9,
          flaggedForReview: false,
        };
      });
    }

    console.warn("⚠️ PaddleOCRService: Unexpected result format:", results);
    return [];
  }

  /**
   * Extract bounding box from various possible formats
   */
  private extractBBox(result: any): number[][] {
    if (result.bbox) return result.bbox;
    if (result.box) return result.box;
    if (result.polygon) return result.polygon;
    if (result.x && result.y && result.width && result.height) {
      const { x, y, width, height } = result;
      return [
        [x, y],
        [x + width, y],
        [x + width, y + height],
        [x, y + height],
      ];
    }
    return [];
  }

  /**
   * Get OCR results as plain text (concatenated)
   */
  async recognizeText(image: Blob | File | ImageData | string): Promise<string> {
    const results = await this.recognize(image);
    return results.map((r) => r.text).join("\n");
  }

  /**
   * Get OCR results with low-confidence detections flagged
   */
  async recognizeWithConfidence(
    image: Blob | File | ImageData | string,
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
    this.detectionModel = null;
    this.recognitionModel = null;
    this.ocrPipeline = null;
  }

  /**
   * Get low confidence threshold
   */
  getLowConfidenceThreshold(): number {
    return this.LOW_CONFIDENCE_THRESHOLD;
  }
}

// Export singleton instance
export const paddleOCRService = new PaddleOCRService();
