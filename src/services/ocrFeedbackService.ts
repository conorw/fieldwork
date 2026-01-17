// OCR Feedback Service - Collects and stores OCR corrections locally
// Uses IndexedDB for persistent storage (local-first approach)

import { openDB, DBSchema, IDBPDatabase } from "idb";
import type { OCRResult } from "./ocrService";

export interface OCRCorrection {
  id?: number;
  imageId: string; // Reference to the image (could be URL, base64 hash, or file path)
  imageSrc: string; // Full image source (base64 data URL or URL)
  modelVersion: string;
  timestamp: string; // ISO timestamp
  originalResults: OCRResult[];
  correctedResults: OCRResult[];
  corrections: Array<{
    index: number;
    originalText: string;
    correctedText: string;
    bbox: number[][];
    confidence: number;
    wasFlagged: boolean;
  }>;
  metadata?: {
    plotId?: string;
    userId?: string;
    analysisId?: string;
  };
}

interface OCRFeedbackDB extends DBSchema {
  corrections: {
    key: number;
    value: OCRCorrection;
    indexes: {
      "by-image": string;
      "by-timestamp": string;
      "by-model-version": string;
    };
  };
}

class OCRFeedbackService {
  private db: IDBPDatabase<OCRFeedbackDB> | null = null;
  private readonly DB_NAME = "ocr-feedback-db";
  private readonly DB_VERSION = 1;
  private readonly STORE_NAME = "corrections";

  /**
   * Initialize the IndexedDB database
   */
  async initialize(): Promise<void> {
    if (this.db) {
      return;
    }

    try {
      this.db = await openDB<OCRFeedbackDB>(this.DB_NAME, this.DB_VERSION, {
        upgrade(db) {
          // Create object store for corrections
          const store = db.createObjectStore("corrections", {
            keyPath: "id",
            autoIncrement: true,
          });

          // Create indexes for efficient querying
          store.createIndex("by-image", "imageId");
          store.createIndex("by-timestamp", "timestamp");
          store.createIndex("by-model-version", "modelVersion");
        },
      });
      console.log("✅ OCRFeedbackService: Database initialized");
    } catch (error) {
      console.error("❌ OCRFeedbackService: Failed to initialize database:", error);
      throw error;
    }
  }

  /**
   * Ensure database is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.db) {
      await this.initialize();
    }
  }

  /**
   * Store OCR corrections
   */
  async storeCorrection(correction: Omit<OCRCorrection, "id">): Promise<number> {
    await this.ensureInitialized();
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    try {
      const id = await this.db.add(this.STORE_NAME, {
        ...correction,
        timestamp: correction.timestamp || new Date().toISOString(),
      });
      console.log(`✅ OCRFeedbackService: Stored correction with ID ${id}`);
      return id as number;
    } catch (error) {
      console.error("OCRFeedbackService: Error storing correction:", error);
      throw error;
    }
  }

  /**
   * Get correction by ID
   */
  async getCorrection(id: number): Promise<OCRCorrection | undefined> {
    await this.ensureInitialized();
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    return await this.db.get(this.STORE_NAME, id);
  }

  /**
   * Get all corrections
   */
  async getAllCorrections(): Promise<OCRCorrection[]> {
    await this.ensureInitialized();
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    return await this.db.getAll(this.STORE_NAME);
  }

  /**
   * Get corrections by image ID
   */
  async getCorrectionsByImage(imageId: string): Promise<OCRCorrection[]> {
    await this.ensureInitialized();
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    const index = this.db
      .transaction(this.STORE_NAME)
      .store.index("by-image");
    return await index.getAll(imageId);
  }

  /**
   * Get corrections by model version
   */
  async getCorrectionsByModelVersion(
    modelVersion: string,
  ): Promise<OCRCorrection[]> {
    await this.ensureInitialized();
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    const index = this.db
      .transaction(this.STORE_NAME)
      .store.index("by-model-version");
    return await index.getAll(modelVersion);
  }

  /**
   * Get recent corrections (sorted by timestamp, newest first)
   */
  async getRecentCorrections(limit?: number): Promise<OCRCorrection[]> {
    await this.ensureInitialized();
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    const index = this.db
      .transaction(this.STORE_NAME)
      .store.index("by-timestamp");
    const all = await index.getAll();
    
    // Sort by timestamp descending (newest first)
    const sorted = all.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    return limit ? sorted.slice(0, limit) : sorted;
  }

  /**
   * Update a correction
   */
  async updateCorrection(
    id: number,
    updates: Partial<OCRCorrection>,
  ): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    const existing = await this.getCorrection(id);
    if (!existing) {
      throw new Error(`Correction with ID ${id} not found`);
    }

    await this.db.put(this.STORE_NAME, {
      ...existing,
      ...updates,
      id,
    });
    console.log(`✅ OCRFeedbackService: Updated correction ${id}`);
  }

  /**
   * Delete a correction
   */
  async deleteCorrection(id: number): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    await this.db.delete(this.STORE_NAME, id);
    console.log(`✅ OCRFeedbackService: Deleted correction ${id}`);
  }

  /**
   * Get statistics about stored corrections
   */
  async getStatistics(): Promise<{
    totalCorrections: number;
    totalImages: number;
    modelVersions: Record<string, number>;
    averageCorrectionsPerImage: number;
    flaggedCorrections: number;
  }> {
    await this.ensureInitialized();
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    const all = await this.getAllCorrections();
    const imageIds = new Set(all.map((c) => c.imageId));
    const modelVersions: Record<string, number> = {};
    let flaggedCount = 0;

    all.forEach((correction) => {
      // Count by model version
      modelVersions[correction.modelVersion] =
        (modelVersions[correction.modelVersion] || 0) + 1;

      // Count flagged corrections
      flaggedCount += correction.corrections.filter((c) => c.wasFlagged).length;
    });

    return {
      totalCorrections: all.length,
      totalImages: imageIds.size,
      modelVersions,
      averageCorrectionsPerImage:
        imageIds.size > 0 ? all.length / imageIds.size : 0,
      flaggedCorrections: flaggedCount,
    };
  }

  /**
   * Export corrections as JSON (for training data export)
   */
  async exportCorrections(
    filter?: {
      modelVersion?: string;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<OCRCorrection[]> {
    await this.ensureInitialized();
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    let corrections = await this.getAllCorrections();

    // Apply filters
    if (filter?.modelVersion) {
      corrections = corrections.filter(
        (c) => c.modelVersion === filter.modelVersion,
      );
    }

    if (filter?.startDate) {
      corrections = corrections.filter(
        (c) => c.timestamp >= filter.startDate!,
      );
    }

    if (filter?.endDate) {
      corrections = corrections.filter(
        (c) => c.timestamp <= filter.endDate!,
      );
    }

    return corrections;
  }

  /**
   * Clear all corrections (use with caution)
   */
  async clearAllCorrections(): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    await this.db.clear(this.STORE_NAME);
    console.log("✅ OCRFeedbackService: Cleared all corrections");
  }

  /**
   * Generate a unique image ID from image source
   */
  generateImageId(imageSrc: string): string {
    // Use a simple hash of the image source
    // For base64 images, use first 100 chars + length as ID
    if (imageSrc.startsWith("data:")) {
      const hash = this.simpleHash(imageSrc.substring(0, 200));
      return `img-${hash}`;
    }
    // For URLs, use the URL itself
    return `url-${this.simpleHash(imageSrc)}`;
  }

  /**
   * Simple hash function for generating IDs
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
}

// Export singleton instance
export const ocrFeedbackService = new OCRFeedbackService();
