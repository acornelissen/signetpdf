import type { UserSpacePoint } from "./geometry";

// The single source of truth. Every field is readonly so the compiler rejects
// in-place mutation; all geometry is PDF user space (never screen pixels).
// Mutations (m1-2/m1-3) return a brand-new model and never touch the input.

/** A value the user entered into an existing AcroForm field. */
export interface FieldValue {
  readonly kind: "field";
  readonly fieldName: string;
  readonly value: string | boolean;
}

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

export type Annotation = TextBox | SignatureStamp;

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
