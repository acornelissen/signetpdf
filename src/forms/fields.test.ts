import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadPdfDocument } from "../pdf/document";
import { listFormFields, type FormField } from "./fields";

function fixture(name: string): Uint8Array {
  return new Uint8Array(
    readFileSync(fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url))),
  );
}

async function fields(name: string): Promise<FormField[]> {
  return listFormFields(await loadPdfDocument(fixture(name)));
}

describe("listFormFields", () => {
  it("enumerates every field type with name, kind and options", async () => {
    const found = await fields("acroform.pdf");
    const byName = new Map(found.map((field) => [field.name, field]));

    expect(byName.get("text.fullName")?.kind).toBe("text");
    expect(byName.get("check.agree")?.kind).toBe("checkbox");
    expect(byName.get("radio.color")?.kind).toBe("radio");
    expect(byName.get("choice.city")?.kind).toBe("dropdown");
    expect(byName.get("choice.city")?.options).toEqual(["London", "Paris", "Tokyo"]);
    expect(byName.get("choice.fruit")?.kind).toBe("optionlist");
    expect(byName.get("choice.fruit")?.options).toEqual(["Apple", "Pear", "Plum"]);
  });

  it("returns a widget per radio option, each with its on-value", async () => {
    const found = await fields("acroform.pdf");
    const radios = found.filter((field) => field.name === "radio.color");
    expect(radios).toHaveLength(2);
    expect(radios.map((r) => r.onValue).sort()).toEqual(["0", "1"]);
  });

  it("captures a checkbox on-value", async () => {
    const found = await fields("acroform.pdf");
    expect(found.find((field) => field.name === "check.agree")?.onValue).toBe("Yes");
  });

  it("captures page index and a user-space rectangle", async () => {
    const found = await fields("acroform.pdf");
    const text = found.find((field) => field.name === "text.fullName");
    expect(text?.page).toBe(0);
    expect(text?.rect.width).toBeGreaterThan(0);
    expect(text?.rect.height).toBeGreaterThan(0);
  });

  it("returns nothing for a PDF with no forms", async () => {
    expect(await fields("two-page.pdf")).toEqual([]);
  });
});
