import { describe, expect, it } from "vitest";
import {
  addAnnotation,
  createModel,
  removeAnnotation,
  setFieldValue,
  updateAnnotation,
  withPages,
  type NewAnnotation,
} from "./document";
import { userSpacePoint } from "./geometry";

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

describe("withPages", () => {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
  const pages = [{ index: 0, width: 612, height: 792, rotation: 0 }];

  it("sets pages without marking the model dirty", () => {
    const model = withPages(createModel(bytes), pages);
    expect(model.pages).toEqual(pages);
    expect(model.dirty).toBe(false);
  });

  it("does not mutate the input model", () => {
    const original = createModel(bytes);
    withPages(original, pages);
    expect(original.pages).toEqual([]);
  });
});

describe("annotation mutations", () => {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
  const draft: NewAnnotation = {
    kind: "text",
    page: 0,
    origin: userSpacePoint(72, 700),
    width: 200,
    height: 24,
    text: "hello",
    fontSize: 12,
  };

  it("adds an annotation with a generated id and marks dirty", () => {
    const model = addAnnotation(createModel(bytes), draft);
    expect(model.annotations).toHaveLength(1);
    expect(model.annotations[0]?.id).toBeTruthy();
    expect(model.dirty).toBe(true);
  });

  it("updates an annotation by id", () => {
    const added = addAnnotation(createModel(bytes), draft);
    const existing = added.annotations[0];
    if (existing?.kind !== "text") {
      throw new Error("expected a text annotation");
    }
    const updated = updateAnnotation(added, { ...existing, text: "changed" });
    expect(updated.annotations).toHaveLength(1);
    expect(updated.annotations[0]).toMatchObject({ id: existing.id, text: "changed" });
  });

  it("removes an annotation by id", () => {
    const added = addAnnotation(createModel(bytes), draft);
    const id = added.annotations[0]?.id ?? "";
    expect(removeAnnotation(added, id).annotations).toEqual([]);
  });

  it("does not mutate the input across add and remove", () => {
    const base = createModel(bytes);
    const added = addAnnotation(base, draft);
    expect(base.annotations).toEqual([]);
    removeAnnotation(added, added.annotations[0]?.id ?? "");
    expect(added.annotations).toHaveLength(1);
  });
});
