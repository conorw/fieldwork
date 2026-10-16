export interface RgbaImage {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
}

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Dark stone face, ignoring bright grass around it. */
export function stoneBounds(image: RgbaImage): PixelRect | null {
  const { data, width, height } = image;
  if (width < 8 || height < 8) return null;
  const colDark = new Uint32Array(width);
  const rowDark = new Uint32Array(height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const green = g > r + 12 && g > b + 8;
      if (luma(r, g, b) < 85 && !green) {
        colDark[x] += 1;
        rowDark[y] += 1;
      }
    }
  }
  const rowCut = Math.max(8, height * 0.06);
  const colCut = Math.max(8, width * 0.06);
  let top = 0;
  let bottom = height - 1;
  let left = 0;
  let right = width - 1;
  while (top < height && (rowDark[top] ?? 0) < rowCut) top += 1;
  while (bottom > top && (rowDark[bottom] ?? 0) < rowCut) bottom -= 1;
  while (left < width && (colDark[left] ?? 0) < colCut) left += 1;
  while (right > left && (colDark[right] ?? 0) < colCut) right -= 1;
  const rectWidth = right - left + 1;
  const rectHeight = bottom - top + 1;
  if (rectWidth < width * 0.15 || rectHeight < height * 0.2) return null;
  return { x: left, y: top, width: rectWidth, height: rectHeight };
}

/** The smaller opening lines sit in the top band of the stone. */
export function headerBand(width: number, height: number): PixelRect {
  const x = Math.round(width * 0.18);
  const y = Math.round(height * 0.04);
  return {
    x,
    y,
    width: Math.max(1, Math.round(width * 0.64)),
    height: Math.max(1, Math.round(height * 0.22)),
  };
}
