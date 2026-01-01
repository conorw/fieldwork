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
  
  // Store the original direction for shift calculations
  const originalDirection = direction;
  const originalDirectionRad = (originalDirection * Math.PI) / 180;
  
  // Convert device orientation to rotation angle for map coordinates
  // Device orientation: 0° = North, 90° = East (clockwise)
  // Rectangle is created as North-South by default
  // To point it in the device direction, we need to rotate it
  // Formula matches MapEdit.vue: rotation = -device_angle + 180
  const openlayersDirection = (360 - originalDirection + 180) % 360;
  const rotationRad = (openlayersDirection * Math.PI) / 180;

  // Create unrotated rectangle corners in lat/lng
  // Rectangle is created with width (long side) going North-South
  const latLonCorners = [
    [centerLon - halfHeight, centerLat - halfWidth], // Bottom-left (South-West)
    [centerLon + halfHeight, centerLat - halfWidth], // Bottom-right (South-East)
    [centerLon + halfHeight, centerLat + halfWidth], // Top-right (North-East)
    [centerLon - halfHeight, centerLat + halfWidth], // Top-left (North-West)
    [centerLon - halfHeight, centerLat - halfWidth], // Close polygon
  ];

  // Convert corners to map coordinates (EPSG:3857) for proper rotation
  // Rotation in lat/lon space causes skewing due to longitude convergence
  let mapCorners = latLonCorners.map(([lon, lat]) => fromLonLat([lon, lat]));

  // Apply rotation if direction is not 0
  // Rotate in map coordinate space (where rotations work correctly)
  if (originalDirection !== 0) {
    const [centerX, centerY] = center;
    mapCorners = mapCorners.map(([x, y]) => {
      // Translate to origin
      const translatedX = x - centerX;
      const translatedY = y - centerY;

      // Rotate in map coordinate space
      const rotatedX =
        translatedX * Math.cos(rotationRad) - translatedY * Math.sin(rotationRad);
      const rotatedY =
        translatedX * Math.sin(rotationRad) + translatedY * Math.cos(rotationRad);

      // Translate back
      return [rotatedX + centerX, rotatedY + centerY];
    });
  }

  // Shift the rectangle so the user is positioned AT the FOOT of the grave (outside the rectangle)
  // The foot is the edge opposite to the direction the user is facing
  // User should be positioned just outside the foot edge (short side), not on top of it
  // We shift the rectangle by half the width PLUS a buffer to position user outside
  // The buffer needs to be at least half the height (short side) to ensure user is outside
  const bufferMeters = heightMeters / 2 + 0.5; // Buffer = half height + small margin to ensure user is outside
  const shiftDistanceMeters = widthMeters / 2 + bufferMeters; // Distance from center to foot edge + buffer

  // Calculate shift in map coordinates based on ORIGINAL user direction (not rotated)
  // Direction: 0° = North, so cos(0°) = 1 (shift north), sin(0°) = 0 (no east shift)
  // We want to move the polygon away from the user in the direction they're facing
  // In map coordinates: x increases east, y increases north
  const shiftX = shiftDistanceMeters * Math.sin(originalDirectionRad); // East-West shift (x increases east)
  const shiftY = shiftDistanceMeters * Math.cos(originalDirectionRad); // North-South shift (y increases north)

  // Apply shift to all corners in map coordinate space
  mapCorners = mapCorners.map(([x, y]) => {
    // Shift in map coordinates - move rectangle away from user in their facing direction
    // This positions the user outside the rectangle at the foot edge
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
