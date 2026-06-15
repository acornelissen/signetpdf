// SignetPDF frontend entry point.
// Configures the pdf.js worker, renders a bundled fixture on startup, and lets
// the user open a PDF (Rust open_pdf), scroll/zoom it, and save it back (Rust
// save_pdf / save_pdf_as). The DocumentModel is the source of truth for saving
// and the dirty flag; failures surface in a status line.
import "./pdf/worker";
import fixtureUrl from "../fixtures/two-page.pdf?url";
import { invoke } from "@tauri-apps/api/core";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  createModel,
  markSaved,
  setFieldValue,
  withPages,
  type DocumentModel,
} from "./model/document";
import { listFormFields, type FormField } from "./forms/fields";
import { applyFieldValue, bindFieldControl, buildFieldControl } from "./forms/overlay";
import { hasXfa } from "./forms/xfa";
import { loadPdfDocument } from "./pdf/document";
import { capturePageGeometry } from "./pdf/geometry";
import { renderAllPages } from "./pdf/render";
import { saveModel } from "./save/save";
import { clampScale, fitToWidthScale, ZOOM_STEP } from "./pdf/zoom";

interface OpenedPdf {
  path: string;
  bytes: number[];
}

interface Viewer {
  mount: HTMLElement;
  status: HTMLElement | null;
  zoomLabel: HTMLElement | null;
  doc: PDFDocumentProxy | null;
  model: DocumentModel | null;
  fields: FormField[];
  path: string | null;
  scale: number;
}

function setStatus(viewer: Viewer, message: string): void {
  if (viewer.status) {
    viewer.status.textContent = message;
  }
}

async function rerender(viewer: Viewer): Promise<void> {
  if (viewer.zoomLabel) {
    viewer.zoomLabel.textContent = `${Math.round(viewer.scale * 100)}%`;
  }
  if (!viewer.doc || !viewer.model) {
    return;
  }
  const viewport = { scale: viewer.scale };
  const rendered = await renderAllPages(viewer.doc, viewer.mount, viewer.scale);
  // Re-place form controls over each freshly rendered page.
  for (const page of rendered) {
    const geometry = viewer.model.pages[page.index];
    if (!geometry) {
      continue;
    }
    for (const field of viewer.fields) {
      if (field.page !== page.index) {
        continue;
      }
      const control = buildFieldControl(field, geometry, viewport);
      if (!control) {
        continue;
      }
      // Show the user's edit if there is one, otherwise the PDF's existing value.
      const edited = viewer.model.fieldValues.find((f) => f.fieldName === field.name)?.value;
      applyFieldValue(control, field.kind, edited ?? field.value);
      bindFieldControl(control, field, (name, value) => {
        if (viewer.model) {
          viewer.model = setFieldValue(viewer.model, name, value);
        }
      });
      page.overlay.appendChild(control);
    }
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
  const bytes = await saveModel(viewer.model);
  await invoke("save_pdf", { path: viewer.path, bytes: Array.from(bytes) });
  viewer.model = markSaved(viewer.model);
  setStatus(viewer, "Saved.");
}

async function saveAs(viewer: Viewer): Promise<void> {
  if (!viewer.model) {
    return;
  }
  const bytes = await saveModel(viewer.model);
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
    doc: null,
    model: null,
    fields: [],
    path: null,
    scale: 1.25,
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

  // Warn before leaving with unsaved changes.
  window.addEventListener("beforeunload", (event) => {
    if (viewer.model?.dirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  run(() => showBundledFixture(viewer), "render the bundled PDF");
});
