import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createModel } from "../model/document";
import { loadPdfDocument } from "../pdf/document";
import { saveModel } from "./save";

function fixture(name: string): Uint8Array {
  return new Uint8Array(
    readFileSync(fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url))),
  );
}

async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await loadPdfDocument(bytes)).numPages;
}

async function fieldNames(bytes: Uint8Array): Promise<string[]> {
  const doc = await loadPdfDocument(bytes);
  const fields = await doc.getFieldObjects();
  return Object.keys(fields ?? {}).sort();
}

// Encrypted fixtures are excluded here; encrypted handling is m1-12.
const nonXfaFixtures = ["two-page.pdf", "rotated-90.pdf", "acroform.pdf", "linearized.pdf"];

describe("saveModel empty round-trip", () => {
  it.each(nonXfaFixtures)("preserves page count and AcroForm field set for %s", async (name) => {
    const original = fixture(name);
    const saved = await saveModel(createModel(original));

    expect(await pageCount(saved)).toBe(await pageCount(original));
    expect(await fieldNames(saved)).toEqual(await fieldNames(original));
  });

  it("returns fresh bytes without touching the source", async () => {
    const original = fixture("two-page.pdf");
    const model = createModel(original);
    const saved = await saveModel(model);
    expect(saved).toBeInstanceOf(Uint8Array);
    expect(model.sourceBytes).toBe(original);
  });
});
