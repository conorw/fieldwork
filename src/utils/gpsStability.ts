/**
 * GPS Stability Checker
 * Monitors GPS readings to determine when GPS is stable enough for accurate capture
 */

import type { GPSReading } from "./gpsAveraging";

export interface GPSStabilityResult {
  isStable: boolean;
  accuracy: number;
  readings: GPSReading[];
  stabilityScore: number; // 0-1, higher is more stable
}

/**
 * Check if GPS readings indicate stability
 * Stability is determined by:
 * - Consistent accuracy (low variance)
 * - Good accuracy threshold (better than threshold)
 * - Consistent position (low position variance)
 */
export function checkGPSStability(
  readings: GPSReading[],
  options: {
    minReadings?: number;
    maxAccuracy?: number; // meters
    maxPositionVariance?: number; // meters
    maxAccuracyVariance?: number; // meters
  } = {},
): GPSStabilityResult {
  const {
    minReadings = 3,
    maxAccuracy = 15, // Default: 15m accuracy required
    maxPositionVariance = 5, // Default: 5m position variance allowed
    maxAccuracyVariance = 3, // Default: 3m accuracy variance allowed
  } = options;

  if (readings.length < minReadings) {
    return {
      isStable: false,
      accuracy: readings.length > 0 ? readings[0].accuracy : Infinity,
      readings,
      stabilityScore: 0,
    };
  }

  // Calculate average accuracy
  const avgAccuracy =
    readings.reduce((sum, r) => sum + r.accuracy, 0) / readings.length;

  // Calculate accuracy variance
  const accuracyVariance =
    readings.reduce(
      (sum, r) => sum + Math.pow(r.accuracy - avgAccuracy, 2),
      0,
    ) / readings.length;
  const accuracyStdDev = Math.sqrt(accuracyVariance);

  // Calculate position variance (distance from centroid)
  const avgLat =
    readings.reduce((sum, r) => sum + r.latitude, 0) / readings.length;
  const avgLon =
    readings.reduce((sum, r) => sum + r.longitude, 0) / readings.length;

  const distances = readings.map((r) => {
    const R = 6371000; // Earth's radius in meters
    const dLat = ((r.latitude - avgLat) * Math.PI) / 180;
    const dLon = ((r.longitude - avgLon) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((avgLat * Math.PI) / 180) *
        Math.cos((r.latitude * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  });

  const maxDistance = Math.max(...distances);

  // Check stability criteria
  const meetsAccuracyThreshold = avgAccuracy <= maxAccuracy;
  const meetsAccuracyVariance = accuracyStdDev <= maxAccuracyVariance;
  const meetsPositionVariance = maxDistance <= maxPositionVariance;

  const isStable =
    meetsAccuracyThreshold && meetsAccuracyVariance && meetsPositionVariance;

  // Calculate stability score (0-1)
  const accuracyScore = Math.max(0, 1 - avgAccuracy / maxAccuracy);
  const varianceScore = Math.max(
    0,
    1 - accuracyStdDev / maxAccuracyVariance,
  );
  const positionScore = Math.max(0, 1 - maxDistance / maxPositionVariance);
  const stabilityScore = (accuracyScore + varianceScore + positionScore) / 3;

  return {
    isStable,
    accuracy: avgAccuracy,
    readings,
    stabilityScore,
  };
}

/**
 * Monitor GPS and wait for stability with progressive accuracy thresholds
 * Supports both polling (getReading function) and watchPosition (onReading callback)
 */
export async function waitForGPSStability(
  getReading: () => Promise<GPSReading>,
  options: {
    minReadings?: number;
    maxAccuracy?: number;
    maxPositionVariance?: number;
    maxAccuracyVariance?: number;
    checkInterval?: number; // milliseconds between checks
    maxWaitTime?: number; // maximum time to wait in milliseconds
    onProgress?: (result: GPSStabilityResult) => void;
    useProgressiveAccuracy?: boolean; // Enable progressive accuracy thresholds
  } = {},
): Promise<GPSStabilityResult> {
  const {
    minReadings = 3,
    maxAccuracy = 15,
    maxPositionVariance = 5,
    maxAccuracyVariance = 3,
    checkInterval = 500, // Reduced to 500ms for faster detection
    maxWaitTime = 30000, // Max 30 seconds
    onProgress,
    useProgressiveAccuracy = true,
  } = options;

  const readings: GPSReading[] = [];
  const startTime = Date.now();

  // Progressive accuracy thresholds: start lenient, get stricter over time
  const getProgressiveAccuracy = (elapsedTime: number): number => {
    if (!useProgressiveAccuracy) {
      return maxAccuracy;
    }
    
    // First 5 seconds: accept up to 20m
    if (elapsedTime < 5000) {
      return Math.max(maxAccuracy, 20);
    }
    // 5-15 seconds: accept up to 15m (or maxAccuracy if lower)
    if (elapsedTime < 15000) {
      return maxAccuracy;
    }
    // After 15 seconds: try to get better than maxAccuracy
    return Math.max(10, maxAccuracy * 0.8);
  };

  // Polling mode (using getReading function)
  while (Date.now() - startTime < maxWaitTime) {
    try {
      // Get a new reading
      const reading = await getReading();
      readings.push(reading);

      // Keep only recent readings (last minReadings * 2)
      if (readings.length > minReadings * 2) {
        readings.shift();
      }

      // Check stability if we have enough readings
      if (readings.length >= minReadings) {
        const elapsedTime = Date.now() - startTime;
        const progressiveAccuracy = getProgressiveAccuracy(elapsedTime);
        
        const stability = checkGPSStability(readings, {
          minReadings,
          maxAccuracy: progressiveAccuracy,
          maxPositionVariance,
          maxAccuracyVariance,
        });

        // Report progress
        if (onProgress) {
          onProgress(stability);
        }

        // If stable, return
        if (stability.isStable) {
          return stability;
        }
      }

      // Wait before next check
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    } catch (error) {
      console.warn("Error getting GPS reading:", error);
      
      // If it's a timeout or permission error, and we have no readings yet, throw to allow fallback
      if (readings.length === 0 && error instanceof GeolocationPositionError) {
        if (error.code === 3 || error.code === 1) { // TIMEOUT or PERMISSION_DENIED
          throw error;
        }
      }
      
      // Continue trying for other errors
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }
  }

  // Timeout - return current state
  const finalStability = checkGPSStability(readings, {
    minReadings,
    maxAccuracy,
    maxPositionVariance,
    maxAccuracyVariance,
  });

  return finalStability;
}

