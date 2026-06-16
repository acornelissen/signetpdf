// SignetPDF frontend entry point.
// Configures the pdf.js worker, shows an empty-state screen until the user opens
// a PDF (Rust open_pdf, or drag-and-drop), then lets them scroll/zoom it and
// save it back (Rust save_pdf / save_pdf_as). The DocumentModel is the source of
// truth for saving and the dirty flag; status and failures surface as toasts.
import "./pdf/worker";
import fontUrl from "./assets/fonts/NotoSans-Regular.ttf?url";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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
import { detectPlatform, matchShortcut } from "./app/shortcuts";
import { buildDock } from "./app/dock";
import { icon } from "./app/icons";
import { createToasts, type Toasts, type ToastVariant } from "./app/toast";
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
import { openPdfDocument } from "./pdf/document";
import { openWithPassword } from "./app/password";
import { capturePageGeometry } from "./pdf/geometry";
import { mostVisiblePage, pageDisplaySize } from "./pdf/layout";
import {
  clearPageCanvas,
  clearTextLayer,
  createPagePlaceholders,
  renderPageTextLayer,
  renderPageToCanvas,
  type RenderedPage,
} from "./pdf/render";
import type { TextLayer } from "pdfjs-dist/legacy/build/pdf.mjs";
import "./pdf/textlayer.css";
import "./pdf/textlayer.overrides.css"; // must load after textlayer.css to win
import { isEncryptedPdf, saveModel, type SaveOptions } from "./save/save";
import { clampScale, fitToWidthScale, stepZoom, zoomByDelta } from "./pdf/zoom";

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

// WebKit's non-standard pinch gesture event (macOS WKWebView). `scale` is the
// cumulative pinch factor since the gesture began (1 = unchanged).
interface GestureZoomEvent extends Event {
  readonly scale: number;
  readonly clientX: number;
  readonly clientY: number;
}

interface Viewer {
  mount: HTMLElement;
  // Floating toast stack for status/errors; null until the DOM is ready.
  toasts: Toasts | null;
  // Chrome that toggles with document presence: the empty-state screen and the
  // floating dock are hidden until a document is open.
  emptyState: HTMLElement | null;
  dock: HTMLElement | null;
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
  // True when the open document is encrypted; saving is disabled for it.
  encrypted: boolean;
  // Observes page placeholders to render/free pages as they near the viewport.
  observer: IntersectionObserver | null;
  // Tracks how much of each page is in view, to drive the page indicator.
  pageObserver: IntersectionObserver | null;
  pageRatios: Map<number, number>;
  // Live text layers by page index, kept so they can be cancelled on unmount.
  textLayers: Map<number, TextLayer>;
}

/** Apply a model edit and record it for undo. The model is the present snapshot. */
function applyEdit(viewer: Viewer, next: DocumentModel): void {
  viewer.model = next;
  viewer.history = viewer.history ? record(viewer.history, next) : createHistory(next);
}

// Signature pad size (CSS px); the placed stamp keeps this aspect ratio.
const SIGNATURE_PAD = { width: 440, height: 180 };
const DEFAULT_STAMP_WIDTH = 200; // user-space points

/** Surface a message as a floating toast. Errors are sticky; the rest fade. */
function notify(viewer: Viewer, message: string, variant: ToastVariant = "info"): void {
  viewer.toasts?.notify(message, variant);
}

/** Show the empty-state screen or the document chrome based on whether a doc is open. */
function showDocumentChrome(viewer: Viewer, hasDocument: boolean): void {
  viewer.mount.hidden = !hasDocument;
  if (viewer.emptyState) {
    viewer.emptyState.hidden = hasDocument;
  }
  if (viewer.dock) {
    viewer.dock.hidden = !hasDocument;
  }
}

/** Reflect the model's dirty flag as a dot badge on the Save button. */
function updateSaveDirty(viewer: Viewer): void {
  const save = document.querySelector<HTMLButtonElement>("#save");
  save?.setAttribute("data-dirty", String(viewer.model?.dirty ?? false));
}

/**
 * Wire the responsive overflow menu: on a narrow window the Save As and Export
 * actions collapse into a "More" popover. Menu items activate the matching dock
 * buttons (still in the DOM, just hidden), so their behaviour stays wired once.
 */
function setupOverflowMenu(): void {
  const moreButton = document.querySelector<HTMLButtonElement>("#dock-more");
  const menu = document.querySelector<HTMLElement>("#dock-more-menu");
  const collapsible = ["#save-as", "#export-flat"].map((id) =>
    document.querySelector<HTMLButtonElement>(id),
  );
  if (!moreButton || !menu) {
    return;
  }

  const setMenuOpen = (open: boolean): void => {
    menu.hidden = !open;
    moreButton.setAttribute("aria-expanded", String(open));
    if (open) {
      menu.querySelector<HTMLButtonElement>(".dock-menu-item")?.focus();
    }
  };

  moreButton.addEventListener("click", () => setMenuOpen(menu.hidden));

  for (const item of menu.querySelectorAll<HTMLButtonElement>(".dock-menu-item")) {
    item.addEventListener("click", () => {
      setMenuOpen(false);
      document.querySelector<HTMLButtonElement>(`#${item.dataset.action ?? ""}`)?.click();
    });
  }

  // Close on Escape (returning focus to the button) and on an outside click.
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) {
      setMenuOpen(false);
      moreButton.focus();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    const target = event.target as Node;
    if (!menu.hidden && !menu.contains(target) && target !== moreButton) {
      setMenuOpen(false);
    }
  });

  // Collapse the actions into "More" only when the dock would be cramped.
  const narrow = window.matchMedia("(max-width: 760px)");
  const apply = (isNarrow: boolean): void => {
    for (const button of collapsible) {
      if (button) {
        button.hidden = isNarrow;
      }
    }
    moreButton.hidden = !isNarrow;
    if (!isNarrow) {
      setMenuOpen(false);
    }
  };
  apply(narrow.matches);
  narrow.addEventListener("change", (event) => apply(event.matches));
}

/** Show or hide the "Opening…" indicator while a document loads. */
function showLoading(viewer: Viewer, active: boolean): void {
  const loading = document.querySelector<HTMLElement>("#loading");
  if (loading) {
    loading.hidden = !active;
  }
  viewer.mount.setAttribute("aria-busy", String(active));
}

/** Update the dock's "n / total" readout from the tracked page visibilities. */
function updatePageIndicator(viewer: Viewer): void {
  const indicator = document.querySelector<HTMLElement>("#page-indicator");
  if (!indicator || !viewer.model) {
    return;
  }
  const total = viewer.model.pages.length;
  const visibilities = [...viewer.pageRatios].map(([index, ratio]) => ({ index, ratio }));
  const current = mostVisiblePage(visibilities);
  indicator.textContent = current === null ? `– / ${total}` : `${current + 1} / ${total}`;
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

// Render a page's canvas and place its controls when it nears the viewport. The
// set tracks which pages are currently live so mount/unmount stay idempotent and
// a page unmounted mid-render (a fast scroll) is left clean.
async function mountPage(
  viewer: Viewer,
  page: RenderedPage,
  geometry: PageGeometry,
  live: Set<number>,
): Promise<void> {
  if (live.has(page.index) || !viewer.doc) {
    return;
  }
  live.add(page.index);
  try {
    await renderPageToCanvas(viewer.doc, page.index + 1, page.canvas, viewer.scale);
  } catch {
    live.delete(page.index);
    return;
  }
  if (!live.has(page.index)) {
    clearPageCanvas(page.canvas); // unmounted while rendering
    return;
  }
  placeFormControls(viewer, page, geometry);
  placeTextBoxes(viewer, page, geometry);
  placeStamps(viewer, page, geometry);

  // Selection is a non-critical enhancement: render the text layer after the
  // canvas, and never let a failure block the page from showing.
  try {
    const layer = await renderPageTextLayer(viewer.doc, page.index + 1, page.text, viewer.scale);
    if (live.has(page.index)) {
      viewer.textLayers.set(page.index, layer);
    } else {
      clearTextLayer(page.text, layer); // unmounted while building
    }
  } catch (error) {
    // Selection is non-critical, so don't block the page — but surface the
    // reason rather than swallowing it.
    console.warn(`Text layer failed for page ${page.index + 1}:`, error);
    clearTextLayer(page.text, undefined);
  }
}

/** Free a page that scrolled away: drop its canvas, text layer and controls. */
function unmountPage(viewer: Viewer, page: RenderedPage, live: Set<number>): void {
  if (!live.delete(page.index)) {
    return;
  }
  clearPageCanvas(page.canvas);
  clearTextLayer(page.text, viewer.textLayers.get(page.index));
  viewer.textLayers.delete(page.index);
  page.overlay.replaceChildren();
}

async function rerender(viewer: Viewer): Promise<void> {
  if (viewer.zoomLabel) {
    viewer.zoomLabel.textContent = `${Math.round(viewer.scale * 100)}%`;
  }
  if (!viewer.doc || !viewer.model) {
    return;
  }
  viewer.observer?.disconnect();

  // Placeholders (and their text layers) are about to be replaced; cancel any
  // pending text-layer renders so they don't write into detached nodes.
  for (const layer of viewer.textLayers.values()) {
    layer.cancel();
  }
  viewer.textLayers.clear();

  const model = viewer.model;
  const sizes = model.pages.map((page) => pageDisplaySize(page, viewer.scale));
  const placeholders = createPagePlaceholders(viewer.mount, sizes);
  const byContainer = new Map(placeholders.map((page) => [page.container, page]));
  const live = new Set<number>();

  // The create-tools listener lives on the overlay, which persists across
  // mount/unmount, so it is armed once per placeholder rather than per mount.
  for (const page of placeholders) {
    const geometry = model.pages[page.index];
    if (geometry) {
      armCreateTools(viewer, page, geometry);
    }
  }

  // Render pages within ~one screen of the viewport; free them when far away.
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const page = byContainer.get(entry.target as HTMLElement);
        const geometry = page && model.pages[page.index];
        if (!page || !geometry) {
          continue;
        }
        if (entry.isIntersecting) {
          void mountPage(viewer, page, geometry, live);
        } else {
          unmountPage(viewer, page, live);
        }
      }
    },
    { root: null, rootMargin: "300px 0px" },
  );
  placeholders.forEach((page) => observer.observe(page.container));
  viewer.observer = observer;

  // A second, margin-free observer tracks the true viewport fraction of each
  // page to drive the "n / total" indicator (the render observer's 300px margin
  // would skew the ratios).
  viewer.pageObserver?.disconnect();
  viewer.pageRatios = new Map();
  const pageObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const page = byContainer.get(entry.target as HTMLElement);
        if (page) {
          viewer.pageRatios.set(page.index, entry.intersectionRatio);
        }
      }
      updatePageIndicator(viewer);
    },
    { root: null, threshold: [0, 0.25, 0.5, 0.75, 1] },
  );
  placeholders.forEach((page) => pageObserver.observe(page.container));
  viewer.pageObserver = pageObserver;

  updateHistoryButtons(viewer);
  updateSaveDirty(viewer);
  updatePageIndicator(viewer);
}

async function setDocument(
  viewer: Viewer,
  doc: PDFDocumentProxy,
  bytes: Uint8Array,
  path: string | null,
): Promise<void> {
  const pages = await capturePageGeometry(doc);
  viewer.doc = doc;
  viewer.model = withPages(createModel(bytes), pages);
  viewer.history = createHistory(viewer.model); // fresh history per document
  viewer.fields = await listFormFields(doc);
  viewer.path = path;
  viewer.encrypted = await isEncryptedPdf(bytes);
  await rerender(viewer);
  showDocumentChrome(viewer, true);
  if (viewer.encrypted) {
    notify(
      viewer,
      "This PDF is encrypted — you can view and fill it, but saving is disabled.",
      "info",
    );
  }
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

/**
 * Continuous (pinch / Ctrl+wheel) zoom to `next`, keeping the document point at
 * (clientX, clientY) fixed. The pages scroll on the document scroller; after
 * rescaling by factor `f`, the position under that point must end up back there,
 * so the new scroll offset is `(scroll + client) * f - client` on each axis.
 */
async function zoomTo(
  viewer: Viewer,
  next: number,
  clientX: number,
  clientY: number,
): Promise<void> {
  if (next === viewer.scale) {
    return;
  }
  const factor = next / viewer.scale;
  const scroller = document.scrollingElement ?? document.documentElement;
  const left = (scroller.scrollLeft + clientX) * factor - clientX;
  const top = (scroller.scrollTop + clientY) * factor - clientY;
  await setScale(viewer, next);
  scroller.scrollTo({ left, top });
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
    notify(viewer, "Click on the page to place a text box. Press Esc to cancel.", "info");
  }
}

/** Arm or disarm signature placement; a non-null image means a click places it. */
function setStampTool(viewer: Viewer, image: StampImage | null): void {
  viewer.pendingStamp = image;
  viewer.mount.classList.toggle("tool-stamp", image !== null);
  document
    .querySelector<HTMLButtonElement>("#sign-tool")
    ?.setAttribute("aria-pressed", String(image !== null));
  if (image !== null) {
    notify(viewer, "Click on the page to place your signature. Press Esc to cancel.", "info");
  }
}

/** True while a create tool (text or signature) is armed. */
function toolArmed(viewer: Viewer): boolean {
  return viewer.textTool || viewer.pendingStamp !== null;
}

/** Cancel any armed create tool and clear its hint. */
function cancelTools(viewer: Viewer): void {
  setTextTool(viewer, false);
  setStampTool(viewer, null);
  viewer.toasts?.clear();
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
    notify(viewer, `Could not import that image: ${String(error)}`, "error");
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
  if (!viewer.model || blockedByEncryption(viewer)) {
    return;
  }
  const bytes = await projectBytes(viewer.model, { flatten: true });
  const path = await invoke<string | null>("save_pdf_as", { bytes: Array.from(bytes) });
  if (!path) {
    return; // user cancelled
  }
  notify(viewer, "Exported a flattened copy.", "success");
}

/**
 * Open already-read PDF bytes: refuse XFA, prompt for a password if needed, then
 * make it the current document. Shared by the Open dialog and drag-and-drop, so
 * both entry points behave identically.
 */
async function openBytes(viewer: Viewer, bytes: Uint8Array, path: string | null): Promise<void> {
  if (await hasXfa(bytes)) {
    notify(
      viewer,
      "This PDF uses an XFA form, which SignetPDF can't edit. It was not opened.",
      "error",
    );
    return;
  }
  const doc = await openWithPassword(
    (password) => openPdfDocument(bytes, password),
    askPasswordDialog,
  );
  if (!doc) {
    return; // cancelled at the password prompt
  }
  showLoading(viewer, true);
  try {
    await setDocument(viewer, doc, bytes, path);
  } finally {
    showLoading(viewer, false);
  }
}

async function openUserPdf(viewer: Viewer): Promise<void> {
  if (!mayDiscard(viewer)) {
    return;
  }
  const opened = await invoke<OpenedPdf | null>("open_pdf");
  if (!opened) {
    return; // user cancelled the dialog
  }
  await openBytes(viewer, new Uint8Array(opened.bytes), opened.path);
}

/**
 * Collect a PDF password through the in-app dialog (window.prompt is unsupported
 * in the Tauri webview). Resolves to the entered password, or null if cancelled.
 */
function askPasswordDialog(incorrect: boolean): Promise<string | null> {
  const dialog = document.querySelector<HTMLDialogElement>("#password-dialog");
  const input = document.querySelector<HTMLInputElement>("#password-input");
  const message = document.querySelector<HTMLElement>("#password-message");
  if (!dialog || !input) {
    return Promise.resolve(null);
  }
  input.value = "";
  if (message) {
    message.textContent = incorrect
      ? "Incorrect password. Try again."
      : "This PDF is password-protected. Enter its password to open it.";
  }
  return new Promise((resolve) => {
    const onClose = (): void => {
      dialog.removeEventListener("close", onClose);
      // The OK button submits with value "ok"; Cancel and Esc leave it otherwise.
      resolve(dialog.returnValue === "ok" ? input.value : null);
    };
    dialog.addEventListener("close", onClose);
    dialog.showModal();
    input.focus();
  });
}

/** True (with a status message) when saving is blocked because the doc is encrypted. */
function blockedByEncryption(viewer: Viewer): boolean {
  if (viewer.encrypted) {
    notify(
      viewer,
      "Saving is disabled for encrypted PDFs. Remove the password and reopen to edit.",
      "error",
    );
    return true;
  }
  return false;
}

async function save(viewer: Viewer): Promise<void> {
  if (!viewer.model || blockedByEncryption(viewer)) {
    return;
  }
  if (!viewer.path) {
    await saveAs(viewer);
    return;
  }
  const bytes = await projectBytes(viewer.model);
  await invoke("save_pdf", { path: viewer.path, bytes: Array.from(bytes) });
  markViewerSaved(viewer);
  updateSaveDirty(viewer);
  notify(viewer, "Saved.", "success");
}

async function saveAs(viewer: Viewer): Promise<void> {
  if (!viewer.model || blockedByEncryption(viewer)) {
    return;
  }
  const bytes = await projectBytes(viewer.model);
  const path = await invoke<string | null>("save_pdf_as", { bytes: Array.from(bytes) });
  if (!path) {
    return; // user cancelled the dialog
  }
  viewer.path = path;
  markViewerSaved(viewer);
  updateSaveDirty(viewer);
  notify(viewer, "Saved.", "success");
}

window.addEventListener("DOMContentLoaded", () => {
  const mount = document.querySelector<HTMLElement>("#viewer");
  if (!mount) {
    return;
  }

  // Build the floating dock before reading its controls, then mount it so it
  // floats above the document (and the empty-state screen) on the bottom edge.
  const platform = detectPlatform(navigator.userAgent);
  const dock = buildDock(platform);
  document.body.append(dock);

  const toastHost = document.querySelector<HTMLElement>("#toasts");

  const viewer: Viewer = {
    mount,
    toasts: toastHost ? createToasts(toastHost) : null,
    emptyState: document.querySelector<HTMLElement>("#empty-state"),
    dock,
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
    encrypted: false,
    observer: null,
    pageObserver: null,
    pageRatios: new Map(),
    textLayers: new Map(),
  };

  // No document yet: show the empty-state screen, hide the dock and viewer.
  const emptyMark = document.querySelector<HTMLElement>("#empty-mark");
  if (emptyMark) {
    emptyMark.innerHTML = icon("document");
  }
  showDocumentChrome(viewer, false);

  const run = (action: () => Promise<void>, what: string): void => {
    viewer.toasts?.clear();
    action().catch((error: unknown) => {
      notify(viewer, `Could not ${what}: ${String(error)}`, "error");
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
  on("#zoom-in", () => setScale(viewer, stepZoom(viewer.scale, "in")), "zoom");
  on("#zoom-out", () => setScale(viewer, stepZoom(viewer.scale, "out")), "zoom");
  on("#zoom-fit", () => fitWidth(viewer), "fit to width");

  // The zoom readout doubles as a reset-to-100% control.
  document
    .querySelector<HTMLElement>("#zoom-level")
    ?.addEventListener("click", () => run(() => setScale(viewer, 1), "zoom"));

  // Continuous zoom (pinch / Ctrl+wheel). Re-rasterising every frame can't keep
  // up — a pdf.js page raster is far slower than a frame — so during a gesture we
  // only apply a cheap GPU transform to the page column (instant, smooth) and
  // re-render once, crisply, when the gesture settles. The anchor point that
  // stays put under the cursor is fixed for the whole session.
  const zoom = { active: false, base: 1, target: 1, x: 0, y: 0 };
  let zoomCommitTimer: ReturnType<typeof setTimeout> | undefined;

  const previewZoom = (scale: number): void => {
    zoom.target = clampScale(scale);
    viewer.mount.style.transform = `scale(${zoom.target / zoom.base})`;
    if (viewer.zoomLabel) {
      viewer.zoomLabel.textContent = `${Math.round(zoom.target * 100)}%`;
    }
  };

  const beginZoom = (clientX: number, clientY: number): void => {
    if (zoom.active) {
      return;
    }
    zoom.active = true;
    zoom.base = viewer.scale;
    zoom.target = viewer.scale;
    zoom.x = clientX;
    zoom.y = clientY;
    const rect = viewer.mount.getBoundingClientRect();
    viewer.mount.style.transformOrigin = `${clientX - rect.left}px ${clientY - rect.top}px`;
  };

  const commitZoom = (): void => {
    if (!zoom.active) {
      return;
    }
    zoom.active = false;
    viewer.mount.style.transform = "";
    viewer.mount.style.transformOrigin = "";
    zoomTo(viewer, zoom.target, zoom.x, zoom.y).catch((error: unknown) => {
      notify(viewer, `Could not zoom: ${String(error)}`, "error");
    });
  };

  // Ctrl+wheel (Chromium webviews, or a Ctrl-held mouse wheel) has no end event,
  // so commit shortly after the last tick.
  viewer.mount.addEventListener(
    "wheel",
    (event) => {
      if (!event.ctrlKey || !viewer.doc) {
        return;
      }
      event.preventDefault();
      beginZoom(event.clientX, event.clientY);
      previewZoom(zoomByDelta(zoom.target, event.deltaY));
      clearTimeout(zoomCommitTimer);
      zoomCommitTimer = setTimeout(commitZoom, 140);
    },
    { passive: false },
  );

  // WebKit gesture events (macOS WKWebView): a trackpad pinch reports a
  // cumulative `scale` and ends explicitly with gestureend.
  window.addEventListener("gesturestart", (event) => {
    if (!viewer.doc) {
      return;
    }
    event.preventDefault();
    const gesture = event as GestureZoomEvent;
    beginZoom(gesture.clientX, gesture.clientY);
  });
  window.addEventListener("gesturechange", (event) => {
    if (!viewer.doc || !zoom.active) {
      return;
    }
    event.preventDefault();
    previewZoom(zoom.base * (event as GestureZoomEvent).scale);
  });
  window.addEventListener("gestureend", (event) => {
    if (!zoom.active) {
      return;
    }
    event.preventDefault();
    commitZoom();
  });
  on("#undo", () => stepHistory(viewer, "undo"), "undo");
  on("#redo", () => stepHistory(viewer, "redo"), "redo");

  viewer.textToolButton?.addEventListener("click", () => {
    setTextTool(viewer, !viewer.textTool);
  });

  document.querySelector<HTMLButtonElement>("#sign-tool")?.addEventListener("click", () => {
    openSignatureDialog(viewer);
  });

  // The empty-state screen offers the same Open action as the dock.
  document
    .querySelector<HTMLButtonElement>("#empty-open")
    ?.addEventListener("click", () => run(() => openUserPdf(viewer), "open that PDF"));

  setupOverflowMenu();

  // Drag-and-drop: the drop is handled in Rust (read + path grant), which emits
  // the bytes here. Open through the same pipeline as the dialog.
  void listen("pdf-drag-over", (event) => {
    document.body.classList.toggle("drag-over", event.payload === true);
  });
  void listen<OpenedPdf>("pdf-dropped", (event) => {
    document.body.classList.remove("drag-over");
    if (!mayDiscard(viewer)) {
      return;
    }
    run(
      () => openBytes(viewer, new Uint8Array(event.payload.bytes), event.payload.path),
      "open that PDF",
    );
  });
  void listen<string>("pdf-drop-error", (event) => {
    document.body.classList.remove("drag-over");
    notify(viewer, event.payload, "error");
  });

  // Keyboard shortcuts, resolved per platform (Cmd on macOS, Ctrl elsewhere).
  window.addEventListener("keydown", (event) => {
    // Esc cancels an armed create tool before anything else.
    if (event.key === "Escape" && toolArmed(viewer)) {
      event.preventDefault();
      cancelTools(viewer);
      return;
    }
    const action = matchShortcut(event, platform);
    if (!action) {
      return;
    }
    event.preventDefault();
    switch (action) {
      case "open":
        run(() => openUserPdf(viewer), "open that PDF");
        return;
      case "save":
        run(() => save(viewer), "save the PDF");
        return;
      case "save-as":
        run(() => saveAs(viewer), "save the PDF");
        return;
      case "undo":
        run(() => stepHistory(viewer, "undo"), "undo");
        return;
      case "redo":
        run(() => stepHistory(viewer, "redo"), "redo");
        return;
      case "zoom-in":
        run(() => setScale(viewer, stepZoom(viewer.scale, "in")), "zoom");
        return;
      case "zoom-out":
        run(() => setScale(viewer, stepZoom(viewer.scale, "out")), "zoom");
        return;
      case "zoom-reset":
        run(() => setScale(viewer, 1), "zoom");
        return;
    }
  });

  // Warn before leaving with unsaved changes.
  window.addEventListener("beforeunload", (event) => {
    if (viewer.model?.dirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
});
