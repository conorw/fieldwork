import { FetchSource, PMTiles } from "pmtiles";
import { publicFileUrl, text, type Env } from "./env";
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

function rotate(n: number, xy: [number, number], rx: number, ry: number): void {
  if (ry !== 0) return;
  if (rx === 1) {
    xy[0] = n - 1 - xy[0];
    xy[1] = n - 1 - xy[1];
  }
  const tmp = xy[0];
  xy[0] = xy[1];
  xy[1] = tmp;
}

function zxyToTileId(z: number, x: number, y: number): number {
  let acc = 0;
  for (let tz = 0; tz < z; tz++) acc += (1 << tz) * (1 << tz);
  const n = 2 ** z;
  const xy: [number, number] = [x, y];
  let d = 0;
  for (let s = n / 2; s > 0; s = Math.floor(s / 2)) {
    const rx = (xy[0] & s) > 0 ? 1 : 0;
    const ry = (xy[1] & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    rotate(s, xy, rx, ry);
  }
  return acc + d;
}

function writeVarint(bytes: number[], value: number): void {
  let n = value >>> 0;
  while (n >= 0x80) {
    bytes.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  bytes.push(n);
}

function writeUint64LE(view: DataView, offset: number, value: number): void {
  const hi = Math.floor(value / 0x100000000);
  const lo = value >>> 0;
  view.setUint32(offset, lo, true);
  view.setUint32(offset + 4, hi, true);
}

function lonLatE7(value: number): number {
  return Math.round(value * 10_000_000);
}

async function gzipBytes(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function buildPmtilesV3(
  tiles: Array<{ z: number; x: number; y: number; data: Uint8Array }>,
  bbox: [number, number, number, number],
  tileCompression: number,
  tileType: number,
): Promise<Uint8Array> {
  const sorted = tiles
    .map((t) => ({ ...t, id: zxyToTileId(t.z, t.x, t.y) }))
    .sort((a, b) => a.id - b.id);

  let dataLen = 0;
  for (const tile of sorted) dataLen += tile.data.byteLength;

  const clusteredDir: number[] = [];
  let prevId = 0;
  for (let i = 0; i < sorted.length; i++) {
    const tile = sorted[i];
    writeVarint(clusteredDir, tile.id - prevId);
    writeVarint(clusteredDir, 1);
    writeVarint(clusteredDir, tile.data.byteLength);
    writeVarint(clusteredDir, i === 0 ? 0 : 0);
    prevId = tile.id;
  }

  const metadata = await gzipBytes(
    new TextEncoder().encode(
      JSON.stringify({
        name: "fieldwork-clip",
        generator: "fieldwork-worker",
        bounds: bbox,
      }),
    ),
  );
  const rootDir = await gzipBytes(new Uint8Array(clusteredDir));

  const HEADER = 127;
  const rootOffset = HEADER;
  const metaOffset = rootOffset + rootDir.byteLength;
  const tileOffset = metaOffset + metadata.byteLength;
  const total = tileOffset + dataLen;
  const buf = new ArrayBuffer(total);
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);

  u8.set(new TextEncoder().encode("PMTiles"), 0);
  view.setUint8(7, 0);
  view.setUint8(8, 3);
  writeUint64LE(view, 9, rootOffset);
  writeUint64LE(view, 17, rootDir.byteLength);
  writeUint64LE(view, 25, metaOffset);
  writeUint64LE(view, 33, metadata.byteLength);
  writeUint64LE(view, 41, 0);
  writeUint64LE(view, 49, 0);
  writeUint64LE(view, 57, tileOffset);
  writeUint64LE(view, 65, dataLen);
  writeUint64LE(view, 73, sorted.length);
  writeUint64LE(view, 81, sorted.length);
  writeUint64LE(view, 89, sorted.length);
  view.setUint8(97, 1); // clustered
  view.setUint8(98, 2); // gzip internal
  view.setUint8(99, tileCompression);
  view.setUint8(100, tileType);
  const zooms = sorted.map((t) => t.z);
  view.setUint8(101, Math.min(...zooms));
  view.setUint8(102, Math.max(...zooms));
  const [minLon, minLat, maxLon, maxLat] = bbox;
  view.setInt32(103, lonLatE7(minLon), true);
  view.setInt32(107, lonLatE7(minLat), true);
  view.setInt32(111, lonLatE7(maxLon), true);
  view.setInt32(115, lonLatE7(maxLat), true);
  view.setUint8(119, Math.min(...zooms));
  view.setInt32(120, lonLatE7((minLon + maxLon) / 2), true);
  view.setInt32(124, lonLatE7((minLat + maxLat) / 2), true);

  u8.set(rootDir, rootOffset);
  u8.set(metadata, metaOffset);
  let cursor = tileOffset;
  for (const tile of sorted) {
    u8.set(tile.data, cursor);
    cursor += tile.data.byteLength;
  }
  return u8;
}

const MAX_TILES = 4000;

async function openSourceArchive(env: Env): Promise<PMTiles> {
  const key = env.SOURCE_PMTILES_KEY || "pmtiles/OUTPUT.pmtiles";
  const head = await env.BUCKET.head(key);
  if (head) {
    return new PMTiles(new R2Source(env.BUCKET, key));
  }
  const url = env.SOURCE_PMTILES_URL?.trim();
  if (url) {
    console.warn(
      `clip: ${key} not in R2; reading via SOURCE_PMTILES_URL`,
    );
    return new PMTiles(new FetchSource(url));
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

  const archive = await openSourceArchive(env);
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

  const tiles: Array<{ z: number; x: number; y: number; data: Uint8Array }> = [];
  for (const t of wanted) {
    const got = await archive.getZxy(t.z, t.x, t.y);
    if (got?.data) {
      tiles.push({
        z: t.z,
        x: t.x,
        y: t.y,
        data: new Uint8Array(got.data),
      });
    }
  }
  if (tiles.length === 0) {
    return text("No tiles found for bbox", 404);
  }

  const out = await buildPmtilesV3(
    tiles,
    bbox,
    header.tileCompression ?? 0,
    header.tileType ?? 1,
  );
  const safeName = (body.name || "clip")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const key = `pmtiles/clip-${safeName}-${Date.now()}.pmtiles`;
  await putObject(env, key, out, "application/vnd.pmtiles");
  return text(publicFileUrl(request, key), 200);
}
