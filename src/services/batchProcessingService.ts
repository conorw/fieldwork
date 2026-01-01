/**
 * Service for processing batch grave capture sessions
 * Analyzes GPS patterns and calculates relative positions
 */

import type {
  BatchCaptureSession,
  BatchCapturePhoto,
  ProcessedBatch,
  ProcessedBatchPhoto,
} from "../types/batchCapture";

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
 * Calculate bearing between two GPS coordinates
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

/**
 * Project a point onto a line defined by two points
 */
function projectPointOntoLine(
  point: { lat: number; lon: number },
  lineStart: { lat: number; lon: number },
  lineEnd: { lat: number; lon: number },
): {
  projected: { lat: number; lon: number };
  distance: number; // Perpendicular distance from line
  t: number; // Parameter along line (0 = start, 1 = end)
} {
  // Convert to meters for calculation
  const R = 6371000;
  const toMeters = (lat: number, lon: number) => {
    return {
      x: (lon * Math.PI * R) / 180,
      y: (lat * Math.PI * R) / 180,
    };
  };

  const p = toMeters(point.lat, point.lon);
  const a = toMeters(lineStart.lat, lineStart.lon);
  const b = toMeters(lineEnd.lat, lineEnd.lon);

  // Vector from a to b
  const ab = { x: b.x - a.x, y: b.y - a.y };
  const ap = { x: p.x - a.x, y: p.y - a.y };

  // Project ap onto ab
  const abLengthSq = ab.x * ab.x + ab.y * ab.y;
  if (abLengthSq === 0) {
    return {
      projected: point,
      distance: 0,
      t: 0,
    };
  }

  const t = (ap.x * ab.x + ap.y * ab.y) / abLengthSq;
  const projectedMeters = {
    x: a.x + t * ab.x,
    y: a.y + t * ab.y,
  };

  // Convert back to lat/lon
  const projected = {
    lat: (projectedMeters.y * 180) / (Math.PI * R),
    lon: (projectedMeters.x * 180) / (Math.PI * R),
  };

  // Calculate perpendicular distance
  const perpDist = Math.sqrt(
    Math.pow(p.x - projectedMeters.x, 2) + Math.pow(p.y - projectedMeters.y, 2),
  );

  return {
    projected,
    distance: perpDist,
    t,
  };
}

/**
 * Analyze GPS pattern to determine layout type
 */
function analyzeGPSPattern(
  photos: BatchCapturePhoto[],
): {
  layoutType: "line" | "grid" | "scattered";
  movementLine?: {
    start: { latitude: number; longitude: number };
    end: { latitude: number; longitude: number };
    bearing: number;
  };
  averageSpacing?: number;
} {
  if (photos.length < 2) {
    return { layoutType: "scattered" };
  }

  // Calculate distances between consecutive photos
  const distances: number[] = [];
  for (let i = 1; i < photos.length; i++) {
    const dist = calculateDistance(
      photos[i - 1].gps.latitude,
      photos[i - 1].gps.longitude,
      photos[i].gps.latitude,
      photos[i].gps.longitude,
    );
    distances.push(dist);
  }

  const averageSpacing =
    distances.reduce((sum, d) => sum + d, 0) / distances.length;

  // Calculate movement line from first to last point
  const firstPhoto = photos[0];
  const lastPhoto = photos[photos.length - 1];
  const bearing = calculateBearing(
    firstPhoto.gps.latitude,
    firstPhoto.gps.longitude,
    lastPhoto.gps.latitude,
    lastPhoto.gps.longitude,
  );

  // Project all points onto the line and calculate deviations
  const deviations: number[] = [];
  for (const photo of photos) {
    const projection = projectPointOntoLine(
      { lat: photo.gps.latitude, lon: photo.gps.longitude },
      {
        lat: firstPhoto.gps.latitude,
        lon: firstPhoto.gps.longitude,
      },
      {
        lat: lastPhoto.gps.latitude,
        lon: lastPhoto.gps.longitude,
      },
    );
    deviations.push(projection.distance);
  }

  const avgDeviation =
    deviations.reduce((sum, d) => sum + d, 0) / deviations.length;
  const maxDeviation = Math.max(...deviations);

  // Determine layout type
  // If average deviation is small relative to spacing, it's a line
  // If deviation is large, it's scattered
  // Grid detection would require more complex analysis
  let layoutType: "line" | "grid" | "scattered" = "scattered";
  if (avgDeviation < averageSpacing * 0.3 && maxDeviation < averageSpacing * 0.5) {
    layoutType = "line";
  } else if (avgDeviation < averageSpacing * 0.6) {
    layoutType = "grid";
  }

  return {
    layoutType,
    movementLine: {
      start: {
        latitude: firstPhoto.gps.latitude,
        longitude: firstPhoto.gps.longitude,
      },
      end: {
        latitude: lastPhoto.gps.latitude,
        longitude: lastPhoto.gps.longitude,
      },
      bearing,
    },
    averageSpacing,
  };
}

/**
 * Calculate relative positions along a line
 */
function calculateRelativePositions(
  photos: BatchCapturePhoto[],
  movementLine: {
    start: { latitude: number; longitude: number };
    end: { latitude: number; longitude: number };
    bearing: number;
  },
): ProcessedBatchPhoto[] {
  const processed: ProcessedBatchPhoto[] = [];

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const projection = projectPointOntoLine(
      { lat: photo.gps.latitude, lon: photo.gps.longitude },
      {
        lat: movementLine.start.latitude,
        lon: movementLine.start.longitude,
      },
      {
        lat: movementLine.end.latitude,
        lon: movementLine.end.longitude,
      },
    );

    // Use projected position, but keep original accuracy estimate
    processed.push({
      ...photo,
      calculatedPosition: {
        latitude: projection.projected.lat,
        longitude: projection.projected.lon,
        accuracy: photo.gps.accuracy + projection.distance, // Add deviation to accuracy
      },
    });
  }

  return processed;
}

/**
 * Process a batch capture session
 */
export async function processBatchCapture(
  session: BatchCaptureSession,
): Promise<ProcessedBatch> {
  if (session.photos.length === 0) {
    throw new Error("No photos in batch session");
  }

  // Analyze GPS pattern
  const patternAnalysis = analyzeGPSPattern(session.photos);

  // Calculate relative positions
  let processedPhotos: ProcessedBatchPhoto[];
  if (patternAnalysis.movementLine && patternAnalysis.layoutType === "line") {
    processedPhotos = calculateRelativePositions(
      session.photos,
      patternAnalysis.movementLine,
    );
  } else {
    // For scattered/grid, use GPS positions directly
    processedPhotos = session.photos.map((photo) => ({
      ...photo,
      calculatedPosition: {
        latitude: photo.gps.latitude,
        longitude: photo.gps.longitude,
        accuracy: photo.gps.accuracy,
      },
    }));
  }

  return {
    session: {
      ...session,
      status: "processing",
    },
    photos: processedPhotos,
    movementLine: patternAnalysis.movementLine,
    layoutType: patternAnalysis.layoutType,
    averageSpacing: patternAnalysis.averageSpacing,
  };
}

/**
 * Calculate positions using standard spacing
 * Useful when GPS is unreliable but we know the spacing
 */
export function calculatePositionsWithSpacing(
  photos: BatchCapturePhoto[],
  spacing: number, // meters
  direction: number, // degrees, direction perpendicular to movement
): ProcessedBatchPhoto[] {
  if (photos.length === 0) return [];

  const processed: ProcessedBatchPhoto[] = [];
  const firstPhoto = photos[0];

  // Calculate movement direction from GPS
  let movementBearing = 0;
  if (photos.length > 1) {
    movementBearing = calculateBearing(
      firstPhoto.gps.latitude,
      firstPhoto.gps.longitude,
      photos[photos.length - 1].gps.latitude,
      photos[photos.length - 1].gps.longitude,
    );
  } else {
    // Use device direction if only one photo
    movementBearing = firstPhoto.direction;
  }

  // Perpendicular direction (90 degrees from movement)
  const perpendicularBearing = (movementBearing + 90) % 360;

  // Convert spacing to lat/lon offset
  const R = 6371000; // Earth's radius in meters
  const latOffset = (spacing * Math.cos((perpendicularBearing * Math.PI) / 180)) / R;
  const lonOffset =
    (spacing * Math.sin((perpendicularBearing * Math.PI) / 180)) /
    (R * Math.cos((firstPhoto.gps.latitude * Math.PI) / 180));

  processed.push({
    ...firstPhoto,
    calculatedPosition: {
      latitude: firstPhoto.gps.latitude,
      longitude: firstPhoto.gps.longitude,
      accuracy: firstPhoto.gps.accuracy,
    },
  });

  // Position subsequent photos using spacing
  for (let i = 1; i < photos.length; i++) {
    const prevPhoto = processed[i - 1];
    processed.push({
      ...photos[i],
      calculatedPosition: {
        latitude: prevPhoto.calculatedPosition.latitude + latOffset * i,
        longitude: prevPhoto.calculatedPosition.longitude + lonOffset * i,
        accuracy: photos[i].gps.accuracy,
      },
    });
  }

  return processed;
}

