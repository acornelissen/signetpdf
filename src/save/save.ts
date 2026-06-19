import {
  BlendMode,
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFString,
  PDFTextField,
  rgb,
  type PDFForm,
  type PDFPage,
} from "pdf-lib";
import type {
  Markup,
  DocumentModel,
  FieldValue,
  SignatureStamp,
  StickyNote,
  TextBox,
} from "../model/document";
import { embedTextFonts, type EmbeddedTextFonts, type TextFontFamilies } from "./font";

/** Inputs the projection needs from outside the pure model (e.g. font bytes). */
export interface SaveOptions {
  /**
   * Per-family font bytes, required only when text boxes are present. `sans`
   * must be provided; other families and variants fall back. See embedTextFonts.
   */
  readonly fonts?: TextFontFamilies;
  /**
   * Bake filled form fields into static page content with no editable layer.
   * Annotations are already drawn content, so this only affects AcroForm fields.
   */
  readonly flatten?: boolean;
}

/** Parse a "#rrggbb" colour into a pdf-lib rgb() value (components 0..1). */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) {
    return { r: 0, g: 0, b: 0 }; // unknown colour saves as black
  }
  return {
    r: parseInt(match[1]!, 16) / 255,
    g: parseInt(match[2]!, 16) / 255,
    b: parseInt(match[3]!, 16) / 255,
  };
}

/**
 * Saving an encrypted PDF is refused: pdf-lib has no decryption support, so it
 * can neither preserve the encryption nor produce a valid decrypted copy. We
 * refuse rather than emit a broken or silently-unencrypted file (see m1-12).
 */
export class EncryptedSaveError extends Error {
  constructor() {
    super(
      "SignetPDF can't save changes to an encrypted PDF yet. Remove the password (e.g. print to PDF) and reopen to edit.",
    );
    this.name = "EncryptedSaveError";
  }
}

/**
 * Whether a PDF is encrypted. Used to refuse saving encrypted documents, since
 * pdf-lib cannot rewrite their content.
 */
export async function isEncryptedPdf(bytes: Uint8Array): Promise<boolean> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.isEncrypted;
}

/** Select a radio option, accepting either the option name or its index. */
function selectRadio(group: PDFRadioGroup, value: string): void {
  const options = group.getOptions();
  // The UI value is pdf.js's on-state (often a positional index like "1"),
  // while pdf-lib selects by the /Opt export value (e.g. "blue"). Match by name
  // if it exists, otherwise treat the value as an index into the options.
  const option = options.includes(value) ? value : options[Number(value)];
  if (option !== undefined) {
    group.select(option);
  }
}

function applyFieldValue(form: PDFForm, { fieldName, value }: FieldValue): void {
  let field;
  try {
    field = form.getField(fieldName);
  } catch {
    return; // field no longer present; ignore stale value
  }

  if (field instanceof PDFTextField) {
    field.setText(typeof value === "string" ? value : String(value));
  } else if (field instanceof PDFCheckBox) {
    if (value === true) {
      field.check();
    } else {
      field.uncheck();
    }
  } else if (field instanceof PDFRadioGroup) {
    selectRadio(field, String(value));
  } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
    field.select(String(value));
  }
}

/**
 * Draw one text box onto its page. The model stores the origin as the box's
 * bottom-left in unrotated user space — exactly pdf-lib's drawing space — so the
 * coordinate maps straight through with no rotation maths (the seam handles
 * rotation only for the screen). The baseline sits at the origin's y.
 */
/** Line advance as a multiple of font size, matching the editor's line-height. */
const LINE_HEIGHT_FACTOR = 1.15;

function drawTextBox(page: PDFPage, fonts: EmbeddedTextFonts, box: TextBox): void {
  if (box.text.length === 0) {
    return;
  }
  const font = fonts.fontFor(box.family, box.bold, box.italic);
  const { r, g, b } = hexToRgb(box.color);
  const color = rgb(r, g, b);
  const lineHeight = box.fontSize * LINE_HEIGHT_FACTOR;
  // Lay out lines ourselves so each can be aligned within the box width; the
  // first line's baseline stays at the origin, matching the single-line case.
  box.text.split("\n").forEach((line, index) => {
    const lineWidth = font.widthOfTextAtSize(line, box.fontSize);
    const slack = box.width - lineWidth;
    const x =
      box.align === "right"
        ? box.origin.x + slack
        : box.align === "center"
          ? box.origin.x + slack / 2
          : box.origin.x;
    page.drawText(line, {
      x,
      y: box.origin.y - index * lineHeight,
      size: box.fontSize,
      font,
      color,
    });
  });
}

/** A markup rule's thickness as a fraction of the line-box height. */
const MARKUP_RULE_FACTOR = 0.07;
/** Floor on a markup rule's thickness so it never vanishes on small text. */
const MARKUP_RULE_MIN = 0.75;

/**
 * Draw one text-markup annotation as page content, one rectangle per quad. A
 * highlight fills the whole line box and is composited with Multiply so the
 * underlying glyphs still read through it; an underline is a thin rule along the
 * quad's bottom and a strikethrough a thin rule across its middle. Quads are
 * already the line boxes' bottom-left in user space, so they map straight through.
 */
function drawMarkup(page: PDFPage, markup: Markup): void {
  const { r, g, b } = hexToRgb(markup.color);
  const color = rgb(r, g, b);
  for (const quad of markup.quads) {
    if (markup.style === "highlight") {
      page.drawRectangle({
        x: quad.origin.x,
        y: quad.origin.y,
        width: quad.width,
        height: quad.height,
        color,
        blendMode: BlendMode.Multiply,
      });
      continue;
    }
    const thickness = Math.max(MARKUP_RULE_MIN, quad.height * MARKUP_RULE_FACTOR);
    const y =
      markup.style === "underline"
        ? quad.origin.y
        : quad.origin.y + quad.height / 2 - thickness / 2;
    page.drawRectangle({ x: quad.origin.x, y, width: quad.width, height: thickness, color });
  }
}

/** The user-space size of a sticky note's clickable icon rectangle. */
const NOTE_ICON_SIZE = 18;

/**
 * Add one sticky note as a real PDF /Text annotation, so its comment is readable
 * by any viewer (not flattened into page content). The anchor is the icon rect's
 * bottom-left in user space, which is pdf-lib's space, so it maps straight through.
 */
function addNote(doc: PDFDocument, page: PDFPage, note: StickyNote): void {
  const { x, y } = note.origin;
  const annotation = doc.context.obj({
    Type: "Annot",
    Subtype: "Text",
    Name: "Note",
    Open: false,
    Rect: [x, y, x + NOTE_ICON_SIZE, y + NOTE_ICON_SIZE],
    Contents: PDFString.of(note.text),
  });
  page.node.addAnnot(doc.context.register(annotation));
}

/**
 * Embed and draw one signature stamp on its page. The PNG is composited with its
 * transparency intact; the origin is the image's bottom-left in user space, which
 * is pdf-lib's drawing space, so the box maps straight through.
 */
async function drawSignature(
  doc: PDFDocument,
  page: PDFPage,
  stamp: SignatureStamp,
): Promise<void> {
  const image = await doc.embedPng(stamp.pngBytes);
  page.drawImage(image, {
    x: stamp.origin.x,
    y: stamp.origin.y,
    width: stamp.width,
    height: stamp.height,
  });
}

/**
 * The save side of the seam: a pure projection from the document model to PDF
 * bytes via pdf-lib. No DOM, so it is fully unit-testable with golden-file
 * round-trips. Field values are applied through the AcroForm; appearances are
 * regenerated so the values show in every viewer. Text boxes are drawn with the
 * embedded Unicode font; signature stamps are embedded as PNG images.
 */
export async function saveModel(
  model: DocumentModel,
  options: SaveOptions = {},
): Promise<Uint8Array> {
  // pdf-lib cannot decrypt, so an encrypted source can be neither preserved nor
  // safely rewritten; refuse before touching its (still-encrypted) content.
  const doc = await PDFDocument.load(model.sourceBytes, { ignoreEncryption: true });
  if (doc.isEncrypted) {
    throw new EncryptedSaveError();
  }
  const pages = doc.getPages();

  if (model.fieldValues.length > 0 || options.flatten) {
    const form = doc.getForm();
    for (const fieldValue of model.fieldValues) {
      applyFieldValue(form, fieldValue);
    }
    form.updateFieldAppearances();
    if (options.flatten) {
      // Bake the (now-appeared) field values into page content and drop the
      // interactive widgets, so the export has no editable AcroForm layer.
      form.flatten();
    }
  }

  const textBoxes = model.annotations.filter((a): a is TextBox => a.kind === "text");
  if (textBoxes.length > 0) {
    if (!options.fonts) {
      throw new Error("saveModel: fonts are required to draw text annotations");
    }
    const fonts = await embedTextFonts(doc, options.fonts);
    for (const box of textBoxes) {
      const page = pages[box.page];
      if (page) {
        drawTextBox(page, fonts, box);
      }
    }
  }

  for (const markup of model.annotations) {
    if (markup.kind !== "markup") {
      continue;
    }
    const page = pages[markup.page];
    if (page) {
      drawMarkup(page, markup);
    }
  }

  for (const note of model.annotations) {
    if (note.kind !== "note") {
      continue;
    }
    const page = pages[note.page];
    if (page) {
      addNote(doc, page, note);
    }
  }

  for (const stamp of model.annotations) {
    if (stamp.kind !== "signature") {
      continue;
    }
    const page = pages[stamp.page];
    if (page) {
      await drawSignature(doc, page, stamp);
    }
  }

  return doc.save();
}
