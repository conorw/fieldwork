/** Minimal PMTiles v3 writer for small clipped archives. */

export type ClipTile = { z: number; x: number; y: number; data: Uint8Array };

type Entry = {
  tileId: number;
  offset: number;
  length: number;
  runLength: number;
};

const HEADER_BYTES = 127;
// Clients read the header and root directory from the first 16 KiB.
const ROOT_MAX_BYTES = 16_384 - HEADER_BYTES;

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

export function zxyToTileId(z: number, x: number, y: number): number {
  let acc = 0;
  for (let tz = 0; tz < z; tz++) acc += 4 ** tz;
  const n = 2 ** z;
  const xy: [number, number] = [x, y];
  let d = 0;
  for (let s = n / 2; s >= 1; s /= 2) {
    const rx = (xy[0] & s) > 0 ? 1 : 0;
    const ry = (xy[1] & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    rotate(s, xy, rx, ry);
  }
  return acc + d;
}

// Tile IDs pass 2^32 above z15, so avoid 32-bit bitwise ops.
function writeVarint(bytes: number[], value: number): void {
  let n = value;
  while (n >= 0x80) {
    bytes.push((n % 0x80) | 0x80);
    n = Math.floor(n / 0x80);
  }
  bytes.push(n);
}

function writeUint64LE(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value % 0x100000000, true);
  view.setUint32(offset + 4, Math.floor(value / 0x100000000), true);
}

function lonLatE7(value: number): number {
  return Math.round(value * 10_000_000);
}

export async function gzipBytes(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let cursor = 0;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  return out;
}

function serializeDirectory(entries: Entry[]): Uint8Array {
  const bytes: number[] = [];
  writeVarint(bytes, entries.length);
  let lastId = 0;
  for (const e of entries) {
    writeVarint(bytes, e.tileId - lastId);
    lastId = e.tileId;
  }
  for (const e of entries) writeVarint(bytes, e.runLength);
  for (const e of entries) writeVarint(bytes, e.length);
  entries.forEach((e, i) => {
    const prev = entries[i - 1];
    if (prev && e.offset === prev.offset + prev.length) writeVarint(bytes, 0);
    else writeVarint(bytes, e.offset + 1);
  });
  return new Uint8Array(bytes);
}

async function buildDirectories(
  entries: Entry[],
): Promise<{ root: Uint8Array; leaves: Uint8Array }> {
  const root = await gzipBytes(serializeDirectory(entries));
  if (root.byteLength <= ROOT_MAX_BYTES) {
    return { root, leaves: new Uint8Array(0) };
  }
  for (let leafSize = 1024; ; leafSize *= 2) {
    const rootEntries: Entry[] = [];
    const leafChunks: Uint8Array[] = [];
    let leafOffset = 0;
    for (let i = 0; i < entries.length; i += leafSize) {
      const chunk = entries.slice(i, i + leafSize);
      const leaf = await gzipBytes(serializeDirectory(chunk));
      rootEntries.push({
        tileId: chunk[0].tileId,
        offset: leafOffset,
        length: leaf.byteLength,
        runLength: 0,
      });
      leafChunks.push(leaf);
      leafOffset += leaf.byteLength;
    }
    const leafRoot = await gzipBytes(serializeDirectory(rootEntries));
    if (leafRoot.byteLength <= ROOT_MAX_BYTES) {
      return { root: leafRoot, leaves: concat(leafChunks) };
    }
  }
}

export async function buildPmtilesV3(input: {
  tiles: ClipTile[];
  bbox: [number, number, number, number];
  tileCompression: number;
  tileType: number;
  metadata?: Record<string, unknown>;
}): Promise<Uint8Array> {
  const sorted = input.tiles
    .map((t) => ({ ...t, tileId: zxyToTileId(t.z, t.x, t.y) }))
    .sort((a, b) => a.tileId - b.tileId);
  if (sorted.length === 0) throw new Error("No tiles to write");

  const entries: Entry[] = [];
  let dataLength = 0;
  for (const tile of sorted) {
    entries.push({
      tileId: tile.tileId,
      offset: dataLength,
      length: tile.data.byteLength,
      runLength: 1,
    });
    dataLength += tile.data.byteLength;
  }

  const { root, leaves } = await buildDirectories(entries);
  const metadata = await gzipBytes(
    new TextEncoder().encode(
      JSON.stringify({
        ...input.metadata,
        name: "fieldwork-clip",
        generator: "fieldwork-worker",
        bounds: input.bbox,
      }),
    ),
  );

  const rootOffset = HEADER_BYTES;
  const metadataOffset = rootOffset + root.byteLength;
  const leafOffset = metadataOffset + metadata.byteLength;
  const tileOffset = leafOffset + leaves.byteLength;
  const out = new Uint8Array(tileOffset + dataLength);
  const view = new DataView(out.buffer);

  const zooms = sorted.map((t) => t.z);
  const minZoom = Math.min(...zooms);
  const maxZoom = Math.max(...zooms);
  const [minLon, minLat, maxLon, maxLat] = input.bbox;

  out.set(new TextEncoder().encode("PMTiles"), 0);
  view.setUint8(7, 3);
  writeUint64LE(view, 8, rootOffset);
  writeUint64LE(view, 16, root.byteLength);
  writeUint64LE(view, 24, metadataOffset);
  writeUint64LE(view, 32, metadata.byteLength);
  writeUint64LE(view, 40, leafOffset);
  writeUint64LE(view, 48, leaves.byteLength);
  writeUint64LE(view, 56, tileOffset);
  writeUint64LE(view, 64, dataLength);
  writeUint64LE(view, 72, sorted.length);
  writeUint64LE(view, 80, entries.length);
  writeUint64LE(view, 88, sorted.length);
  view.setUint8(96, 1); // clustered
  view.setUint8(97, 2); // gzip internal compression
  view.setUint8(98, input.tileCompression);
  view.setUint8(99, input.tileType);
  view.setUint8(100, minZoom);
  view.setUint8(101, maxZoom);
  view.setInt32(102, lonLatE7(minLon), true);
  view.setInt32(106, lonLatE7(minLat), true);
  view.setInt32(110, lonLatE7(maxLon), true);
  view.setInt32(114, lonLatE7(maxLat), true);
  view.setUint8(118, Math.round((minZoom + maxZoom) / 2));
  view.setInt32(119, lonLatE7((minLon + maxLon) / 2), true);
  view.setInt32(123, lonLatE7((minLat + maxLat) / 2), true);

  out.set(root, rootOffset);
  out.set(metadata, metadataOffset);
  out.set(leaves, leafOffset);
  let cursor = tileOffset;
  for (const tile of sorted) {
    out.set(tile.data, cursor);
    cursor += tile.data.byteLength;
  }
  return out;
}
