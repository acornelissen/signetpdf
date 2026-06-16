import { AnnotationMode, TextLayer, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { DisplaySize } from "./layout";

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
  // ENABLE_FORMS renders the page and non-form annotations but NOT interactive
  // form widgets — those are drawn by our HTML overlay, so the canvas must not
  // paint them too (otherwise field values render twice).
  await page.render({
    canvas,
    canvasContext,
    viewport,
    annotationMode: AnnotationMode.ENABLE_FORMS,
  }).promise;
}

/**
 * A page placeholder: a sized container holding the (initially blank) canvas and
 * the overlay layer the caller fills with form/annotation controls. The canvas
 * is rendered on demand when the page nears the viewport and cleared when it
 * leaves, so a large document stays bounded in memory (m5-9).
 */
export interface RenderedPage {
  readonly index: number; // 0-based
  readonly container: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  // Selectable text spans (pdf.js TextLayer), between the canvas and the overlay.
  readonly text: HTMLElement;
  readonly overlay: HTMLElement;
}

/**
 * Render a page's selectable text layer into `container` at the given scale: the
 * transparent, positioned spans pdf.js uses for text selection and copy. Returns
 * the TextLayer so the caller can cancel it when the page scrolls away. The
 * --total-scale-factor variable is what pdf.js's CSS uses to size the spans; the
 * viewer (which we don't use) would normally set it, so we set it here.
 */
export async function renderPageTextLayer(
  doc: PDFDocumentProxy,
  pageNumber: number,
  container: HTMLElement,
  scale: number,
): Promise<TextLayer> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  // Pass the text stream straight to TextLayer (which reads it via getReader)
  // rather than page.getTextContent(), whose `for await ... of readableStream`
  // throws on WebKit/WKWebView builds without ReadableStream async iteration.
  const textContentSource = page.streamTextContent({
    includeMarkedContent: true,
    disableNormalization: true,
  });
  container.replaceChildren();
  container.style.setProperty("--total-scale-factor", String(scale));
  const layer = new TextLayer({ textContentSource, container, viewport });
  await layer.render();
  return layer;
}

/**
 * Extract a page's text as a single string for searching, in reading order. Read
 * via getReader (not `for await`, which throws on WebKit builds without
 * ReadableStream async iteration) and concatenated the same way the text layer
 * builds its spans, so search offsets line up with the rendered spans.
 */
export async function extractPageText(doc: PDFDocumentProxy, pageNumber: number): Promise<string> {
  const page = await doc.getPage(pageNumber);
  const reader = page
    .streamTextContent({ includeMarkedContent: true, disableNormalization: true })
    .getReader();
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    for (const item of value.items) {
      if ("str" in item) {
        text += item.str;
      }
    }
  }
  return text;
}

/** Cancel a page's text layer and drop its spans when it scrolls out of view. */
export function clearTextLayer(container: HTMLElement, layer: TextLayer | undefined): void {
  layer?.cancel();
  container.replaceChildren();
  container.style.removeProperty("--total-scale-factor");
}

/**
 * Lay out one sized, empty placeholder per page, stacked top to bottom, into
 * `mount`. Sizing every placeholder up front keeps the scroll height and the
 * coordinate seam correct whether or not a page is currently drawn. Existing
 * content is cleared first. Canvases are rendered later by renderPageToCanvas.
 */
export function createPagePlaceholders(mount: HTMLElement, sizes: DisplaySize[]): RenderedPage[] {
  mount.replaceChildren();
  return sizes.map((size, index) => {
    const container = document.createElement("div");
    container.className = "page-container";
    container.style.width = `${size.width}px`;
    container.style.height = `${size.height}px`;

    const canvas = document.createElement("canvas");
    canvas.className = "page";
    container.appendChild(canvas);

    // Text layer sits above the canvas (for selection) but below the overlay
    // (so annotation/form controls stay on top and clickable).
    const text = document.createElement("div");
    text.className = "textLayer";
    container.appendChild(text);

    const overlay = document.createElement("div");
    overlay.className = "overlay";
    container.appendChild(overlay);

    mount.appendChild(container);
    return { index, container, canvas, text, overlay };
  });
}

/** Release a page's canvas memory when it scrolls out of view. */
export function clearPageCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}
