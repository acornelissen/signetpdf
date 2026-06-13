import { describe, expect, it } from "vitest";
import { createModel } from "./document";

describe("createModel", () => {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"

  it("holds the source bytes", () => {
    expect(createModel(bytes).sourceBytes).toBe(bytes);
  });

  it("starts empty and not dirty", () => {
    const model = createModel(bytes);
    expect(model.fieldValues).toEqual([]);
    expect(model.annotations).toEqual([]);
    expect(model.pages).toEqual([]);
    expect(model.dirty).toBe(false);
  });

  it("rejects mutation at compile time and at runtime", () => {
    const model = createModel(bytes);
    expect(() => {
      // @ts-expect-error dirty is readonly
      model.dirty = true;
    }).toThrow();
  });
});
