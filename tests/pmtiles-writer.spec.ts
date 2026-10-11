import { describe, expect, it } from "vitest";
import { PMTiles, type RangeResponse, type Source } from "pmtiles";
import { buildPmtilesV3, type ClipTile } from "../workers/pmtilesWriter";

class BufferSource implements Source {
  constructor(private bytes: Uint8Array) {}
  getKey() {
    return "buffer";
  }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const slice = this.bytes.slice(offset, offset + length);
    return { data: slice.buffer };
  }
}

function tilePayload(i: number): Uint8Array {
  const data = new Uint8Array(8);
  new DataView(data.buffer).setUint32(0, i, true);
  new DataView(data.buffer).setUint32(4, i * 2654435761, true);
  return data;
}

describe("buildPmtilesV3", () => {
  it("writes a v3 archive that the pmtiles reader can open", async () => {
    const tiles: ClipTile[] = [
      { z: 0, x: 0, y: 0, data: tilePayload(1) },
      { z: 1, x: 1, y: 0, data: tilePayload(2) },
      { z: 2, x: 1, y: 2, data: tilePayload(3) },
      { z: 15, x: 15950, y: 10161, data: tilePayload(4) },
    ];
    const bytes = await buildPmtilesV3({
      tiles,
      bbox: [-6.25, 55.2, -6.24, 55.21],
      tileCompression: 1,
      tileType: 1,
      metadata: { vector_layers: [{ id: "roads" }] },
    });

    const archive = new PMTiles(new BufferSource(bytes));
    const header = await archive.getHeader();
    expect(header.specVersion).toBe(3);
    expect(header.minZoom).toBe(0);
    expect(header.maxZoom).toBe(15);
    expect(header.numAddressedTiles).toBe(4);
    expect(header.tileCompression).toBe(1);
    expect(header.minLon).toBeCloseTo(-6.25, 5);
    expect(header.maxLat).toBeCloseTo(55.21, 5);

    for (const tile of tiles) {
      const got = await archive.getZxy(tile.z, tile.x, tile.y);
      expect(new Uint8Array(got!.data)).toEqual(tile.data);
    }
    expect(await archive.getZxy(2, 0, 0)).toBeUndefined();

    const metadata = (await archive.getMetadata()) as Record<string, unknown>;
    expect(metadata.vector_layers).toEqual([{ id: "roads" }]);
    expect(metadata.bounds).toEqual([-6.25, 55.2, -6.24, 55.21]);
  });

  it("splits large directories into leaves and still resolves every tile", async () => {
    let seed = 42;
    const random = () => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return seed / 2 ** 32;
    };
    const tiles: ClipTile[] = [];
    const seen = new Set<string>();
    for (let i = 0; tiles.length < 30_000 && i < 100_000; i++) {
      const x = Math.floor(random() * 16384);
      const y = Math.floor(random() * 16384);
      const key = `${x}/${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tiles.push({ z: 14, x, y, data: tilePayload(i) });
    }
    expect(tiles).toHaveLength(30_000);
    const bytes = await buildPmtilesV3({
      tiles,
      bbox: [-180, -85, 180, 85],
      tileCompression: 1,
      tileType: 1,
    });

    const archive = new PMTiles(new BufferSource(bytes));
    const header = await archive.getHeader();
    expect(header.leafDirectoryLength).toBeGreaterThan(0);
    expect(header.rootDirectoryOffset + header.rootDirectoryLength).toBeLessThanOrEqual(
      16_384,
    );

    for (const tile of [tiles[0], tiles[12_345], tiles[29_999]]) {
      const got = await archive.getZxy(tile.z, tile.x, tile.y);
      expect(new Uint8Array(got!.data)).toEqual(tile.data);
    }
  });
});
