import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PageGeometry } from "../model/document";

/** Snap a /Rotate value to one of 0, 90, 180, 270. */
function normalizeRotation(degrees: number): number {
  return (((Math.round(degrees / 90) * 90) % 360) + 360) % 360;
}

/**
 * Capture each page's geometry from pdf.js for the model. width/height are the
 * UNROTATED user-space size (points); rotation is captured separately. Keeping
 * the stored size unrotated means the model, the seam (m1-5), and the save
 * projection (m1-7) all share one canonical space and apply rotation in exactly
 * one place.
 */
export async function capturePageGeometry(doc: PDFDocumentProxy): Promise<PageGeometry[]> {
  const pages: PageGeometry[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const unrotated = page.getViewport({ scale: 1, rotation: 0 });
    pages.push({
      index: pageNumber - 1,
      width: unrotated.width,
      height: unrotated.height,
      rotation: normalizeRotation(page.rotate),
    });
  }
  return pages;
}
