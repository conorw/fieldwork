/**
 * GPS Averaging and Filtering Utilities
 * Improves GPS accuracy by averaging multiple readings and filtering outliers
 */

export interface GPSReading {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  heading?: number;
  speed?: number;
}

export interface AveragedGPSResult {
  latitude: number;
  longitude: number;
  accuracy: number;
  readingsCount: number;
  readings: GPSReading[];
  standardDeviation: number;
}

/**
 * Calculate distance between two GPS coordinates (Haversine formula)
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate standard deviation of GPS readings
 */
function calculateStandardDeviation(readings: GPSReading[]): number {
  if (readings.length < 2) return 0;

  const centerLat =
    readings.reduce((sum, r) => sum + r.latitude, 0) / readings.length;
  const centerLon =
    readings.reduce((sum, r) => sum + r.longitude, 0) / readings.length;

  const distances = readings.map((r) =>
    calculateDistance(centerLat, centerLon, r.latitude, r.longitude),
  );

  const mean = distances.reduce((sum, d) => sum + d, 0) / distances.length;
  const variance =
    distances.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) /
    distances.length;

  return Math.sqrt(variance);
}

/**
 * Filter outliers using IQR (Interquartile Range) method
 */
function filterOutliers(readings: GPSReading[]): GPSReading[] {
  if (readings.length < 4) return readings;

  const centerLat =
    readings.reduce((sum, r) => sum + r.latitude, 0) / readings.length;
  const centerLon =
    readings.reduce((sum, r) => sum + r.longitude, 0) / readings.length;

  const distances = readings.map((r, i) => ({
    reading: r,
    distance: calculateDistance(
      centerLat,
      centerLon,
      r.latitude,
      r.longitude,
    ),
    index: i,
  }));

  distances.sort((a, b) => a.distance - b.distance);

  const q1Index = Math.floor(distances.length * 0.25);
  const q3Index = Math.floor(distances.length * 0.75);
  const q1 = distances[q1Index].distance;
  const q3 = distances[q3Index].distance;
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  return distances
    .filter((d) => d.distance >= lowerBound && d.distance <= upperBound)
    .map((d) => d.reading);
}

/**
 * Average multiple GPS readings with outlier filtering
 */
export function averageGPSReadings(
  readings: GPSReading[],
  filterOutliersEnabled = true,
): AveragedGPSResult {
  if (readings.length === 0) {
    throw new Error("No GPS readings provided");
  }

  if (readings.length === 1) {
    return {
      latitude: readings[0].latitude,
      longitude: readings[0].longitude,
      accuracy: readings[0].accuracy,
      readingsCount: 1,
      readings: readings,
      standardDeviation: 0,
    };
  }

  // Filter outliers if enabled
  const filteredReadings = filterOutliersEnabled
    ? filterOutliers(readings)
    : readings;

  // Calculate weighted average (weight by inverse of accuracy)
  let totalWeight = 0;
  let weightedLat = 0;
  let weightedLon = 0;
  let bestAccuracy = Infinity;

  filteredReadings.forEach((reading) => {
    // Weight is inverse of accuracy (more accurate = higher weight)
    // Add small epsilon to avoid division by zero
    const weight = 1 / (reading.accuracy + 0.1);
    totalWeight += weight;
    weightedLat += reading.latitude * weight;
    weightedLon += reading.longitude * weight;
    bestAccuracy = Math.min(bestAccuracy, reading.accuracy);
  });

  const averagedLat = weightedLat / totalWeight;
  const averagedLon = weightedLon / totalWeight;

  // Calculate standard deviation
  const stdDev = calculateStandardDeviation(filteredReadings);

  return {
    latitude: averagedLat,
    longitude: averagedLon,
    accuracy: bestAccuracy + stdDev, // Add std dev to accuracy estimate
    readingsCount: filteredReadings.length,
    readings: filteredReadings,
    standardDeviation: stdDev,
  };
}

/**
 * Collect multiple GPS readings over time
 */
export async function collectGPSReadings(
  getReading: () => Promise<GPSReading>,
  options: {
    count?: number;
    interval?: number;
    minAccuracy?: number;
    maxDuration?: number;
  } = {},
): Promise<GPSReading[]> {
  const {
    count = 5,
    interval = 1000, // 1 second between readings
    minAccuracy = 10, // Only accept readings with accuracy better than 10m
    maxDuration = 10000, // Max 10 seconds total
  } = options;

  const readings: GPSReading[] = [];
  const startTime = Date.now();

  for (let i = 0; i < count; i++) {
    // Check if we've exceeded max duration
    if (Date.now() - startTime > maxDuration) {
      break;
    }

    try {
      const reading = await getReading();

      // Only accept readings that meet accuracy threshold
      if (reading.accuracy <= minAccuracy) {
        readings.push(reading);
      } else {
        console.warn(
          `GPS reading ${i + 1} rejected: accuracy ${reading.accuracy}m exceeds threshold ${minAccuracy}m`,
        );
      }

      // Wait before next reading (except for last one)
      if (i < count - 1) {
        await new Promise((resolve) => setTimeout(resolve, interval));
      }
    } catch (error) {
      console.error(`Error collecting GPS reading ${i + 1}:`, error);
      // Continue trying other readings
    }
  }

  if (readings.length === 0) {
    throw new Error("No valid GPS readings collected");
  }

  return readings;
}

