import { afterEach, describe, expect, it } from "vitest";
import { rewritePublicStorageUrl } from "../src/utils/storageUrl";
import { publishedFileFallbackUrl } from "../workers/r2";

const CLIP =
  "https://fieldwork.conorw.workers.dev/files/pmtiles/clip-bc-1791724005822.pmtiles";

function setPage(origin: string) {
  const url = new URL(origin);
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { origin, host: url.host } },
  });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

describe("rewritePublicStorageUrl", () => {
  it("keeps a production clip on workers.dev when the page is on the LAN", () => {
    setPage("https://192.168.18.12:3000");
    expect(rewritePublicStorageUrl(CLIP)).toBe(CLIP);
  });

  it("serves a local wrangler file through the current host", () => {
    setPage("https://192.168.18.12:3000");
    expect(
      rewritePublicStorageUrl(
        "http://127.0.0.1:8787/files/pmtiles/clip-local.pmtiles",
      ),
    ).toBe("/files/pmtiles/clip-local.pmtiles");
  });

  it("uses a relative path when the file is already on this page", () => {
    setPage("https://fieldwork.conorw.workers.dev");
    expect(rewritePublicStorageUrl(CLIP)).toBe(
      "/files/pmtiles/clip-bc-1791724005822.pmtiles",
    );
  });
});

describe("publishedFileFallbackUrl", () => {
  const base = "https://fieldwork.conorw.workers.dev";
  const key = "pmtiles/clip-home-1791925495508.pmtiles";

  it("reads a missing local file from the published bucket", () => {
    expect(
      publishedFileFallbackUrl("http://127.0.0.1:8787/files/" + key, base, key),
    ).toBe(`${base}/files/${key}`);
  });

  it("does not proxy a request that is already on the published host", () => {
    expect(
      publishedFileFallbackUrl(`https://fieldwork.conorw.workers.dev/files/${key}`, base, key),
    ).toBeNull();
  });

  it("refuses a path escape", () => {
    expect(
      publishedFileFallbackUrl(
        "http://127.0.0.1:8787/files/pmtiles/clip.pmtiles",
        base,
        "pmtiles/../secret",
      ),
    ).toBeNull();
  });
});
