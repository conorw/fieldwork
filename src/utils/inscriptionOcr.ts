import { createWorker } from "tesseract.js";
import type { Worker } from "tesseract.js";
import { mergeHeaderText, parseInscription } from "./inscriptionRead";
import type { InscriptionReading } from "./inscriptionRead";
import { headerBand, stoneBounds } from "./stoneCrop";

const OCR_PARAMS = {
  tessedit_pageseg_mode: "4" as const,
  user_defined_dpi: "300",
};

// Same-origin copies of the tesseract worker, core, and English data.
// A service worker must not be asked to fetch these from a CDN.
const OCR_ROOT = "/ocr";

let workerPromise: Promise<Worker> | null = null;

async function ocrWorker(): Promise<Worker> {
  if (!workerPromise) {
    const pending = createWorker("eng", 1, {
      workerPath: `${OCR_ROOT}/worker.min.js`,
      corePath: OCR_ROOT,
      langPath: OCR_ROOT,
      workerBlobURL: false,
      gzip: false,
      cacheMethod: "none",
    });
    workerPromise = pending
      .then(async (worker) => {
        await worker.setParameters(OCR_PARAMS);
        return worker;
      })
      .catch((error) => {
        workerPromise = null;
        throw error;
      });
  }
  return workerPromise;
}

function canvasFrom(
  bitmap: ImageBitmap,
  x: number,
  y: number,
  width: number,
  height: number,
  scale = 1,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  ctx?.drawImage(bitmap, x, y, width, height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Read the inscription on this device.
 * The full stone is one column of text. The opening line is smaller, so it
 * is read again from the top band and merged in.
 */
export async function readHeadstoneInscription(
  file: Blob,
): Promise<InscriptionReading | null> {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") {
    return null;
  }
  const bitmap = await createImageBitmap(file);
  const full = canvasFrom(bitmap, 0, 0, bitmap.width, bitmap.height);
  const band = headerBand(bitmap.width, bitmap.height);
  const header = canvasFrom(bitmap, band.x, band.y, band.width, band.height, 2);
  bitmap.close();
  const worker = await ocrWorker();
  const body = await worker.recognize(full);
  const opening = await worker.recognize(header);
  const reading = parseInscription(mergeHeaderText(body.data.text, opening.data.text));
  const usable = reading.people.some(
    (person) => person.full_name.includes(" ") && (person.birth || person.death),
  );
  return usable ? reading : null;
}

/** Crop away grass before the vision model sees the photo. */
export async function cropStoneFile(file: File): Promise<File> {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") {
    return file;
  }
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const bounds = stoneBounds({
    data: pixels.data,
    width: canvas.width,
    height: canvas.height,
  });
  if (!bounds) return file;
  if (bounds.width * bounds.height > canvas.width * canvas.height * 0.9) return file;
  const cropped = document.createElement("canvas");
  cropped.width = bounds.width;
  cropped.height = bounds.height;
  cropped
    .getContext("2d")
    ?.drawImage(
      canvas,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      0,
      0,
      bounds.width,
      bounds.height,
    );
  const blob = await new Promise<Blob | null>((resolve) => {
    cropped.toBlob((value) => resolve(value), "image/jpeg", 0.92);
  });
  if (!blob) return file;
  return new File([blob], file.name || "stone.jpg", { type: "image/jpeg" });
}
