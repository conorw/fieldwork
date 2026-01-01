/**
 * AI service for analyzing relative positions of graves from photos
 * Uses OpenAI Vision API to analyze photo pairs
 */

import type {
  BatchCapturePhoto,
  AIPositionAnalysis,
} from "../types/batchCapture";

const API_ENDPOINT = "/api/analyze-position";

interface AIPositionResponse {
  relativeDirection: "left" | "right" | "front" | "behind" | "same";
  estimatedDistance: number; // meters
  alignedInRow: boolean;
  confidence: number; // 0-1
  visualMarkers?: string[];
  reasoning?: string;
}

/**
 * Convert image blob to base64
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      // Remove data URL prefix
      const base64Data = base64.split(",")[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Analyze relative position of two grave photos using AI
 */
export async function analyzeGravePositions(
  photo1: BatchCapturePhoto,
  photo2: BatchCapturePhoto,
): Promise<AIPositionAnalysis> {
  try {
    // Convert images to base64
    const image1Base64 = await blobToBase64(photo1.image.blob);
    const image2Base64 = await blobToBase64(photo2.image.blob);

    // Call API endpoint
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        images: [
          {
            data: image1Base64,
            mimeType: "image/jpeg",
          },
          {
            data: image2Base64,
            mimeType: "image/jpeg",
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `API error: ${response.status} ${response.statusText} - ${errorData.error || "Unknown error"}`,
      );
    }

    const analysis: AIPositionResponse = await response.json();

    return {
      photo1Id: photo1.id,
      photo2Id: photo2.id,
      relativeDirection: analysis.relativeDirection || "same",
      estimatedDistance: analysis.estimatedDistance || 2.0,
      alignedInRow: analysis.alignedInRow ?? true,
      confidence: analysis.confidence || 0.5,
      visualMarkers: analysis.visualMarkers,
    };
  } catch (error) {
    console.error("Error analyzing grave positions:", error);
    // Return default/fallback analysis
    return {
      photo1Id: photo1.id,
      photo2Id: photo2.id,
      relativeDirection: "same",
      estimatedDistance: 2.0, // Default spacing
      alignedInRow: true,
      confidence: 0.0, // Low confidence indicates fallback
    };
  }
}

/**
 * Analyze all consecutive photo pairs in a batch
 */
export async function analyzeBatchPositions(
  photos: BatchCapturePhoto[],
): Promise<AIPositionAnalysis[]> {
  if (photos.length < 2) {
    return [];
  }

  const analyses: AIPositionAnalysis[] = [];

  // Analyze consecutive pairs
  for (let i = 0; i < photos.length - 1; i++) {
    try {
      const analysis = await analyzeGravePositions(photos[i], photos[i + 1]);
      analyses.push(analysis);

      // Add small delay to avoid rate limiting
      if (i < photos.length - 2) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error(`Error analyzing pair ${i}-${i + 1}:`, error);
      // Continue with next pair even if one fails
    }
  }

  return analyses;
}

/**
 * Apply AI position analysis to refine calculated positions
 */
export function applyAIPositionCorrections(
  photos: BatchCapturePhoto[],
  aiAnalyses: AIPositionAnalysis[],
  basePositions: Array<{ latitude: number; longitude: number }>,
): Array<{ latitude: number; longitude: number; accuracy: number }> {
  if (photos.length !== basePositions.length) {
    console.warn("Mismatch between photos and positions");
    return basePositions.map((pos) => ({ ...pos, accuracy: 10 }));
  }

  // Create corrected positions array with proper typing
  const correctedPositions: Array<{ latitude: number; longitude: number; accuracy: number }> = basePositions.map((pos) => {
    const posWithAccuracy = pos as { latitude: number; longitude: number; accuracy?: number };
    return {
      latitude: pos.latitude,
      longitude: pos.longitude,
      accuracy: posWithAccuracy.accuracy || 10,
    };
  });
  
  const R = 6371000; // Earth's radius in meters

  // Apply corrections based on AI analysis
  for (let i = 0; i < aiAnalyses.length; i++) {
    const analysis = aiAnalyses[i];
    const photo1Index = photos.findIndex((p) => p.id === analysis.photo1Id);
    const photo2Index = photos.findIndex((p) => p.id === analysis.photo2Id);

    if (
      photo1Index === -1 ||
      photo2Index === -1 ||
      photo2Index !== photo1Index + 1
    ) {
      continue; // Skip invalid analyses
    }

    // Only apply if confidence is reasonable
    if (analysis.confidence < 0.3) {
      continue;
    }

    // Calculate direction from photo1 to photo2 based on GPS
    const bearing = calculateBearing(
      basePositions[photo1Index].latitude,
      basePositions[photo1Index].longitude,
      basePositions[photo2Index].latitude,
      basePositions[photo2Index].longitude,
    );

    // Adjust position based on AI analysis
    let adjustedBearing = bearing;
    if (analysis.relativeDirection === "left") {
      adjustedBearing = (bearing - 90 + 360) % 360;
    } else if (analysis.relativeDirection === "right") {
      adjustedBearing = (bearing + 90) % 360;
    } else if (analysis.relativeDirection === "behind") {
      adjustedBearing = (bearing + 180) % 360;
    }
    // "front" or "same" uses original bearing

    // Calculate new position using AI-estimated distance
    const distance = analysis.estimatedDistance;
    const latOffset =
      (distance * Math.cos((adjustedBearing * Math.PI) / 180)) / R;
    const lonOffset =
      (distance * Math.sin((adjustedBearing * Math.PI) / 180)) /
      (R * Math.cos((basePositions[photo1Index].latitude * Math.PI) / 180));

    // Blend AI correction with GPS position (weighted by confidence)
    const aiWeight = analysis.confidence;
    const gpsWeight = 1 - aiWeight;

    const baseAccuracy = correctedPositions[photo2Index].accuracy;
    correctedPositions[photo2Index] = {
      latitude:
        correctedPositions[photo2Index].latitude * gpsWeight +
        (correctedPositions[photo1Index].latitude + latOffset) * aiWeight,
      longitude:
        correctedPositions[photo2Index].longitude * gpsWeight +
        (correctedPositions[photo1Index].longitude + lonOffset) * aiWeight,
      accuracy:
        baseAccuracy * gpsWeight +
        (distance * 0.1) * aiWeight, // AI adds small accuracy improvement
    };
  }

  return correctedPositions;
}

/**
 * Calculate bearing between two coordinates
 */
function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

