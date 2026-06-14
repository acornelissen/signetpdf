import { PDFDocument } from "pdf-lib";
import type { DocumentModel } from "../model/document";

// The save side of the seam: a pure projection from the document model to PDF
// bytes via pdf-lib. No DOM, so it is fully unit-testable with golden-file
// round-trips. For an empty model this loads the original bytes and writes them
// back unchanged. Field values (m2-6), free text (m3-7) and signatures (m4-5)
// extend this projection; each addition keeps the function pure.
export async function saveModel(model: DocumentModel): Promise<Uint8Array> {
  const doc = await PDFDocument.load(model.sourceBytes);
  return doc.save();
}
