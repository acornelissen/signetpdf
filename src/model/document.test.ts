import { describe, expect, it } from "vitest";
import { createModel, setFieldValue } from "./document";

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

describe("setFieldValue", () => {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

  it("adds a new field value and marks the model dirty", () => {
    const model = setFieldValue(createModel(bytes), "name", "Ada");
    expect(model.fieldValues).toEqual([{ kind: "field", fieldName: "name", value: "Ada" }]);
    expect(model.dirty).toBe(true);
  });

  it("replaces an existing field in place without growing the list", () => {
    const first = setFieldValue(createModel(bytes), "name", "Ada");
    const second = setFieldValue(first, "name", "Grace");
    expect(second.fieldValues).toEqual([{ kind: "field", fieldName: "name", value: "Grace" }]);
  });

  it("supports boolean values for checkboxes", () => {
    const model = setFieldValue(createModel(bytes), "agree", true);
    expect(model.fieldValues[0]?.value).toBe(true);
  });

  it("does not mutate the input model", () => {
    const original = createModel(bytes);
    const updated = setFieldValue(original, "name", "Ada");
    expect(original.fieldValues).toEqual([]);
    expect(original.dirty).toBe(false);
    expect(updated).not.toBe(original);
  });
});
