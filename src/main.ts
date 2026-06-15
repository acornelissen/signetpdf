// SignetPDF frontend entry point.
// Configures the pdf.js worker, renders a bundled fixture on startup, and lets
// the user open a PDF (Rust open_pdf), scroll/zoom it, and save it back (Rust
// save_pdf / save_pdf_as). The DocumentModel is the source of truth for saving
// and the dirty flag; failures surface in a status line.
import "./pdf/worker";
import fixtureUrl from "../fixtures/two-page.pdf?url";
import fontUrl from "./assets/fonts/NotoSans-Regular.ttf?url";
import { invoke } from "@tauri-apps/api/core";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  createModel,
  markSaved,
  setFieldValue,
  updateAnnotation,
  withPages,
  type DocumentModel,
  type PageGeometry,
  type TextBox,
} from "./model/document";
import { screenPoint } from "./model/geometry";
import { createTextBoxAt } from "./annotations/text";
import {
  bindTextBoxControl,
  bindTextBoxDrag,
  buildTextBoxControl,
  textBoxInput,
} from "./annotations/overlay";
import { listFormFields, type FormField } from "./forms/fields";
import { applyFieldValue, bindFieldControl, buildFieldControl } from "./forms/overlay";
import { hasXfa } from "./forms/xfa";
import { loadPdfDocument } from "./pdf/document";
import { capturePageGeometry } from "./pdf/geometry";
import { renderAllPages, type RenderedPage } from "./pdf/render";
import { saveModel, type SaveOptions } from "./save/save";
import { clampScale, fitToWidthScale, ZOOM_STEP } from "./pdf/zoom";

// The Unicode text font is a bundled asset fetched from 'self' (CSP-safe) and
// cached: it is only needed when the model has text annotations to draw on save.
let fontBytesCache: Uint8Array | null = null;
async function loadFontBytes(): Promise<Uint8Array> {
  fontBytesCache ??= new Uint8Array(await (await fetch(fontUrl)).arrayBuffer());
  return fontBytesCache;
}

interface OpenedPdf {
  path: string;
  bytes: number[];
}

interface Viewer {
  mount: HTMLElement;
  status: HTMLElement | null;
  zoomLabel: HTMLElement | null;
  textToolButton: HTMLButtonElement | null;
  doc: PDFDocumentProxy | null;
  model: DocumentModel | null;
  fields: FormField[];
  path: string | null;
  scale: number;
  // When the text tool is armed, clicking a page creates a text box.
  textTool: boolean;
  // Id of a just-created box to focus after the next re-render.
  focusAnnotationId: string | null;
}

function setStatus(viewer: Viewer, message: string): void {
  if (viewer.status) {
    viewer.status.textContent = message;
  }
}

/** Place the AcroForm controls for one page, bound back to the model. */
function placeFormControls(viewer: Viewer, page: RenderedPage, geometry: PageGeometry): void {
  const viewport = { scale: viewer.scale };
  for (const field of viewer.fields) {
    if (field.page !== page.index) {
      continue;
    }
    const control = buildFieldControl(field, geometry, viewport);
    if (!control) {
      continue;
    }
    // Show the user's edit if there is one, otherwise the PDF's existing value.
    const edited = viewer.model?.fieldValues.find((f) => f.fieldName === field.name)?.value;
    applyFieldValue(control, field.kind, edited ?? field.value);
    bindFieldControl(control, field, (name, value) => {
      if (viewer.model) {
        viewer.model = setFieldValue(viewer.model, name, value);
      }
    });
    page.overlay.appendChild(control);
  }
}

/** Place the editable text-box controls for one page, bound back to the model. */
function placeTextBoxes(viewer: Viewer, page: RenderedPage, geometry: PageGeometry): void {
  const viewport = { scale: viewer.scale };
  for (const annotation of viewer.model?.annotations ?? []) {
    if (annotation.kind !== "text" || annotation.page !== page.index) {
      continue;
    }
    const commit = (updated: TextBox): void => {
      if (viewer.model) {
        viewer.model = updateAnnotation(viewer.model, updated);
      }
    };
    const control = buildTextBoxControl(annotation, geometry, viewport);
    bindTextBoxControl(control, annotation, commit);
    bindTextBoxDrag(control, annotation, geometry, viewport, (updated) => {
      commit(updated);
      void rerender(viewer);
    });
    page.overlay.appendChild(control);
    if (annotation.id === viewer.focusAnnotationId) {
      viewer.focusAnnotationId = null;
      textBoxInput(control).focus();
    }
  }
}

/** Arm the page so a click creates a text box when the text tool is active. */
function armTextTool(viewer: Viewer, page: RenderedPage, geometry: PageGeometry): void {
  page.overlay.addEventListener("pointerdown", (event) => {
    // Only empty-overlay clicks create a box; clicks on existing controls edit.
    if (!viewer.textTool || !viewer.model || event.target !== page.overlay) {
      return;
    }
    const rect = page.overlay.getBoundingClientRect();
    const click = screenPoint(event.clientX - rect.left, event.clientY - rect.top);
    viewer.model = createTextBoxAt(viewer.model, click, geometry, { scale: viewer.scale });
    viewer.focusAnnotationId =
      viewer.model.annotations[viewer.model.annotations.length - 1]?.id ?? null;
    setTextTool(viewer, false); // one box per activation
    void rerender(viewer);
  });
}

async function rerender(viewer: Viewer): Promise<void> {
  if (viewer.zoomLabel) {
    viewer.zoomLabel.textContent = `${Math.round(viewer.scale * 100)}%`;
  }
  if (!viewer.doc || !viewer.model) {
    return;
  }
  const rendered = await renderAllPages(viewer.doc, viewer.mount, viewer.scale);
  for (const page of rendered) {
    const geometry = viewer.model.pages[page.index];
    if (!geometry) {
      continue;
    }
    placeFormControls(viewer, page, geometry);
    placeTextBoxes(viewer, page, geometry);
    armTextTool(viewer, page, geometry);
  }
}

async function setDocument(viewer: Viewer, bytes: Uint8Array, path: string | null): Promise<void> {
  const doc = await loadPdfDocument(bytes);
  const pages = await capturePageGeometry(doc);
  viewer.doc = doc;
  viewer.model = withPages(createModel(bytes), pages);
  viewer.fields = await listFormFields(doc);
  viewer.path = path;
  await rerender(viewer);
}

async function setScale(viewer: Viewer, scale: number): Promise<void> {
  viewer.scale = clampScale(scale);
  await rerender(viewer);
}

async function fitWidth(viewer: Viewer): Promise<void> {
  if (!viewer.doc) {
    return;
  }
  const page = await viewer.doc.getPage(1);
  const { width } = page.getViewport({ scale: 1 });
  await setScale(viewer, fitToWidthScale(width, viewer.mount.clientWidth));
}

/** Returns false if there are unsaved changes the user chose to keep. */
function mayDiscard(viewer: Viewer): boolean {
  return !viewer.model?.dirty || window.confirm("Discard unsaved changes?");
}

/** Arm or disarm the text tool and reflect it on the toolbar and cursor. */
function setTextTool(viewer: Viewer, active: boolean): void {
  viewer.textTool = active;
  viewer.mount.classList.toggle("tool-text", active);
  viewer.textToolButton?.setAttribute("aria-pressed", String(active));
}

/** Project the model to bytes, supplying the font only when text must be drawn. */
async function projectBytes(model: DocumentModel): Promise<Uint8Array> {
  const needsFont = model.annotations.some((a) => a.kind === "text");
  const options: SaveOptions = needsFont ? { fontBytes: await loadFontBytes() } : {};
  return saveModel(model, options);
}

async function openUserPdf(viewer: Viewer): Promise<void> {
  if (!mayDiscard(viewer)) {
    return;
  }
  const opened = await invoke<OpenedPdf | null>("open_pdf");
  if (!opened) {
    return; // user cancelled the dialog
  }
  const bytes = new Uint8Array(opened.bytes);
  if (await hasXfa(bytes)) {
    setStatus(viewer, "This PDF uses an XFA form, which SignetPDF can't edit. It was not opened.");
    return;
  }
  await setDocument(viewer, bytes, opened.path);
}

async function save(viewer: Viewer): Promise<void> {
  if (!viewer.model) {
    return;
  }
  if (!viewer.path) {
    await saveAs(viewer);
    return;
  }
  const bytes = await projectBytes(viewer.model);
  await invoke("save_pdf", { path: viewer.path, bytes: Array.from(bytes) });
  viewer.model = markSaved(viewer.model);
  setStatus(viewer, "Saved.");
}

async function saveAs(viewer: Viewer): Promise<void> {
  if (!viewer.model) {
    return;
  }
  const bytes = await projectBytes(viewer.model);
  const path = await invoke<string | null>("save_pdf_as", { bytes: Array.from(bytes) });
  if (!path) {
    return; // user cancelled the dialog
  }
  viewer.path = path;
  viewer.model = markSaved(viewer.model);
  setStatus(viewer, "Saved.");
}

async function showBundledFixture(viewer: Viewer): Promise<void> {
  const bytes = new Uint8Array(await (await fetch(fixtureUrl)).arrayBuffer());
  await setDocument(viewer, bytes, null);
}

window.addEventListener("DOMContentLoaded", () => {
  const mount = document.querySelector<HTMLElement>("#viewer");
  if (!mount) {
    return;
  }

  const viewer: Viewer = {
    mount,
    status: document.querySelector<HTMLElement>("#status"),
    zoomLabel: document.querySelector<HTMLElement>("#zoom-level"),
    textToolButton: document.querySelector<HTMLButtonElement>("#text-tool"),
    doc: null,
    model: null,
    fields: [],
    path: null,
    scale: 1.25,
    textTool: false,
    focusAnnotationId: null,
  };

  const run = (action: () => Promise<void>, what: string): void => {
    setStatus(viewer, "");
    action().catch((error: unknown) => {
      setStatus(viewer, `Could not ${what}: ${String(error)}`);
    });
  };

  const on = (id: string, action: () => Promise<void>, what: string): void => {
    document
      .querySelector<HTMLButtonElement>(id)
      ?.addEventListener("click", () => run(action, what));
  };

  on("#open", () => openUserPdf(viewer), "open that PDF");
  on("#save", () => save(viewer), "save the PDF");
  on("#save-as", () => saveAs(viewer), "save the PDF");
  on("#zoom-in", () => setScale(viewer, viewer.scale * ZOOM_STEP), "zoom");
  on("#zoom-out", () => setScale(viewer, viewer.scale / ZOOM_STEP), "zoom");
  on("#zoom-fit", () => fitWidth(viewer), "fit to width");

  viewer.textToolButton?.addEventListener("click", () => {
    setTextTool(viewer, !viewer.textTool);
  });

  // Warn before leaving with unsaved changes.
  window.addEventListener("beforeunload", (event) => {
    if (viewer.model?.dirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  run(() => showBundledFixture(viewer), "render the bundled PDF");
});
