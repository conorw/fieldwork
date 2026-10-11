/**
 * Extract a UK + Ireland PMTiles archive from the latest Protomaps daily
 * planet (z0–15, ~3 GiB) plus a Wrangler-sized z0–11 cut (~153 MiB).
 *
 *   npx wrangler r2 object put fieldwork-storage/pmtiles/OUTPUT.pmtiles --file=data/pmtiles/uk-z11.pmtiles --remote --content-type=application/vnd.pmtiles
 *   npx wrangler r2 object put fieldwork-storage/pmtiles/OUTPUT.pmtiles --file=data/pmtiles/OUTPUT.pmtiles --local --content-type=application/vnd.pmtiles
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const BBOX = "-11.0,49.5,2.2,61.0";
const OUT = resolve("data/pmtiles/OUTPUT.pmtiles");
const CLI = resolve("tools/pmtiles.exe");

function latestSundayStamp(now = new Date()) {
  const start = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - now.getUTCDay(),
  );
  return new Date(start).toISOString().slice(0, 10).replaceAll("-", "");
}

async function resolvePlanetUrl() {
  const template = "https://build.protomaps.com/{date}.pmtiles";
  const start = latestSundayStamp();
  const startDate = new Date(
    `${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6, 8)}T00:00:00Z`,
  );
  for (let i = 0; i < 14; i++) {
    const stamp = new Date(startDate.getTime() - i * 86_400_000)
      .toISOString()
      .slice(0, 10)
      .replaceAll("-", "");
    const url = template.replace("{date}", stamp);
    const res = await fetch(url, { method: "HEAD" });
    if (res.ok) return url;
  }
  throw new Error("No recent Protomaps daily build found");
}

if (!existsSync(CLI)) {
  throw new Error(`Missing ${CLI}. Download go-pmtiles Windows x86_64 first.`);
}

mkdirSync(resolve("data/pmtiles"), { recursive: true });
const source = process.argv[2] || (await resolvePlanetUrl());
console.log(`extracting UK/Ireland from ${source}`);
console.log(`bbox ${BBOX} -> ${OUT}`);

const full = spawnSync(
  CLI,
  [
    "extract",
    source,
    OUT,
    `--bbox=${BBOX}`,
    "--download-threads=8",
    "--overfetch=0.05",
  ],
  { stdio: "inherit" },
);
if ((full.status ?? 1) !== 0) process.exit(full.status ?? 1);

const uploadable = resolve("data/pmtiles/uk-z11.pmtiles");
console.log(`cutting Wrangler-sized z0-11 -> ${uploadable}`);
const slim = spawnSync(
  CLI,
  ["extract", OUT, uploadable, "--maxzoom=11"],
  { stdio: "inherit" },
);
process.exit(slim.status ?? 1);
