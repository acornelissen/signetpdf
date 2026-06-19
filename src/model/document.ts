import type { UserSpacePoint } from "./geometry";
import { createId } from "./id";

// The single source of truth. Every field is readonly so the compiler rejects
// in-place mutation; all geometry is PDF user space (never screen pixels).
// Mutations (m1-2/m1-3) return a brand-new model and never touch the input.

/** A value the user entered into an existing AcroForm field. */
export interface FieldValue {
  readonly kind: "field";
  readonly fieldName: string;
  readonly value: string | boolean;
}

/** Horizontal alignment of a text box's lines within its width. */
export type TextAlign = "left" | "center" | "right";

/** Font family of a text box; each maps to a bundled, embeddable face. */
export type TextFamily = "sans" | "serif" | "mono";

/** A free-text annotation the user added. */
export interface TextBox {
  readonly kind: "text";
  readonly id: string;
  readonly page: number;
  readonly origin: UserSpacePoint;
  readonly width: number;
  readonly height: number;
  readonly text: string;
  readonly fontSize: number;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly color: string; // "#rrggbb"
  readonly align: TextAlign;
  readonly family: TextFamily;
}

/** A placed signature image. */
export interface SignatureStamp {
  readonly kind: "signature";
  readonly id: string;
  readonly page: number;
  readonly origin: UserSpacePoint;
  readonly width: number;
  readonly height: number;
  readonly pngBytes: Uint8Array;
}

/** The three text-markup styles, all anchored to a run of selected text. */
export type MarkupStyle = "highlight" | "underline" | "strikethrough";

/** One rectangle of a markup, covering a single line of selected text. */
export interface MarkupQuad {
  readonly origin: UserSpacePoint; // bottom-left of the line box, user space
  readonly width: number;
  readonly height: number;
}

/**
 * A text-markup annotation (highlight / underline / strikethrough). Unlike a
 * TextBox it is anchored to selected glyphs, so its geometry is a list of quads
 * — one per wrapped line of the selection — rather than a single box.
 */
export interface Markup {
  readonly kind: "markup";
  readonly id: string;
  readonly page: number;
  readonly style: MarkupStyle;
  readonly color: string; // "#rrggbb"
  readonly quads: readonly MarkupQuad[];
}

/**
 * A sticky-note comment: an anchor point on the page carrying a comment string.
 * The on-screen icon is a fixed size (a screen concern), so the model keeps only
 * the anchor (its bottom-left in user space) and the text — no box.
 */
export interface StickyNote {
  readonly kind: "note";
  readonly id: string;
  readonly page: number;
  readonly origin: UserSpacePoint; // anchor, bottom-left of the note icon
  readonly text: string;
}

export type Annotation = TextBox | SignatureStamp | Markup | StickyNote;

/** Per-page geometry captured from pdf.js, in user-space units. */
export interface PageGeometry {
  readonly index: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
}

export interface DocumentModel {
  readonly sourceBytes: Uint8Array;
  readonly fieldValues: readonly FieldValue[];
  readonly annotations: readonly Annotation[];
  readonly pages: readonly PageGeometry[];
  readonly dirty: boolean;
}

/** Freeze a model and its collections so in-place mutation fails at runtime too. */
function freezeModel(model: DocumentModel): DocumentModel {
  Object.freeze(model.fieldValues);
  Object.freeze(model.annotations);
  Object.freeze(model.pages);
  return Object.freeze(model);
}

/**
 * Create an empty, non-dirty model that holds the original PDF bytes. Pages are
 * populated on load (m1-4); field values and annotations are added through the
 * immutable mutators.
 */
export function createModel(sourceBytes: Uint8Array): DocumentModel {
  return freezeModel({
    sourceBytes,
    fieldValues: [],
    annotations: [],
    pages: [],
    dirty: false,
  });
}

/** Mark the model saved (dirty=false) after a successful write; returns a new model. */
export function markSaved(model: DocumentModel): DocumentModel {
  return freezeModel({ ...model, dirty: false });
}

/**
 * Populate page geometry on load. This is not a user edit, so the dirty flag is
 * left unchanged; the input model is not touched.
 */
export function withPages(model: DocumentModel, pages: readonly PageGeometry[]): DocumentModel {
  return freezeModel({ ...model, pages: [...pages] });
}

/**
 * Set an AcroForm field's value, returning a NEW model with dirty=true. An
 * existing field is replaced in place (the list does not grow); the input model
 * is never touched.
 */
export function setFieldValue(
  model: DocumentModel,
  fieldName: string,
  value: string | boolean,
): DocumentModel {
  const entry: FieldValue = { kind: "field", fieldName, value };
  const exists = model.fieldValues.some((field) => field.fieldName === fieldName);
  const fieldValues = exists
    ? model.fieldValues.map((field) => (field.fieldName === fieldName ? entry : field))
    : [...model.fieldValues, entry];
  return freezeModel({ ...model, fieldValues, dirty: true });
}

/** An annotation to add, without its id (the model mints the id centrally). */
export type NewAnnotation =
  | Omit<TextBox, "id">
  | Omit<SignatureStamp, "id">
  | Omit<Markup, "id">
  | Omit<StickyNote, "id">;

/** Add an annotation with a freshly minted id; returns a new, dirty model. */
export function addAnnotation(model: DocumentModel, draft: NewAnnotation): DocumentModel {
  const annotation = { ...draft, id: createId() } as Annotation;
  return freezeModel({
    ...model,
    annotations: [...model.annotations, annotation],
    dirty: true,
  });
}

/** Replace the annotation with the same id; returns a new, dirty model. */
export function updateAnnotation(model: DocumentModel, annotation: Annotation): DocumentModel {
  const annotations = model.annotations.map((existing) =>
    existing.id === annotation.id ? annotation : existing,
  );
  return freezeModel({ ...model, annotations, dirty: true });
}

/** Remove the annotation with the given id; returns a new, dirty model. */
export function removeAnnotation(model: DocumentModel, id: string): DocumentModel {
  const annotations = model.annotations.filter((annotation) => annotation.id !== id);
  return freezeModel({ ...model, annotations, dirty: true });
}
