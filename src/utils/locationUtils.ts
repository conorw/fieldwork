/**
 * Shared utilities for location-related operations
 */

import { fromLonLat, toLonLat } from "ol/proj";

export interface Location {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: number;
}

export interface Bounds {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

/**
 * Check if a location is within the specified bounds
 * @param location - The location to check
 * @param extent - The bounds extent [minLon, minLat, maxLon, maxLat]
 * @returns true if location is within bounds, false otherwise
 */
export const isLocationWithinBounds = (
  location: Location | null,
  extent: number[] | null,
): boolean => {
  if (!extent || !location) {
    return true; // No bounds restriction or no location
  }

  const [minLon, minLat, maxLon, maxLat] = extent;
  const { longitude, latitude } = location;

  return (
    longitude >= minLon &&
    longitude <= maxLon &&
    latitude >= minLat &&
    latitude <= maxLat
  );
};

/**
 * Convert location to bounds format
 * @param location - The location to convert
 * @returns bounds object
 */
export const locationToBounds = (location: Location): Bounds => {
  return {
    minLon: location.longitude,
    minLat: location.latitude,
    maxLon: location.longitude,
    maxLat: location.latitude,
  };
};

/**
 * Create a default location (Ballycastle, Northern Ireland)
 * @returns default location object
 */
export const getDefaultLocation = (): Location => {
  return {
    longitude: -6.2389,
    latitude: 55.2044,
    accuracy: 0,
  };
};

/**
 * Generate plot geometry from location, size, and direction
 */
export const generatePlotGeometry = (
  location: Location,
  plotSize: { width: number; height: number },
  direction: number = 0,
): string => {
  // Validate inputs
  if (!location) {
    throw new Error("Location is required to generate plot geometry");
  }

  if (!location.latitude || !location.longitude) {
    throw new Error("Location must have valid latitude and longitude");
  }

  if (!plotSize || !plotSize.width || !plotSize.height) {
    throw new Error("Plot size is required to generate plot geometry");
  }

  // Convert feet to meters
  const widthMeters = plotSize.width * 0.3048; // Long side (head to foot)
  const heightMeters = plotSize.height * 0.3048; // Short side (left to right)

  // Convert meters to degrees (approximate)
  const latDegreesPerMeter = 1 / 111320;
  const lonDegreesPerMeter =
    1 / (111320 * Math.cos((location.latitude * Math.PI) / 180));

  // Width (long side) should go North-South, Height (short side) should go East-West
  // So we swap the degrees: width uses lat (North-South), height uses lon (East-West)
  const widthDegrees = widthMeters * latDegreesPerMeter; // North-South
  const heightDegrees = heightMeters * lonDegreesPerMeter; // East-West

  // Create rectangle corners in lat/lng
  // Rectangle is created with width going North-South (latitude) and height going East-West (longitude)
  const halfWidth = widthDegrees / 2; // Half of North-South dimension
  const halfHeight = heightDegrees / 2; // Half of East-West dimension

  const centerLon = location.longitude;
  const centerLat = location.latitude;
  const center = fromLonLat([centerLon, centerLat]);
  const angleRad = (direction * Math.PI) / 180;

  // Create unrotated rectangle corners in lat/lng
  const latLonCorners = [
    [centerLon - halfHeight, centerLat - halfWidth], // Bottom-left
    [centerLon + halfHeight, centerLat - halfWidth], // Bottom-right
    [centerLon + halfHeight, centerLat + halfWidth], // Top-right
    [centerLon - halfHeight, centerLat + halfWidth], // Top-left
    [centerLon - halfHeight, centerLat - halfWidth], // Close polygon
  ];

  // Convert corners to map coordinates (EPSG:3857) for proper rotation
  // Rotation in lat/lon space causes skewing due to longitude convergence
  let mapCorners = latLonCorners.map(([lon, lat]) => fromLonLat([lon, lat]));

  // Apply rotation if direction is not 0
  // Direction: 0° = North, 90° = East (clockwise)
  // Rectangle is created North-South by default, so we rotate by the direction angle
  if (direction !== 0) {
    const [centerX, centerY] = center;
    mapCorners = mapCorners.map(([x, y]) => {
      // Translate to origin
      const translatedX = x - centerX;
      const translatedY = y - centerY;

      // Rotate in map coordinate space (where rotations work correctly)
      const rotatedX =
        translatedX * Math.cos(angleRad) - translatedY * Math.sin(angleRad);
      const rotatedY =
        translatedX * Math.sin(angleRad) + translatedY * Math.cos(angleRad);

      // Translate back
      return [rotatedX + centerX, rotatedY + centerY];
    });
  }

  // Shift the rectangle so the user is positioned at the FOOT of the grave
  // The foot is the edge opposite to the direction the user is facing
  // User should be at the center of the foot edge (short side)
  // We shift the rectangle by half the width in the direction the user is facing
  const shiftDistanceMeters = widthMeters / 2; // Distance from center to foot edge in meters

  // Calculate shift in map coordinates based on user direction
  // Direction: 0° = North, so cos(0°) = 1 (shift north), sin(0°) = 0 (no east shift)
  // We want to move the polygon away from the user in the direction they're facing
  const shiftX = shiftDistanceMeters * Math.sin(angleRad); // East-West shift (x increases east)
  const shiftY = shiftDistanceMeters * Math.cos(angleRad); // North-South shift (y increases north)

  // Apply shift to all corners in map coordinate space
  mapCorners = mapCorners.map(([x, y]) => {
    // Shift in map coordinates
    return [x + shiftX, y + shiftY];
  });

  // Convert back to lat/lng for GeoJSON
  const corners = mapCorners.map(([x, y]) => toLonLat([x, y]));

  // Convert to GeoJSON Polygon format
  const polygon = {
    type: "Polygon",
    coordinates: [corners],
  };

  return JSON.stringify(polygon);
};
