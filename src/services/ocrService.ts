// OCR Service - PP-OCRv4 via Gutenye/ONNX Runtime Web
// Provides text detection and recognition with bounding boxes and confidence scores

import { gutenyeOCRService } from './gutenyeOCRService';

// Re-export types from gutenyeOCRService
export type { OCRResult, OCRServiceState } from './gutenyeOCRService';

// Simple wrapper around Gutenye OCR service
// This maintains the same API interface for compatibility
class OCRService {
  /**
   * Initialize OCR service (PP-OCRv4)
   */
  async initialize(options?: {
    detectionPath?: string;
    recognitionPath?: string;
    dictionaryPath?: string;
  }): Promise<void> {
    return gutenyeOCRService.initialize(options);
  }

  /**
   * Run OCR on an image
   */
  async recognize(image: Blob | File | ImageData | string | HTMLImageElement): Promise<import('./gutenyeOCRService').OCRResult[]> {
    return gutenyeOCRService.recognize(image);
  }

  /**
   * Get OCR results as plain text (concatenated)
   */
  async recognizeText(image: Blob | File | ImageData | string | HTMLImageElement): Promise<string> {
    return gutenyeOCRService.recognizeText(image);
  }

  /**
   * Get current service state
   */
  getState(): import('./gutenyeOCRService').OCRServiceState {
    return gutenyeOCRService.getState();
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return gutenyeOCRService.isReady();
  }

  /**
   * Get model version
   */
  getModelVersion(): string {
    return gutenyeOCRService.getModelVersion();
  }

  /**
   * Reset service state
   */
  reset(): void {
    gutenyeOCRService.reset();
  }

  /**
   * Get low confidence threshold
   */
  getLowConfidenceThreshold(): number {
    return gutenyeOCRService.getLowConfidenceThreshold();
  }

  /**
   * Get confidence statistics
   */
  getConfidenceStatistics(results: import('./gutenyeOCRService').OCRResult[]): {
    average: number;
    min: number;
    max: number;
    median: number;
    lowConfidenceRatio: number;
    flaggedCount: number;
  } {
    return gutenyeOCRService.getConfidenceStatistics(results);
  }
}

// Export singleton instance
export const ocrService = new OCRService();
