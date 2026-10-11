import { getPlotSizeById, plotSizeToDegrees } from "../../utils/plotSizes";

export type GraveSize = "single" | "double";

const SIZE_IDS: Record<GraveSize, string> = {
  single: "9x4",
  double: "9x8",
};

export interface GeoJsonPolygon {
  type: "Polygon";
  coordinates: number[][][];
}

/**
 * Axis-aligned grave rectangle in lon/lat, centered on a GPS fix.
 * The ring is closed. Dimensions come from the shared plot sizes.
 */
export function graveFootprint(
  latitude: number,
  longitude: number,
  size: GraveSize = "single",
): GeoJsonPolygon {
  const plotSize = getPlotSizeById(SIZE_IDS[size]);
  if (!plotSize) {
    throw new Error(`Unknown grave size: ${size}`);
  }
  const { widthDegrees, heightDegrees } = plotSizeToDegrees(
    plotSize,
    latitude,
  );
  const halfWidth = widthDegrees / 2;
  const halfHeight = heightDegrees / 2;
  const west = longitude - halfWidth;
  const east = longitude + halfWidth;
  const south = latitude - halfHeight;
  const north = latitude + halfHeight;
  const ring = [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
  return { type: "Polygon", coordinates: [ring] };
}
