/**
 * Types for batch grave capture functionality
 */

export interface BatchCapturePhoto {
  id: string;
  image: {
    dataUrl: string;
    blob: Blob;
    file: File;
  };
  gps: {
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: number;
  };
  direction: number; // Compass heading in degrees (0-360)
  timestamp: number;
  order: number; // Order in which photo was taken
}

export interface BatchCaptureSession {
  id: string;
  startTime: number;
  endTime?: number;
  photos: BatchCapturePhoto[];
  locationId?: string; // Associated location
  status: "capturing" | "processing" | "completed" | "failed";
}

export interface ProcessedBatchPhoto extends BatchCapturePhoto {
  calculatedPosition: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
  relativePosition?: {
    direction: "left" | "right" | "front" | "behind";
    distance: number; // meters
    confidence: number; // 0-1
  };
  personData?: any[]; // Extracted person data from headstone analysis
}

export interface ProcessedBatch {
  session: BatchCaptureSession;
  photos: ProcessedBatchPhoto[];
  movementLine?: {
    start: { latitude: number; longitude: number };
    end: { latitude: number; longitude: number };
    bearing: number; // degrees
  };
  layoutType: "line" | "grid" | "scattered";
  averageSpacing?: number; // meters
}

export interface AIPositionAnalysis {
  photo1Id: string;
  photo2Id: string;
  relativeDirection: "left" | "right" | "front" | "behind" | "same";
  estimatedDistance: number; // meters
  alignedInRow: boolean;
  confidence: number; // 0-1
  visualMarkers?: string[];
}

