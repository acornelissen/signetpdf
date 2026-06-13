import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadPdfDocument } from "./document";

const fixture = new Uint8Array(
  readFileSync(fileURLToPath(new URL("../../fixtures/two-page.pdf", import.meta.url))),
);

describe("loadPdfDocument", () => {
  it("loads a PDF and reports its page count", async () => {
    const doc = await loadPdfDocument(fixture);
    expect(doc.numPages).toBe(2);
  });

  it("does not detach the caller's buffer", async () => {
    const bytes = fixture.slice();
    await loadPdfDocument(bytes);
    expect(bytes.byteLength).toBe(fixture.byteLength);
  });

  it("rejects bytes that are not a PDF", async () => {
    const garbage = new TextEncoder().encode("definitely not a pdf, just some text");
    await expect(loadPdfDocument(garbage)).rejects.toBeInstanceOf(Error);
  });
});
