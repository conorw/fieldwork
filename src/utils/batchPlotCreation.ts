/**
 * Utility for creating plots from processed batch capture data
 */

import type {
  ProcessedBatch,
  ProcessedBatchPhoto,
} from "../types/batchCapture";
import { generatePlotGeometry } from "./locationUtils";
import { DEFAULT_PLOT_SIZE } from "./plotSizes";
import type { PlotRecord } from "../powersync-schema";

export interface BatchPlotData {
  geometry: string; // GeoJSON string
  location: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
  photoId?: string;
  personData?: any[];
  order: number;
}

/**
 * Generate plot geometry for a batch photo
 */
function generatePlotGeometryForBatch(
  photo: ProcessedBatchPhoto,
  plotSize: { width: number; height: number },
  movementDirection: number, // Direction perpendicular to movement (for orientation)
): string {
  // Use the calculated position
  const location = {
    latitude: photo.calculatedPosition.latitude,
    longitude: photo.calculatedPosition.longitude,
    accuracy: photo.calculatedPosition.accuracy,
  };

  // Orientation: perpendicular to movement direction
  // If user was facing north (0°), plots should be oriented east-west (90°)
  const plotOrientation = (movementDirection + 90) % 360;

  return generatePlotGeometry(location, plotSize, plotOrientation);
}

/**
 * Create plots from processed batch data
 */
export async function createPlotsFromBatch(
  processedBatch: ProcessedBatch,
  plotSize: { width: number; height: number } = DEFAULT_PLOT_SIZE,
): Promise<BatchPlotData[]> {
  if (processedBatch.photos.length === 0) {
    return [];
  }

  // Determine movement direction
  let movementDirection = 0;
  if (processedBatch.movementLine) {
    // Perpendicular to movement line
    movementDirection = (processedBatch.movementLine.bearing + 90) % 360;
  } else if (processedBatch.photos.length > 0) {
    // Use average direction from photos
    const avgDirection =
      processedBatch.photos.reduce(
        (sum, photo) => sum + photo.direction,
        0,
      ) / processedBatch.photos.length;
    movementDirection = (avgDirection + 90) % 360;
  }

  const plotData: BatchPlotData[] = [];

  for (let i = 0; i < processedBatch.photos.length; i++) {
    const photo = processedBatch.photos[i];

    // Generate geometry
    const geometry = generatePlotGeometryForBatch(
      photo,
      plotSize,
      movementDirection,
    );

    plotData.push({
      geometry,
      location: {
        latitude: photo.calculatedPosition.latitude,
        longitude: photo.calculatedPosition.longitude,
        accuracy: photo.calculatedPosition.accuracy,
      },
      photoId: photo.id,
      personData: photo.personData,
      order: i + 1,
    });
  }

  return plotData;
}

/**
 * Prepare plot data for database insertion
 */
export function preparePlotDataForInsertion(
  plotData: BatchPlotData,
  options: {
    section?: string;
    row?: string;
    numberPrefix?: string;
    locationId?: string;
    status?: string;
    userId: string;
  },
): Omit<PlotRecord, "id"> {
  const plotNumber = options.numberPrefix
    ? `${options.numberPrefix}${plotData.order}`
    : plotData.order.toString();

  return {
    geometry: plotData.geometry,
    section: options.section || "",
    row: options.row || "",
    number: plotNumber,
    status: options.status || "Active",
    location_id: options.locationId || null,
    temp_plot_id: null,
    date_created: new Date().toISOString(),
    date_modified: new Date().toISOString(),
    created_by: options.userId,
    modified_by: options.userId,
    notes: "",
  };
}

