import { FetchSource, PMTiles, findTile, zxyToTileId, type Header } from "pmtiles";
import { publicFileUrl, text, type Env } from "./env";
import { buildPmtilesV3, type ClipTile } from "./pmtilesWriter";

// Merge nearby tile byte ranges so a clip costs a handful of subrequests
// (Workers Free allows 50) instead of one per tile.
const MAX_RANGE_GAP_BYTES = 64 * 1024;
const MAX_RANGE_SPAN_BYTES = 8 * 1024 * 1024;

type LocatedTile = { z: number; x: number; y: number; offset: number; length: number };

async function locateTile(
  archive: PMTiles,
  header: Header,
  tileId: number,
): Promise<{ offset: number; length: number } | null> {
  let dirOffset = header.rootDirectoryOffset;
  let dirLength = header.rootDirectoryLength;
  for (let depth = 0; depth <= 3; depth++) {
    const dir = await archive.cache.getDirectory(
      archive.source,
      dirOffset,
      dirLength,
      header,
    );
    const entry = findTile(dir, tileId);
    if (!entry) return null;
    if (entry.runLength > 0) {
      return { offset: header.tileDataOffset + entry.offset, length: entry.length };
    }
    dirOffset = header.leafDirectoryOffset + entry.offset;
    dirLength = entry.length;
  }
  throw new Error("Maximum directory depth exceeded");
}

/** Reads raw (still-compressed) tile bytes, coalescing adjacent ranges. */
async function readTilesCoalesced(
  archive: PMTiles,
  header: Header,
  wanted: Array<{ z: number; x: number; y: number }>,
): Promise<ClipTile[]> {
  const located: LocatedTile[] = [];
  for (const t of wanted) {
    const pos = await locateTile(archive, header, zxyToTileId(t.z, t.x, t.y));
    if (pos && pos.length > 0) located.push({ ...t, ...pos });
  }
  located.sort((a, b) => a.offset - b.offset);

  const groups: LocatedTile[][] = [];
  for (const tile of located) {
    const group = groups[groups.length - 1];
    const last = group?.[group.length - 1];
    if (
      group &&
      last &&
      tile.offset - (last.offset + last.length) <= MAX_RANGE_GAP_BYTES &&
      tile.offset + tile.length - group[0].offset <= MAX_RANGE_SPAN_BYTES
    ) {
      group.push(tile);
    } else {
      groups.push([tile]);
    }
  }

  console.log(`clip: ${located.length} tiles in ${groups.length} range reads`);
  const tiles: ClipTile[] = [];
  for (const group of groups) {
    const start = group[0].offset;
    const end = Math.max(...group.map((t) => t.offset + t.length));
    const { data } = await archive.source.getBytes(
      start,
      end - start,
      undefined,
      header.etag,
    );
    const bytes = new Uint8Array(data);
    for (const t of group) {
      tiles.push({
        z: t.z,
        x: t.x,
        y: t.y,
        data: bytes.slice(t.offset - start, t.offset - start + t.length),
      });
    }
  }
  return tiles;
}
import { putObject } from "./r2";

class R2Source {
  constructor(
    private bucket: R2Bucket,
    private key: string,
  ) {}

  getKey(): string {
    return this.key;
  }

  async getBytes(
    offset: number,
    length: number,
  ): Promise<{ data: ArrayBuffer }> {
    const object = await this.bucket.get(this.key, {
      range: { offset, length },
    });
    if (!object) {
      throw new Error(`Missing source PMTiles: ${this.key}`);
    }
    return { data: await object.arrayBuffer() };
  }
}

function pointToTile(lon: number, lat: number, zoom: number): [number, number] {
  const n = 2 ** zoom;
  const xtile = Math.floor(((lon + 180) / 360) * n);
  const ytile = Math.floor(
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180),
      ) /
        Math.PI) /
      2) *
      n,
  );
  return [
    Math.max(0, Math.min(xtile, n - 1)),
    Math.max(0, Math.min(ytile, n - 1)),
  ];
}

const MAX_TILES = 4000;
// Protomaps daily builds are deleted after a few weeks, so a pinned date breaks.
const DAILY_BUILD_LOOKBACK_DAYS = 14;
const RESOLVED_SOURCE_TTL_MS = 6 * 60 * 60 * 1000;
let resolvedSource: { template: string; url: string; expires: number } | null =
  null;

export async function resolveSourcePmtilesUrl(env: Env): Promise<string | null> {
  const template = env.SOURCE_PMTILES_URL?.trim();
  if (!template) return null;
  if (!template.includes("{date}")) return template;
  if (
    resolvedSource &&
    resolvedSource.template === template &&
    resolvedSource.expires > Date.now()
  ) {
    return resolvedSource.url;
  }
  // Start at the latest Sunday so every isolate pins the same weekly build,
  // keeping ETags stable for PMTiles clients and the basemap range cache warm.
  const now = new Date();
  const start = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - now.getUTCDay(),
  );
  for (let i = 0; i < DAILY_BUILD_LOOKBACK_DAYS; i++) {
    const stamp = new Date(start - i * 86_400_000)
      .toISOString()
      .slice(0, 10)
      .replaceAll("-", "");
    const url = template.replace("{date}", stamp);
    const res = await fetch(url, { method: "HEAD" });
    if (res.ok) {
      resolvedSource = {
        template,
        url,
        expires: Date.now() + RESOLVED_SOURCE_TTL_MS,
      };
      return url;
    }
  }
  return null;
}

async function openSourceArchive(
  env: Env,
  neededMaxZoom: number,
): Promise<PMTiles> {
  const key = env.SOURCE_PMTILES_KEY || "pmtiles/OUTPUT.pmtiles";
  const head = await env.BUCKET.head(key);
  if (head) {
    const archive = new PMTiles(new R2Source(env.BUCKET, key));
    const header = await archive.getHeader();
    if (header.maxZoom >= neededMaxZoom) {
      return archive;
    }
    console.warn(
      `clip: ${key} maxZoom ${header.maxZoom} < ${neededMaxZoom}; reading via SOURCE_PMTILES_URL`,
    );
  }
  const url = await resolveSourcePmtilesUrl(env);
  if (url) {
    if (!head) {
      console.warn(`clip: ${key} not in R2; reading via SOURCE_PMTILES_URL`);
    }
    return new PMTiles(new FetchSource(url));
  }
  if (head) {
    return new PMTiles(new R2Source(env.BUCKET, key));
  }
  throw new Error(
    `Missing source PMTiles (${key}). Upload it to R2 or set SOURCE_PMTILES_URL.`,
  );
}

export async function handleClip(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return text("Method Not Allowed", 405);
  try {
    return await clipArchive(request, env);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("clip:", message);
    const status = /missing source pmtiles/i.test(message) ? 503 : 500;
    return text(message, status);
  }
}

async function clipArchive(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as {
    bbox?: [number, number, number, number];
    minZoom?: number;
    maxZoom?: number;
    name?: string;
  };
  const bbox = body.bbox;
  if (!bbox || bbox.length !== 4) return text("bbox required", 400);
  const minZoom = typeof body.minZoom === "number" ? body.minZoom : 0;
  const maxZoom = typeof body.maxZoom === "number" ? body.maxZoom : 14;
  if (maxZoom > 19) return text("maxZoom too high for clip (<=19)", 400);
  if (minZoom < 0 || minZoom > maxZoom) return text("invalid zooms", 400);

  const archive = await openSourceArchive(env, maxZoom);
  const header = await archive.getHeader();
  const z0 = Math.max(minZoom, header.minZoom);
  const z1 = Math.min(maxZoom, header.maxZoom);

  const wanted: Array<{ z: number; x: number; y: number }> = [];
  for (let z = z0; z <= z1; z++) {
    const [minX, minY] = pointToTile(bbox[0], bbox[3], z);
    const [maxX, maxY] = pointToTile(bbox[2], bbox[1], z);
    const x0 = Math.min(minX, maxX);
    const x1 = Math.max(minX, maxX);
    const y0 = Math.min(minY, maxY);
    const y1 = Math.max(minY, maxY);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        wanted.push({ z, x, y });
        if (wanted.length > MAX_TILES) {
          return text("bbox too large for Worker clip; reduce maxZoom", 400);
        }
      }
    }
  }

  const tiles = await readTilesCoalesced(archive, header, wanted);
  if (tiles.length === 0) {
    return text("No tiles found for bbox", 404);
  }

  const sourceMetadata = (await archive.getMetadata().catch(() => ({}))) as
    | Record<string, unknown>
    | undefined;
  const out = await buildPmtilesV3({
    tiles,
    bbox,
    tileCompression: header.tileCompression,
    tileType: header.tileType ?? 1,
    metadata: {
      vector_layers: sourceMetadata?.vector_layers,
      attribution: sourceMetadata?.attribution,
    },
  });
  const safeName = (body.name || "clip")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const key = `pmtiles/clip-${safeName}-${Date.now()}.pmtiles`;
  await putObject(env, key, out, "application/vnd.pmtiles");
  return text(publicFileUrl(request, key), 200);
}
