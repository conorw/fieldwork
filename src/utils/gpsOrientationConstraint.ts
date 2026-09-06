/**
 * GPS Orientation Constraint Utility
 * Uses device orientation/compass to constrain GPS readings to movement line
 * Helps reduce GPS drift perpendicular to movement direction
 */

import type { GPSReading } from "./gpsAveraging";

/**
 * Project GPS reading onto a movement line defined by direction
 * This filters out GPS drift perpendicular to the movement direction
 */
export function projectGPSOntoMovementLine(
  reading: GPSReading,
  movementDirection: number, // Degrees: 0° = North, 90° = East
  referencePoint: { latitude: number; longitude: number },
): GPSReading {
  // Calculate bearing from reference point to reading
  const bearing = calculateBearing(
    referencePoint.latitude,
    referencePoint.longitude,
    reading.latitude,
    reading.longitude,
  );

  // Calculate distance from reference point
  const distance = calculateDistance(
    referencePoint.latitude,
    referencePoint.longitude,
    reading.latitude,
    reading.longitude,
  );

  // Project onto movement line (only keep component along movement direction)
  // Convert angles to radians
  const movementRad = (movementDirection * Math.PI) / 180;
  const bearingRad = (bearing * Math.PI) / 180;

  // Calculate angle difference
  const angleDiff = bearingRad - movementRad;
  const projectedDistance = distance * Math.cos(angleDiff);

  // Calculate projected position along movement line
  const projectedLat =
    referencePoint.latitude +
    (projectedDistance / 6371000) * (180 / Math.PI) * Math.cos(movementRad);
  const projectedLon =
    referencePoint.longitude +
    ((projectedDistance / 6371000) * (180 / Math.PI) * Math.sin(movementRad)) /
      Math.cos((referencePoint.latitude * Math.PI) / 180);

  return {
    ...reading,
    latitude: projectedLat,
    longitude: projectedLon,
  };
}

/**
 * Filter GPS readings that deviate too far from movement line
 */
export function filterReadingsByOrientation(
  readings: GPSReading[],
  movementDirection: number,
  maxDeviation: number = 5, // Maximum deviation in meters
): GPSReading[] {
  if (readings.length === 0) return readings;

  // Use first reading as reference point
  const referencePoint = {
    latitude: readings[0].latitude,
    longitude: readings[0].longitude,
  };

  return readings.filter((reading) => {
    // Calculate bearing from reference to reading
    const bearing = calculateBearing(
      referencePoint.latitude,
      referencePoint.longitude,
      reading.latitude,
      reading.longitude,
    );

    // Calculate distance
    const distance = calculateDistance(
      referencePoint.latitude,
      referencePoint.longitude,
      reading.latitude,
      reading.longitude,
    );

    // Calculate perpendicular deviation
    const movementRad = (movementDirection * Math.PI) / 180;
    const bearingRad = (bearing * Math.PI) / 180;
    const angleDiff = bearingRad - movementRad;
    const perpendicularDeviation = Math.abs(distance * Math.sin(angleDiff));

    return perpendicularDeviation <= maxDeviation;
  });
}

/**
 * Apply orientation constraint to GPS readings
 * Projects readings onto movement line and filters outliers
 */
export function applyOrientationConstraint(
  readings: GPSReading[],
  movementDirection: number,
  options: {
    projectOntoLine?: boolean;
    filterByDeviation?: boolean;
    maxDeviation?: number;
  } = {},
): GPSReading[] {
  const {
    projectOntoLine = true,
    filterByDeviation = true,
    maxDeviation = 5,
  } = options;

  if (readings.length === 0) return readings;

  // Use first reading as reference point
  const referencePoint = {
    latitude: readings[0].latitude,
    longitude: readings[0].longitude,
  };

  let processedReadings = readings;

  // Filter by deviation first
  if (filterByDeviation) {
    processedReadings = filterReadingsByOrientation(
      processedReadings,
      movementDirection,
      maxDeviation,
    );
  }

  // Project onto movement line
  if (projectOntoLine) {
    processedReadings = processedReadings.map((reading) =>
      projectGPSOntoMovementLine(reading, movementDirection, referencePoint),
    );
  }

  return processedReadings;
}

/**
 * Calculate bearing (direction) from point A to point B
 * Returns degrees: 0° = North, 90° = East
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
  return (bearing + 360) % 360; // Normalize to 0-360
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
