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
