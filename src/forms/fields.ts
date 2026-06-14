import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

export type FieldKind = "text" | "checkbox" | "radio" | "dropdown" | "optionlist";

/** A field rectangle in PDF user space (points, bottom-left origin). */
export interface FieldRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * One interactive AcroForm widget. A field can have several widgets (e.g. a
 * radio group has one per option, sharing a name), so this is per-widget — which
 * is what the overlay layer (m2-2/3/4) needs.
 */
export interface FormField {
  readonly name: string;
  readonly kind: FieldKind;
  readonly page: number; // 0-based index into model.pages
  readonly rect: FieldRect;
  readonly options?: readonly string[];
  // The "on" value for this checkbox/radio widget (pdf.js export/button value).
  readonly onValue?: string;
}

// pdf.js getAnnotations() is loosely typed; this is the subset we read.
interface PdfWidget {
  subtype?: string;
  fieldType?: string;
  fieldName?: string;
  rect: number[];
  checkBox?: boolean;
  radioButton?: boolean;
  combo?: boolean;
  exportValue?: string;
  buttonValue?: string;
  options?: Array<{ exportValue?: string; displayValue?: string }>;
}

function classify(widget: PdfWidget): FieldKind | null {
  switch (widget.fieldType) {
    case "Tx":
      return "text";
    case "Btn":
      if (widget.checkBox) return "checkbox";
      if (widget.radioButton) return "radio";
      return null; // push buttons hold no value to fill
    case "Ch":
      return widget.combo ? "dropdown" : "optionlist";
    default:
      return null;
  }
}

/** Enumerate the fillable AcroForm widgets across all pages. */
export async function listFormFields(doc: PDFDocumentProxy): Promise<FormField[]> {
  const fields: FormField[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const widgets = (await page.getAnnotations()) as unknown as PdfWidget[];
    for (const widget of widgets) {
      if (widget.subtype !== "Widget") {
        continue;
      }
      const kind = classify(widget);
      if (!kind) {
        continue;
      }
      const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = widget.rect;
      const options = widget.options?.map(
        (option) => option.displayValue ?? option.exportValue ?? "",
      );
      const onValue = widget.buttonValue ?? widget.exportValue;
      fields.push({
        name: widget.fieldName ?? "",
        kind,
        page: pageNumber - 1,
        rect: {
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          width: Math.abs(x2 - x1),
          height: Math.abs(y2 - y1),
        },
        ...(options ? { options } : {}),
        ...(onValue !== undefined ? { onValue } : {}),
      });
    }
  }
  return fields;
}
