import { expect, test } from "vitest";
import { FetchSource, PMTiles } from "pmtiles";

// Live smoke test: needs `npm run dev:worker` (or set API_URL to a deployed Worker).
const API = process.env.API_URL ?? "http://127.0.0.1:8787/api/clip";

test("clips a small Ballycastle extent into a readable PMTiles archive", async () => {
  const r = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      bbox: [-6.25, 55.2, -6.24, 55.21],
      minZoom: 12,
      maxZoom: 15,
      name: "vitest-clip",
    }),
  });
  expect(r.status, await r.clone().text()).toBe(200);

  const url = (await r.text()).trim();
  expect(url).toMatch(/\/files\/pmtiles\/clip-vitest-clip-\d+\.pmtiles$/);

  const archive = new PMTiles(new FetchSource(url));
  const header = await archive.getHeader();
  expect(header.specVersion).toBe(3);
  expect(header.minZoom).toBe(12);
  expect(header.maxZoom).toBe(15);

  const [lon, lat, z] = [-6.245, 55.205, 15];
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
  );
  const tile = await archive.getZxy(z, x, y);
  expect(tile?.data.byteLength ?? 0).toBeGreaterThan(0);

  const metadata = (await archive.getMetadata()) as Record<string, unknown>;
  expect(Array.isArray(metadata.vector_layers)).toBe(true);
}, 120_000);
