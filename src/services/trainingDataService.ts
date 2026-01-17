// Training Data Service - Formats OCR corrections into PaddleOCR training format
// Exports datasets for fine-tuning detection and recognition models

import { ocrFeedbackService, type OCRCorrection } from "./ocrFeedbackService";

export interface TrainingDataset {
  detection: DetectionTrainingData[];
  recognition: RecognitionTrainingData[];
  metadata: {
    totalImages: number;
    totalDetections: number;
    totalRecognitions: number;
    modelVersion: string;
    exportDate: string;
  };
}

export interface DetectionTrainingData {
  image_path: string;
  image_data?: string; // Base64 encoded image data
  annotations: Array<{
    bbox: number[][]; // [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]
    text: string;
    difficult: boolean;
  }>;
}

export interface RecognitionTrainingData {
  image_path: string;
  image_data?: string; // Base64 encoded cropped text image
  label: string; // Ground truth text
  bbox?: number[][]; // Original bounding box for reference
}

class TrainingDataService {
  /**
   * Export corrections as PaddleOCR training dataset
   */
  async exportTrainingDataset(
    corrections: OCRCorrection[],
    includeImageData: boolean = false,
  ): Promise<TrainingDataset> {
    const detectionData: DetectionTrainingData[] = [];
    const recognitionData: RecognitionTrainingData[] = [];
    const imageIds = new Set<string>();

    for (const correction of corrections) {
      imageIds.add(correction.imageId);

      // Create detection training data (full image with bounding boxes)
      const detectionEntry: DetectionTrainingData = {
        image_path: `headstone_${correction.imageId}.jpg`,
        annotations: correction.correctedResults.map((result) => ({
          bbox: result.bbox,
          text: result.text,
          difficult: result.flaggedForReview || false,
        })),
      };

      if (includeImageData) {
        detectionEntry.image_data = correction.imageSrc;
      }

      detectionData.push(detectionEntry);

      // Create recognition training data (cropped text regions)
      for (let i = 0; i < correction.correctedResults.length; i++) {
        const result = correction.correctedResults[i];
        const cropId = `${correction.imageId}_crop_${i}`;

        // Crop image region (if image data is available)
        let croppedImageData: string | undefined;
        if (includeImageData && correction.imageSrc) {
          croppedImageData = await this.cropImageRegion(
            correction.imageSrc,
            result.bbox,
          );
        }

        recognitionData.push({
          image_path: `${cropId}.jpg`,
          image_data: croppedImageData,
          label: result.text,
          bbox: result.bbox,
        });
      }
    }

    // Determine model version (use most common or latest)
    const modelVersions = corrections.map((c) => c.modelVersion);
    const modelVersion =
      modelVersions.length > 0
        ? this.getMostCommon(modelVersions)
        : "unknown";

    return {
      detection: detectionData,
      recognition: recognitionData,
      metadata: {
        totalImages: imageIds.size,
        totalDetections: detectionData.length,
        totalRecognitions: recognitionData.length,
        modelVersion,
        exportDate: new Date().toISOString(),
      },
    };
  }

  /**
   * Export detection training data in PaddleOCR format
   * Format: JSON lines where each line is a detection annotation
   */
  async exportDetectionFormat(
    corrections: OCRCorrection[],
  ): Promise<string> {
    const lines: string[] = [];

    for (const correction of corrections) {
      const entry = {
        image_path: `headstone_${correction.imageId}.jpg`,
        annotations: correction.correctedResults.map((result) => ({
          bbox: result.bbox,
          text: result.text,
          difficult: result.flaggedForReview || false,
        })),
      };
      lines.push(JSON.stringify(entry));
    }

    return lines.join("\n");
  }

  /**
   * Export recognition training data in PaddleOCR format
   * Format: Tab-separated values: image_path\tlabel
   */
  async exportRecognitionFormat(
    corrections: OCRCorrection[],
  ): Promise<string> {
    const lines: string[] = [];

    for (const correction of corrections) {
      for (let i = 0; i < correction.correctedResults.length; i++) {
        const result = correction.correctedResults[i];
        const cropId = `${correction.imageId}_crop_${i}`;
        const line = `${cropId}.jpg\t${result.text}`;
        lines.push(line);
      }
    }

    return lines.join("\n");
  }

  /**
   * Export complete training dataset as downloadable files
   */
  async exportAsFiles(
    corrections: OCRCorrection[],
    includeImageData: boolean = false,
  ): Promise<{
    detectionJson: Blob;
    recognitionTxt: Blob;
    metadataJson: Blob;
    datasetJson?: Blob;
  }> {
    const dataset = await this.exportTrainingDataset(
      corrections,
      includeImageData,
    );

    // Export detection format (JSON lines)
    const detectionJson = new Blob(
      [await this.exportDetectionFormat(corrections)],
      { type: "application/json" },
    );

    // Export recognition format (TSV)
    const recognitionTxt = new Blob(
      [await this.exportRecognitionFormat(corrections)],
      { type: "text/plain" },
    );

    // Export metadata
    const metadataJson = new Blob(
      [JSON.stringify(dataset.metadata, null, 2)],
      { type: "application/json" },
    );

    // Export complete dataset (optional, includes image data if requested)
    let datasetJson: Blob | undefined;
    if (includeImageData) {
      datasetJson = new Blob([JSON.stringify(dataset, null, 2)], {
        type: "application/json",
      });
    }

    return {
      detectionJson,
      recognitionTxt,
      metadataJson,
      datasetJson,
    };
  }

  /**
   * Crop image region based on bounding box
   */
  private async cropImageRegion(
    imageSrc: string,
    bbox: number[][],
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }

        // Calculate bounding box bounds
        const xs = bbox.map((pt) => pt[0]);
        const ys = bbox.map((pt) => pt[1]);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const width = maxX - minX;
        const height = maxY - minY;

        // Set canvas size
        canvas.width = width;
        canvas.height = height;

        // Draw cropped region
        ctx.drawImage(
          img,
          minX,
          minY,
          width,
          height,
          0,
          0,
          width,
          height,
        );

        // Convert to base64
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Failed to convert canvas to blob"));
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              resolve(reader.result as string);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          },
          "image/jpeg",
          0.95,
        );
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = imageSrc;
    });
  }

  /**
   * Get most common value from array
   */
  private getMostCommon<T>(arr: T[]): T {
    const counts = new Map<T, number>();
    arr.forEach((item) => {
      counts.set(item, (counts.get(item) || 0) + 1);
    });

    let maxCount = 0;
    let mostCommon = arr[0];
    counts.forEach((count, item) => {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = item;
      }
    });

    return mostCommon;
  }

  /**
   * Validate training dataset quality
   */
  validateDataset(dataset: TrainingDataset): {
    valid: boolean;
    issues: string[];
    warnings: string[];
  } {
    const issues: string[] = [];
    const warnings: string[] = [];

    // Check minimum data requirements
    if (dataset.detection.length < 100) {
      warnings.push(
        `Only ${dataset.detection.length} detection samples. PaddleOCR recommends at least 500 for fine-tuning.`,
      );
    }

    if (dataset.recognition.length < 1000) {
      warnings.push(
        `Only ${dataset.recognition.length} recognition samples. PaddleOCR recommends at least 5,000 for fine-tuning.`,
      );
    }

    // Check for empty annotations
    const emptyAnnotations = dataset.detection.filter(
      (d) => d.annotations.length === 0,
    );
    if (emptyAnnotations.length > 0) {
      issues.push(
        `${emptyAnnotations.length} detection entries have no annotations`,
      );
    }

    // Check for empty labels
    const emptyLabels = dataset.recognition.filter((r) => !r.label || r.label.trim() === "");
    if (emptyLabels.length > 0) {
      issues.push(`${emptyLabels.length} recognition entries have empty labels`);
    }

    // Check bounding box validity
    let invalidBboxes = 0;
    dataset.detection.forEach((d) => {
      d.annotations.forEach((ann) => {
        if (!ann.bbox || ann.bbox.length !== 4) {
          invalidBboxes++;
        }
      });
    });
    if (invalidBboxes > 0) {
      issues.push(`${invalidBboxes} annotations have invalid bounding boxes`);
    }

    return {
      valid: issues.length === 0,
      issues,
      warnings,
    };
  }
}

// Export singleton instance
export const trainingDataService = new TrainingDataService();
