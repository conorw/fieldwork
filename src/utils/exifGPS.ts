/**
 * EXIF GPS Extraction Utility
 * Extracts GPS coordinates from photo EXIF metadata
 * Camera GPS is often more accurate than app GPS
 */

import exifr from "exifr";

export interface EXIFGPSData {
  latitude: number;
  longitude: number;
  accuracy?: number; // Estimated accuracy in meters
  altitude?: number;
  timestamp?: number;
}

/**
 * Extract GPS data from photo file/blob
 */
export async function extractEXIFGPS(
  file: File | Blob,
): Promise<EXIFGPSData | null> {
  try {
    // Extract GPS data from EXIF
    const gpsData = await exifr.gps(file);

    if (!gpsData || !gpsData.latitude || !gpsData.longitude) {
      return null;
    }

    // Extract additional metadata
    const fullExif = await exifr.parse(file, {
      gps: true,
      exif: true,
    });

    const result: EXIFGPSData = {
      latitude: gpsData.latitude,
      longitude: gpsData.longitude,
    };

    // Add altitude if available (from fullExif, not gpsData)
    if (fullExif?.GPSAltitude !== undefined) {
      result.altitude = fullExif.GPSAltitude;
    }

    // Add timestamp if available
    if (fullExif?.DateTimeOriginal) {
      const timestamp = new Date(fullExif.DateTimeOriginal).getTime();
      if (!isNaN(timestamp)) {
        result.timestamp = timestamp;
      }
    }

    // Estimate accuracy based on GPS precision
    // GPSDOP (Dilution of Precision) can indicate accuracy
    // Lower DOP = better accuracy
    if (fullExif?.GPSDOP !== undefined) {
      // Rough estimate: DOP * 3-5 meters is typical accuracy
      result.accuracy = fullExif.GPSDOP * 4;
    } else {
      // Default estimate: assume camera GPS is reasonably accurate
      result.accuracy = 5; // 5 meters default
    }

    console.log("EXIF GPS extracted:", result);
    return result;
  } catch (error) {
    console.warn("Failed to extract EXIF GPS:", error);
    return null;
  }
}

/**
 * Extract GPS data from base64 data URL
 */
export async function extractEXIFGPSFromDataURL(
  dataUrl: string,
): Promise<EXIFGPSData | null> {
  try {
    // Convert data URL to blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    return extractEXIFGPS(blob);
  } catch (error) {
    console.warn("Failed to extract EXIF GPS from data URL:", error);
    return null;
  }
}

/**
 * Compare EXIF GPS with app GPS and return the best one
 * Prefers EXIF GPS if it's available and reasonably accurate
 */
export function selectBestGPS(
  exifGPS: EXIFGPSData | null,
  appGPS: { latitude: number; longitude: number; accuracy: number },
): {
  latitude: number;
  longitude: number;
  accuracy: number;
  source: "exif" | "app" | "hybrid";
} {
  // If no EXIF GPS, use app GPS
  if (!exifGPS) {
    return {
      ...appGPS,
      source: "app",
    };
  }

  // If EXIF GPS accuracy is better (lower) than app GPS, use EXIF
  const exifAccuracy = exifGPS.accuracy || 10; // Default 10m if not specified
  if (exifAccuracy < appGPS.accuracy) {
    return {
      latitude: exifGPS.latitude,
      longitude: exifGPS.longitude,
      accuracy: exifAccuracy,
      source: "exif",
    };
  }

  // If accuracies are similar (within 20%), use weighted average
  const accuracyDiff = Math.abs(exifAccuracy - appGPS.accuracy);
  const avgAccuracy = (exifAccuracy + appGPS.accuracy) / 2;
  if (accuracyDiff < avgAccuracy * 0.2) {
    // Calculate weighted average (weight by inverse of accuracy)
    const exifWeight = 1 / exifAccuracy;
    const appWeight = 1 / appGPS.accuracy;
    const totalWeight = exifWeight + appWeight;

    const hybridLat =
      (exifGPS.latitude * exifWeight + appGPS.latitude * appWeight) /
      totalWeight;
    const hybridLon =
      (exifGPS.longitude * exifWeight + appGPS.longitude * appWeight) /
      totalWeight;
    const hybridAccuracy = Math.min(exifAccuracy, appGPS.accuracy);

    return {
      latitude: hybridLat,
      longitude: hybridLon,
      accuracy: hybridAccuracy,
      source: "hybrid",
    };
  }

  // Otherwise, use app GPS (it's more accurate)
  return {
    ...appGPS,
    source: "app",
  };
}
