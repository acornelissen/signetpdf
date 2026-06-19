import { describe, expect, it } from "vitest";
import {
  addAnnotation,
  createModel,
  markSaved,
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

describe("markSaved", () => {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

  it("clears the dirty flag without touching the input", () => {
    const edited = setFieldValue(createModel(bytes), "name", "Ada");
    expect(edited.dirty).toBe(true);
    const saved = markSaved(edited);
    expect(saved.dirty).toBe(false);
    expect(edited.dirty).toBe(true);
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
    bold: false,
    italic: false,
    color: "#000000",
    align: "left",
    family: "sans",
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

  it("adds a signature stamp (the other union arm)", () => {
    const stamp: NewAnnotation = {
      kind: "signature",
      page: 0,
      origin: userSpacePoint(100, 100),
      width: 120,
      height: 60,
      pngBytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    };
    const model = addAnnotation(createModel(bytes), stamp);
    expect(model.annotations[0]?.kind).toBe("signature");
  });

  it("leaves the list unchanged when updating an unknown id", () => {
    const added = addAnnotation(createModel(bytes), draft);
    const existing = added.annotations[0];
    if (existing?.kind !== "text") {
      throw new Error("expected a text annotation");
    }
    const updated = updateAnnotation(added, { ...existing, id: "does-not-exist", text: "x" });
    expect(updated.annotations).toHaveLength(1);
    expect(updated.annotations[0]?.id).toBe(existing.id);
  });

  it("removes an annotation by id", () => {
    const added = addAnnotation(createModel(bytes), draft);
    const id = added.annotations[0]?.id ?? "";
    expect(removeAnnotation(added, id).annotations).toEqual([]);
  });

  it("adds a text-markup annotation (the markup union arm)", () => {
    const markup: NewAnnotation = {
      kind: "markup",
      page: 0,
      style: "highlight",
      color: "#ffeb3b",
      quads: [{ origin: userSpacePoint(72, 700), width: 120, height: 12 }],
    };
    const model = addAnnotation(createModel(bytes), markup);
    const added = model.annotations[0];
    expect(added?.kind).toBe("markup");
    expect(added?.id).toBeTruthy();
    if (added?.kind !== "markup") {
      throw new Error("expected a markup annotation");
    }
    expect(added.style).toBe("highlight");
    expect(added.color).toBe("#ffeb3b");
    expect(added.quads).toHaveLength(1);
  });

  it("adds a sticky-note annotation (the note union arm)", () => {
    const note: NewAnnotation = {
      kind: "note",
      page: 0,
      origin: userSpacePoint(72, 700),
      text: "check this clause",
    };
    const model = addAnnotation(createModel(bytes), note);
    const added = model.annotations[0];
    expect(added?.kind).toBe("note");
    expect(added?.id).toBeTruthy();
    if (added?.kind !== "note") {
      throw new Error("expected a note annotation");
    }
    expect(added.text).toBe("check this clause");
    expect(added.origin).toEqual(userSpacePoint(72, 700));
  });

  it("updates a sticky note's text by id", () => {
    const note: NewAnnotation = {
      kind: "note",
      page: 0,
      origin: userSpacePoint(10, 20),
      text: "old",
    };
    const added = addAnnotation(createModel(bytes), note);
    const existing = added.annotations[0];
    if (existing?.kind !== "note") {
      throw new Error("expected a note annotation");
    }
    const updated = updateAnnotation(added, { ...existing, text: "new" });
    expect(updated.annotations[0]).toMatchObject({ id: existing.id, text: "new" });
  });

  it("updates a markup annotation's style by id", () => {
    const markup: NewAnnotation = {
      kind: "markup",
      page: 0,
      style: "underline",
      color: "#000000",
      quads: [{ origin: userSpacePoint(10, 20), width: 30, height: 10 }],
    };
    const added = addAnnotation(createModel(bytes), markup);
    const existing = added.annotations[0];
    if (existing?.kind !== "markup") {
      throw new Error("expected a markup annotation");
    }
    const updated = updateAnnotation(added, { ...existing, style: "strikethrough" });
    expect(updated.annotations[0]).toMatchObject({ id: existing.id, style: "strikethrough" });
  });

  it("does not mutate the input across add and remove", () => {
    const base = createModel(bytes);
    const added = addAnnotation(base, draft);
    expect(base.annotations).toEqual([]);
    removeAnnotation(added, added.annotations[0]?.id ?? "");
    expect(added.annotations).toHaveLength(1);
  });
});
