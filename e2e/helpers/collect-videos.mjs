/**
 * Copy Playwright video.webm artifacts into e2e/videos/<scenario>.webm
 * Run after `playwright test` — videos are finalized after each test's afterEach.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = path.join(ROOT, "test-results");
const OUT = path.join(ROOT, "videos");

/** Match Playwright output folder → stable scenario id (order: specific first) */
const MAP = [
  [/onboarding-fone|fone-extract|dennis|beryl/i, "onboarding-fone-extract-plot"],
  [/new-cemetery-onboarding|onboarding-new-cemetery/i, "new-cemetery-onboarding"],
  [/auth-sign-in|email-sign-in/i, "auth-sign-in"],
  [/auth-sign-up|create-account/i, "auth-sign-up"],
  [/join-cemetery|join-public-cemetery/i, "join-cemetery"],
  [/teach-finish-later|defer-teaching/i, "teach-finish-later"],
  [/headstone-confirm|review-and-confirm-names/i, "headstone-confirm"],
  [/map-browse|browse-map-and-select-plot/i, "map-browse"],
  [/create-plot-skip-photo|without-photo/i, "create-plot-skip-photo"],
  [/create-plot-map-point|add-plot-at-map-location/i, "create-plot-map-point"],
  [/create-plot-photo|create-plot-with-photo/i, "create-plot-photo"],
  [/plots-search-filter|search-and-filter-plots/i, "plots-search-filter"],
  [/plot-detail-edit|edit-plot-and-add-person/i, "plot-detail-edit"],
  [/settings-facility-ai|facility-and-open-teach/i, "settings-facility-ai"],
  [/app-shell-nav|map-plots-settings-sign-out/i, "app-shell-nav"],
  [/location-admin|admin-invite-and-approve/i, "location-admin"],
];

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (ent.name === "video.webm") acc.push(p);
  }
  return acc;
}

fs.mkdirSync(OUT, { recursive: true });

// Clear previous poorly-named copies
for (const f of fs.readdirSync(OUT)) {
  if (f.endsWith(".webm")) fs.unlinkSync(path.join(OUT, f));
}

const videos = walk(RESULTS);
const written = new Set();
let n = 0;
for (const src of videos) {
  const folder = path.basename(path.dirname(src));
  const hit = MAP.find(([re]) => re.test(folder));
  if (!hit) {
    console.warn(`SKIP unmatched: ${folder}`);
    continue;
  }
  const name = hit[1];
  if (written.has(name)) continue; // keep first (newest run usually sole)
  written.add(name);
  const dest = path.join(OUT, `${name}.webm`);
  fs.copyFileSync(src, dest);
  console.log(`OK  ${name}.webm  (${fs.statSync(dest).size} bytes)`);
  n++;
}
console.log(`\nCollected ${n} video(s) → ${OUT}`);
if (n === 0) {
  console.warn("No videos collected");
  process.exitCode = 1;
}
