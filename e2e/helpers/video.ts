import fs from "node:fs";
import path from "node:path";
import type { TestInfo } from "@playwright/test";

/** Copy Playwright's recorded webm to e2e/videos/<name>.webm */
export function saveScenarioVideo(testInfo: TestInfo, name: string): string {
  const dest = path.join(process.cwd(), "e2e", "videos", `${name}.webm`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  const candidates: string[] = [];
  for (const a of testInfo.attachments) {
    if (a.contentType?.includes("video") && a.path) candidates.push(a.path);
    if (a.name === "video" && a.path) candidates.push(a.path);
  }
  const direct = path.join(testInfo.outputDir, "video.webm");
  if (fs.existsSync(direct)) candidates.push(direct);

  const src = candidates.find((p) => fs.existsSync(p));
  if (!src) {
    console.warn(`[e2e] No video for scenario "${name}"`);
    return "";
  }
  fs.copyFileSync(src, dest);
  console.log(`[e2e] Video → ${dest}`);
  return dest;
}

export async function pause(ms = 500): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}
