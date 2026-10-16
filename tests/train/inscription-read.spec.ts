import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import { describe, expect, it } from "vitest";
import { mergeHeaderText, parseInscription } from "../../src/utils/inscriptionRead";
import { headerBand } from "../../src/utils/stoneCrop";

const FONE_OCR = `
 se
.
= we remember
A dear husband
DENNIS
WILLIAM
FONE
25% June 1933
1* October 2020
always cogecher with
A dear wife and mother
BERYL JEAN
FONE
2 February 1948
1** November 2021
Always missed, never forgotten
`;

describe("inscription reading", () => {
  it("reads the Fone stone from the recognizer text", () => {
    const reading = parseInscription(
      mergeHeaderText(FONE_OCR, "With love\nwe remember"),
    );
    expect(reading.people.map((person) => person.full_name)).toEqual([
      "Dennis William Fone",
      "Beryl Jean Fone",
    ]);
    expect(reading.people[0]).toMatchObject({
      birth: "1933-06-25",
      death: "2020-10-01",
    });
    expect(reading.people[1]).toMatchObject({
      birth: "1948-02-02",
      death: "2021-11-01",
    });
    expect(reading.people[0]?.relationships.join(" ")).toMatch(/dear husband/i);
    expect(reading.people[0]?.relationships.join(" ")).toMatch(/Beryl Jean Fone/);
    expect(reading.people[1]?.relationships.join(" ")).toMatch(/wife and mother/i);
    expect(reading.epitaph).toBe(
      "With love we remember · Always missed, never forgotten",
    );
    expect(reading.transcription).toContain("Dennis William Fone");
    expect(reading.transcription).toContain("25th June 1933");
    expect(reading.transcription).toContain("1st November 2021");
  });

  it("reads the Fone headstone photo", async () => {
    const file = path.resolve("public/e2e/fone-headstone.webp");
    const image = sharp(file);
    const meta = await image.metadata();
    const width = meta.width || 1;
    const height = meta.height || 1;
    const band = headerBand(width, height);
    const header = await sharp(file)
      .extract({
        left: band.x,
        top: band.y,
        width: Math.min(band.width, width - band.x),
        height: Math.min(band.height, height - band.y),
      })
      .resize({ width: band.width * 2 })
      .png()
      .toBuffer();

    const worker = await createWorker("eng");
    await worker.setParameters({
      tessedit_pageseg_mode: "4",
      user_defined_dpi: "300",
    });
    const body = await worker.recognize(readFileSync(file));
    const opening = await worker.recognize(header);
    await worker.terminate();

    const reading = parseInscription(mergeHeaderText(body.data.text, opening.data.text));
    expect(reading.people.map((person) => person.full_name)).toEqual([
      "Dennis William Fone",
      "Beryl Jean Fone",
    ]);
    expect(reading.people.map((person) => [person.birth, person.death])).toEqual([
      ["1933-06-25", "2020-10-01"],
      ["1948-02-02", "2021-11-01"],
    ]);
    expect(reading.epitaph).toContain("With love we remember");
    expect(reading.epitaph).toContain("Always missed, never forgotten");
  }, 60000);
});
