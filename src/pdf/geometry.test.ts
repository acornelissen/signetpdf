import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadPdfDocument } from "./document";
import { capturePageGeometry } from "./geometry";

function fixture(name: string): Uint8Array {
  return new Uint8Array(
    readFileSync(fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url))),
  );
}

describe("capturePageGeometry", () => {
  it("reports unrotated user-space size and rotation per page", async () => {
    const doc = await loadPdfDocument(fixture("two-page.pdf"));
    expect(await capturePageGeometry(doc)).toEqual([
      { index: 0, width: 612, height: 792, rotation: 0 },
      { index: 1, width: 612, height: 792, rotation: 0 },
    ]);
  });

  it("captures /Rotate 90 without swapping the stored width/height", async () => {
    const doc = await loadPdfDocument(fixture("rotated-90.pdf"));
    expect(await capturePageGeometry(doc)).toEqual([
      { index: 0, width: 612, height: 792, rotation: 90 },
    ]);
  });
});
