/** Last path segment, ignoring a revision query or a Hub commit in the URL. */
export function modelFileName(url: string): string {
  const path = url.split("?")[0].split("#")[0];
  const leaf = path.split("/").pop() || "";
  try {
    return decodeURIComponent(leaf);
  } catch {
    return leaf;
  }
}

/** Hugging Face weights and the ONNX runtime are loaded from these hosts. */
export function isRemoteModelRequest(url: string): boolean {
  return /huggingface\.co|hf\.co|jsdelivr\.net|xethub|cdn-lfs/i.test(url);
}

/**
 * True when a model response is an HTML page.
 * Weight files are skipped from the body read so a graph is not pulled into a string.
 */
export async function isHtmlBody(response: Response): Promise<boolean> {
  const type = response.headers.get("content-type") || "";
  if (/text\/html/i.test(type)) return true;
  if (/octet-stream|wasm|onnx|gzip|protobuf/i.test(type)) return false;
  const lengthHeader = response.headers.get("content-length");
  const length = lengthHeader ? Number(lengthHeader) : NaN;
  if (!Number.isFinite(length) || length > 1_000_000) return false;
  const head = (await response.clone().text()).slice(0, 80);
  return /^\s*<(?:!doctype|html)\b/i.test(head);
}
