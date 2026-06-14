import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Render one page of a pdf.js document onto a canvas at the given scale. This
 * is plain rasterisation: it reads the document and nothing else. Document-model
 * state (fields, annotations) never enters here — that boundary is the M1 seam.
 */
export async function renderPageToCanvas(
  doc: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale = 1,
): Promise<void> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvasContext = canvas.getContext("2d");
  if (!canvasContext) {
    throw new Error("2D canvas context unavailable");
  }
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvas, canvasContext, viewport }).promise;
}

/** A rendered page and the overlay layer stacked over its canvas. */
export interface RenderedPage {
  readonly index: number; // 0-based
  readonly overlay: HTMLElement;
}

/**
 * Render every page of a document, stacked top to bottom, into `mount`. Each page
 * is a positioned container holding the canvas and an empty overlay layer the
 * caller fills with form/annotation controls (placed via the coordinate seam).
 * Existing content is cleared first; large-document virtualisation is m5-9.
 */
export async function renderAllPages(
  doc: PDFDocumentProxy,
  mount: HTMLElement,
  scale = 1.25,
): Promise<RenderedPage[]> {
  mount.replaceChildren();
  const pages: RenderedPage[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const container = document.createElement("div");
    container.className = "page-container";

    const canvas = document.createElement("canvas");
    canvas.className = "page";
    container.appendChild(canvas);

    const overlay = document.createElement("div");
    overlay.className = "overlay";
    container.appendChild(overlay);

    mount.appendChild(container);
    await renderPageToCanvas(doc, pageNumber, canvas, scale);
    pages.push({ index: pageNumber - 1, overlay });
  }
  return pages;
}
