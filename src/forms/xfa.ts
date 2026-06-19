import { PDFDict, PDFDocument, PDFName } from "pdf-lib";

/**
 * True if the PDF carries an XFA form. Ceralo only supports AcroForm, so XFA
 * documents are refused rather than half-rendered. Detection is the AcroForm
 * /XFA entry, which is present for both pure and hybrid XFA forms.
 */
export async function hasXfa(bytes: Uint8Array): Promise<boolean> {
  const doc = await PDFDocument.load(bytes, {
    ignoreEncryption: true,
    throwOnInvalidObject: false,
  });
  // Untyped lookup: the typed form throws when AcroForm is absent (no-forms PDFs).
  const acroForm = doc.catalog.lookup(PDFName.of("AcroForm"));
  return acroForm instanceof PDFDict && acroForm.has(PDFName.of("XFA"));
}
