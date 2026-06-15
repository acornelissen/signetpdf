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
  removeAnnotation,
  updateAnnotation,
  withPages,
  type DocumentModel,
  type PageGeometry,
  type SignatureStamp,
  type TextBox,
} from "./model/document";
import { screenPoint } from "./model/geometry";
import {
  canRedo,
  canUndo,
  createHistory,
  record,
  redo,
  replacePresent,
  undo,
  type History,
} from "./model/history";
import { createTextBoxAt } from "./annotations/text";
import { createSignatureStampAt, type StampImage } from "./sign/stamp";
import { bindStampDelete, bindStampDrag, bindStampScale, buildStampControl } from "./sign/overlay";
import { createSignaturePad, type SignaturePad } from "./sign/pad";
import { importImageAsStamp } from "./sign/image";
import {
  bindTextBoxControl,
  bindTextBoxDelete,
  bindTextBoxDrag,
  bindTextBoxResize,
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
  // When a signature is armed, clicking a page places it as a stamp.
  pendingStamp: StampImage | null;
  // Id of a just-created box to focus after the next re-render.
  focusAnnotationId: string | null;
  // Undo/redo stack of model snapshots; present mirrors `model`.
  history: History | null;
}

/** Apply a model edit and record it for undo. The model is the present snapshot. */
function applyEdit(viewer: Viewer, next: DocumentModel): void {
  viewer.model = next;
  viewer.history = viewer.history ? record(viewer.history, next) : createHistory(next);
}

// Signature pad size (CSS px); the placed stamp keeps this aspect ratio.
const SIGNATURE_PAD = { width: 440, height: 180 };
const DEFAULT_STAMP_WIDTH = 200; // user-space points

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
        applyEdit(viewer, setFieldValue(viewer.model, name, value));
        updateHistoryButtons(viewer);
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
        applyEdit(viewer, updateAnnotation(viewer.model, updated));
      }
    };
    const control = buildTextBoxControl(annotation, geometry, viewport);
    bindTextBoxControl(control, annotation, commit);
    const commitAndRerender = (updated: TextBox): void => {
      commit(updated);
      void rerender(viewer);
    };
    bindTextBoxDrag(control, annotation, geometry, viewport, commitAndRerender);
    bindTextBoxResize(control, annotation, geometry, viewport, commitAndRerender);
    bindTextBoxDelete(control, annotation, (id) => {
      if (viewer.model) {
        applyEdit(viewer, removeAnnotation(viewer.model, id));
        void rerender(viewer);
      }
    });
    page.overlay.appendChild(control);
    if (annotation.id === viewer.focusAnnotationId) {
      viewer.focusAnnotationId = null;
      textBoxInput(control).focus();
    }
  }
}

/** Place the signature-stamp controls for one page, bound back to the model. */
function placeStamps(viewer: Viewer, page: RenderedPage, geometry: PageGeometry): void {
  const viewport = { scale: viewer.scale };
  for (const annotation of viewer.model?.annotations ?? []) {
    if (annotation.kind !== "signature" || annotation.page !== page.index) {
      continue;
    }
    const control = buildStampControl(annotation, geometry, viewport);
    const commitAndRerender = (updated: SignatureStamp): void => {
      if (viewer.model) {
        applyEdit(viewer, updateAnnotation(viewer.model, updated));
        void rerender(viewer);
      }
    };
    bindStampDrag(control, annotation, geometry, viewport, commitAndRerender);
    bindStampScale(control, annotation, geometry, viewport, commitAndRerender);
    bindStampDelete(control, annotation, (id) => {
      if (viewer.model) {
        applyEdit(viewer, removeAnnotation(viewer.model, id));
        void rerender(viewer);
      }
    });
    page.overlay.appendChild(control);
  }
}

/**
 * Arm the page so an empty-overlay click creates a text box (text tool) or
 * places the pending signature (sign tool). Clicks on existing controls are left
 * to those controls (edit/move/resize/delete).
 */
function armCreateTools(viewer: Viewer, page: RenderedPage, geometry: PageGeometry): void {
  page.overlay.addEventListener("pointerdown", (event) => {
    if (!viewer.model || event.target !== page.overlay) {
      return;
    }
    const rect = page.overlay.getBoundingClientRect();
    const click = screenPoint(event.clientX - rect.left, event.clientY - rect.top);
    const viewport = { scale: viewer.scale };

    if (viewer.textTool) {
      applyEdit(viewer, createTextBoxAt(viewer.model, click, geometry, viewport));
      viewer.focusAnnotationId =
        viewer.model.annotations[viewer.model.annotations.length - 1]?.id ?? null;
      setTextTool(viewer, false); // one box per activation
    } else if (viewer.pendingStamp) {
      applyEdit(
        viewer,
        createSignatureStampAt(viewer.model, click, geometry, viewport, viewer.pendingStamp),
      );
      setStampTool(viewer, null); // one placement per signature
    } else {
      return;
    }
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
    placeStamps(viewer, page, geometry);
    armCreateTools(viewer, page, geometry);
  }
  updateHistoryButtons(viewer);
}

async function setDocument(viewer: Viewer, bytes: Uint8Array, path: string | null): Promise<void> {
  const doc = await loadPdfDocument(bytes);
  const pages = await capturePageGeometry(doc);
  viewer.doc = doc;
  viewer.model = withPages(createModel(bytes), pages);
  viewer.history = createHistory(viewer.model); // fresh history per document
  viewer.fields = await listFormFields(doc);
  viewer.path = path;
  await rerender(viewer);
}

/** Reflect undo/redo availability on the toolbar buttons. */
function updateHistoryButtons(viewer: Viewer): void {
  const undoButton = document.querySelector<HTMLButtonElement>("#undo");
  const redoButton = document.querySelector<HTMLButtonElement>("#redo");
  if (undoButton) {
    undoButton.disabled = !viewer.history || !canUndo(viewer.history);
  }
  if (redoButton) {
    redoButton.disabled = !viewer.history || !canRedo(viewer.history);
  }
}

/** Step the history back or forward and re-render from the restored model. */
async function stepHistory(viewer: Viewer, direction: "undo" | "redo"): Promise<void> {
  if (!viewer.history) {
    return;
  }
  viewer.history = direction === "undo" ? undo(viewer.history) : redo(viewer.history);
  viewer.model = viewer.history.present;
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
  if (active) {
    setStampTool(viewer, null); // tools are mutually exclusive
  }
}

/** Arm or disarm signature placement; a non-null image means a click places it. */
function setStampTool(viewer: Viewer, image: StampImage | null): void {
  viewer.pendingStamp = image;
  viewer.mount.classList.toggle("tool-stamp", image !== null);
}

/**
 * Open the signature dialog: a fresh pad to draw on, with clear/cancel/use. On
 * "use" the drawn PNG is captured and signature placement is armed, so the next
 * page click drops the stamp (createSignatureStampAt) at that point.
 */
function openSignatureDialog(viewer: Viewer): void {
  const dialog = document.querySelector<HTMLDialogElement>("#signature-dialog");
  const host = document.querySelector<HTMLElement>("#signature-pad-host");
  if (!dialog || !host) {
    return;
  }
  const pad = createSignaturePad(SIGNATURE_PAD.width, SIGNATURE_PAD.height);
  host.replaceChildren(pad.element);
  bindSignatureDialog(viewer, dialog, pad);
  dialog.showModal();
}

/**
 * Import a signature from an image file: pick via Rust (open_image), rasterise
 * to a transparent PNG, and arm placement. Unsupported or unreadable files
 * surface on the status line.
 */
async function importSignature(viewer: Viewer, dialog: HTMLDialogElement): Promise<void> {
  const data = await invoke<number[] | null>("open_image");
  if (!data) {
    return; // user cancelled
  }
  try {
    const image = await importImageAsStamp(new Uint8Array(data), DEFAULT_STAMP_WIDTH);
    setTextTool(viewer, false);
    setStampTool(viewer, image);
    dialog.close();
  } catch (error) {
    setStatus(viewer, `Could not import that image: ${String(error)}`);
  }
}

/** Wire the dialog's clear/cancel/use actions to a freshly mounted pad. */
function bindSignatureDialog(viewer: Viewer, dialog: HTMLDialogElement, pad: SignaturePad): void {
  const action = (id: string, run: () => void): void => {
    const button = dialog.querySelector<HTMLButtonElement>(id);
    if (button) {
      button.onclick = run;
    }
  };
  action("#signature-clear", () => pad.clear());
  action("#signature-cancel", () => dialog.close());
  action("#signature-import", () => {
    void importSignature(viewer, dialog);
  });
  action("#signature-use", () => {
    if (pad.isEmpty()) {
      return;
    }
    setTextTool(viewer, false); // tools are mutually exclusive
    const aspect = SIGNATURE_PAD.height / SIGNATURE_PAD.width;
    setStampTool(viewer, {
      pngBytes: pad.exportPng(),
      width: DEFAULT_STAMP_WIDTH,
      height: DEFAULT_STAMP_WIDTH * aspect,
    });
    dialog.close();
  });
}

/** Mark the document saved (dirty=false) without adding an undo step. */
function markViewerSaved(viewer: Viewer): void {
  if (!viewer.model) {
    return;
  }
  viewer.model = markSaved(viewer.model);
  if (viewer.history) {
    viewer.history = replacePresent(viewer.history, viewer.model);
  }
}

/** Project the model to bytes, supplying the font only when text must be drawn. */
async function projectBytes(
  model: DocumentModel,
  extra: Partial<SaveOptions> = {},
): Promise<Uint8Array> {
  const needsFont = model.annotations.some((a) => a.kind === "text");
  const options: SaveOptions = {
    ...extra,
    ...(needsFont ? { fontBytes: await loadFontBytes() } : {}),
  };
  return saveModel(model, options);
}

/**
 * Export a flattened copy via Save As: fields are baked into static content with
 * no editable layer. The working document is left untouched (still editable, its
 * dirty state and history intact).
 */
async function exportFlattened(viewer: Viewer): Promise<void> {
  if (!viewer.model) {
    return;
  }
  const bytes = await projectBytes(viewer.model, { flatten: true });
  const path = await invoke<string | null>("save_pdf_as", { bytes: Array.from(bytes) });
  if (!path) {
    return; // user cancelled
  }
  setStatus(viewer, "Exported a flattened copy.");
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
  markViewerSaved(viewer);
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
  markViewerSaved(viewer);
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
    pendingStamp: null,
    focusAnnotationId: null,
    history: null,
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
  on("#export-flat", () => exportFlattened(viewer), "export a flattened PDF");
  on("#zoom-in", () => setScale(viewer, viewer.scale * ZOOM_STEP), "zoom");
  on("#zoom-out", () => setScale(viewer, viewer.scale / ZOOM_STEP), "zoom");
  on("#zoom-fit", () => fitWidth(viewer), "fit to width");
  on("#undo", () => stepHistory(viewer, "undo"), "undo");
  on("#redo", () => stepHistory(viewer, "redo"), "redo");

  viewer.textToolButton?.addEventListener("click", () => {
    setTextTool(viewer, !viewer.textTool);
  });

  document.querySelector<HTMLButtonElement>("#sign-tool")?.addEventListener("click", () => {
    openSignatureDialog(viewer);
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
