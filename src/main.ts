// SignetPDF frontend entry point.
// Configures the pdf.js worker, shows an empty-state screen until the user opens
// a PDF (Rust open_pdf, or drag-and-drop), then lets them scroll/zoom it and
// save it back (Rust save_pdf / save_pdf_as). The DocumentModel is the source of
// truth for saving and the dirty flag; status and failures surface as toasts.
import "./pdf/worker";
import sansRegularUrl from "./assets/fonts/NotoSans-Regular.ttf?url";
import sansBoldUrl from "./assets/fonts/NotoSans-Bold.ttf?url";
import sansItalicUrl from "./assets/fonts/NotoSans-Italic.ttf?url";
import sansBoldItalicUrl from "./assets/fonts/NotoSans-BoldItalic.ttf?url";
import serifRegularUrl from "./assets/fonts/NotoSerif-Regular.ttf?url";
import serifBoldUrl from "./assets/fonts/NotoSerif-Bold.ttf?url";
import serifItalicUrl from "./assets/fonts/NotoSerif-Italic.ttf?url";
import serifBoldItalicUrl from "./assets/fonts/NotoSerif-BoldItalic.ttf?url";
import monoRegularUrl from "./assets/fonts/NotoSansMono-Regular.ttf?url";
import monoBoldUrl from "./assets/fonts/NotoSansMono-Bold.ttf?url";
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
import { screenPoint, type ScreenPoint } from "./model/geometry";
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
import {
  buildMenuItems,
  classifyContextTarget,
  closeContextMenu,
  openContextMenu,
  type ContextTarget,
  type MenuActionKey,
} from "./app/contextmenu";
import {
  buildDock,
  DEFAULT_INK_COLOR,
  DEFAULT_MARKUP_COLOR,
  DEFAULT_SHAPE_COLOR,
  DEFAULT_SHAPE_FILL,
} from "./app/dock";
import { markupSelection, type MarkupTargetPage } from "./annotations/markup";
import type { Ink, MarkupStyle, Shape, ShapeKind } from "./model/document";
import { screenToModel } from "./model/coords";
import { icon, type IconName } from "./app/icons";
import { createToasts, type Toasts, type ToastVariant } from "./app/toast";
import { createTextBoxAt } from "./annotations/text";
import { createSignatureStampAt, type StampImage } from "./sign/stamp";
import {
  bindStampDelete,
  bindStampDrag,
  bindStampKeyboard,
  bindStampScale,
  buildStampControl,
} from "./sign/overlay";
import { createSignaturePad, type SignaturePad } from "./sign/pad";
import {
  deleteSignature,
  listSignatures,
  renameSignature,
  saveSignature,
  setDefaultSignature,
  type SavedSignature,
} from "./sign/store";
import { buildSavedSignatureCard, type SavedSignatureActions } from "./sign/manager";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { importImageAsStamp } from "./sign/image";
import {
  applyTextBoxStyle,
  bindTextBoxControl,
  bindTextBoxDelete,
  bindTextBoxDrag,
  bindTextBoxKeyboard,
  bindTextBoxResize,
  buildTextBoxControl,
  textBoxInput,
} from "./annotations/overlay";
import { bindMarkupDelete, buildMarkupControl } from "./annotations/markupOverlay";
import {
  bindNoteControl,
  bindNoteDelete,
  bindNoteDrag,
  bindNoteKeyboard,
  buildNoteControl,
} from "./annotations/noteOverlay";
import { createNoteAt } from "./annotations/note";
import {
  bindShapeDelete,
  bindShapeDrag,
  bindShapeKeyboard,
  bindShapeResize,
  buildShapeControl,
} from "./annotations/shapeOverlay";
import { createShapeFromDrag } from "./annotations/shape";
import { bindInkDelete, buildInkControl } from "./annotations/inkOverlay";
import { createInkFromPath } from "./annotations/ink";
import { attachTextToolbar } from "./annotations/toolbar";
import type { SnapBox } from "./annotations/transform";
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
  extractPageText,
  renderPageTextLayer,
  renderPageToCanvas,
  type RenderedPage,
} from "./pdf/render";
import { findMatches, matchRanges, type SearchMatch } from "./pdf/search";
import type { TextLayer } from "pdfjs-dist/legacy/build/pdf.mjs";
import "./pdf/textlayer.css";
import "./pdf/textlayer.overrides.css"; // must load after textlayer.css to win
import { isEncryptedPdf, saveModel, type SaveOptions } from "./save/save";
import type { TextFontFamilies } from "./save/font";
import { clampScale, fitToWidthScale, stepZoom, zoomByDelta } from "./pdf/zoom";

// The text fonts (sans/serif/mono, each with weight/style variants) are bundled
// assets fetched from 'self' (CSP-safe) and cached: only needed when the model
// has text annotations to draw on save. Shaped as SaveOptions.fonts.
let fontFamiliesCache: TextFontFamilies | null = null;
async function loadFontFamilies(): Promise<TextFontFamilies> {
  if (!fontFamiliesCache) {
    const fetchBytes = async (url: string): Promise<Uint8Array> =>
      new Uint8Array(await (await fetch(url)).arrayBuffer());
    const [sansR, sansB, sansI, sansBI, serifR, serifB, serifI, serifBI, monoR, monoB] =
      await Promise.all(
        [
          sansRegularUrl,
          sansBoldUrl,
          sansItalicUrl,
          sansBoldItalicUrl,
          serifRegularUrl,
          serifBoldUrl,
          serifItalicUrl,
          serifBoldItalicUrl,
          monoRegularUrl,
          monoBoldUrl,
        ].map(fetchBytes),
      );
    fontFamiliesCache = {
      sans: { regular: sansR!, bold: sansB!, italic: sansI!, boldItalic: sansBI! },
      serif: { regular: serifR!, bold: serifB!, italic: serifI!, boldItalic: serifBI! },
      mono: { regular: monoR!, bold: monoB! }, // mono has no italic; it falls back
    };
  }
  return fontFamiliesCache;
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
  // When the note tool is armed, clicking a page drops a sticky note.
  noteTool: boolean;
  // The shape kind the draw tool is armed with (null = not drawing).
  shapeTool: ShapeKind | null;
  // Stroke colour and width for newly drawn shapes; fill is off by default.
  shapeStroke: string;
  shapeStrokeWidth: number;
  shapeFill: string | null; // active fill (null = no fill)
  shapeFillColor: string; // remembered fill colour, restored when fill is on
  // When the ink tool is armed, dragging on a page draws a freehand stroke.
  inkTool: boolean;
  inkColor: string;
  inkStrokeWidth: number;
  // When a signature is armed, clicking a page places it as a stamp.
  pendingStamp: StampImage | null;
  // The colour the next markup (highlight/underline/strikethrough) is drawn in.
  markupColor: string;
  // The most recent non-empty text selection, captured so a dock-button click
  // can mark it up even after the click moves focus (WKWebView clears the live
  // selection when focus shifts during a mouse event).
  markupRange: Range | null;
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
  // The current page placeholders, so search can find a page's text layer.
  pages: RenderedPage[];
  // Find-in-document state for the current model.
  search: SearchState;
  // Bumped per search; a search applies its results only if still current, so a
  // slow first query can't repaint stale matches over a newer one (race guard).
  searchSeq: number;
}

interface SearchState {
  query: string;
  // Per-page text, extracted lazily on the first search of a document, with the
  // in-flight extraction shared so concurrent searches don't each re-extract.
  index: string[] | null;
  indexPromise: Promise<string[]> | null;
  matches: SearchMatch[];
  current: number; // index into matches, -1 when none
}

function emptySearch(): SearchState {
  return { query: "", index: null, indexPromise: null, matches: [], current: -1 };
}

/** Apply a model edit and record it for undo. The model is the present snapshot. */
function applyEdit(viewer: Viewer, next: DocumentModel): void {
  viewer.model = next;
  viewer.history = viewer.history ? record(viewer.history, next) : createHistory(next);
  // Every commit routes through here, including those that don't re-render
  // (text typing, keyboard nudge, toolbar changes, form fields), so refresh the
  // dirty badge and undo/redo state here rather than at each call site.
  updateHistoryButtons(viewer);
  updateSaveDirty(viewer);
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
 * Wire the markup tools: the three style buttons mark up the current selection,
 * and the colour swatch opens a native colour picker. A document `selectionchange`
 * listener captures the last non-empty selection so a button click can still mark
 * it up after the click moves focus (WKWebView clears the live selection when
 * focus shifts during a mouse event). The buttons cancel the focus shift on
 * pointer-down so the visible selection stays painted while they apply on click.
 */
function setupMarkupTools(viewer: Viewer): void {
  const styles: ReadonlyArray<{ id: string; style: MarkupStyle }> = [
    { id: "#markup-highlight", style: "highlight" },
    { id: "#markup-underline", style: "underline" },
    { id: "#markup-strikethrough", style: "strikethrough" },
  ];
  for (const { id, style } of styles) {
    const button = document.querySelector<HTMLButtonElement>(id);
    button?.addEventListener("pointerdown", (event) => event.preventDefault());
    button?.addEventListener("click", () => applyMarkup(viewer, style));
  }

  const swatch = document.querySelector<HTMLButtonElement>("#markup-color");
  const colorInput = document.querySelector<HTMLInputElement>("#markup-color-input");
  swatch?.addEventListener("click", () => colorInput?.click());
  colorInput?.addEventListener("input", () => {
    if (!colorInput.value) {
      return;
    }
    viewer.markupColor = colorInput.value;
    swatch?.style.setProperty("--markup-color", colorInput.value);
  });

  document.addEventListener("selectionchange", () => {
    const selection = window.getSelection();
    if (
      !selection ||
      selection.isCollapsed ||
      selection.rangeCount === 0 ||
      selection.toString().trim() === ""
    ) {
      return; // keep the last non-empty range; a button click collapses it
    }
    const range = selection.getRangeAt(0);
    if (viewer.mount.contains(range.commonAncestorContainer)) {
      viewer.markupRange = range.cloneRange();
    }
  });
}

/**
 * Wire the shape tools: each kind button toggles the draw tool for that shape,
 * and the colour swatch opens a native picker that sets the stroke colour for
 * newly drawn shapes.
 */
function setupShapeTools(viewer: Viewer): void {
  const kinds: ReadonlyArray<{ id: string; kind: ShapeKind }> = [
    { id: "#shape-rectangle", kind: "rectangle" },
    { id: "#shape-ellipse", kind: "ellipse" },
    { id: "#shape-line", kind: "line" },
    { id: "#shape-arrow", kind: "arrow" },
  ];
  for (const { id, kind } of kinds) {
    document
      .querySelector<HTMLButtonElement>(id)
      ?.addEventListener("click", () =>
        setShapeTool(viewer, viewer.shapeTool === kind ? null : kind),
      );
  }

  const swatch = document.querySelector<HTMLButtonElement>("#shape-color");
  const colorInput = document.querySelector<HTMLInputElement>("#shape-color-input");
  swatch?.addEventListener("click", () => colorInput?.click());
  colorInput?.addEventListener("input", () => {
    if (!colorInput.value) {
      return;
    }
    viewer.shapeStroke = colorInput.value;
    swatch?.style.setProperty("--markup-color", colorInput.value);
  });

  // Optional fill: the toggle turns fill on/off; the swatch chooses (and enables)
  // the fill colour. viewer.shapeFill is the active fill, null when off.
  const fillToggle = document.querySelector<HTMLButtonElement>("#shape-fill");
  const fillSwatch = document.querySelector<HTMLButtonElement>("#shape-fill-color");
  const fillInput = document.querySelector<HTMLInputElement>("#shape-fill-color-input");
  const reflectFill = (on: boolean): void => {
    viewer.shapeFill = on ? viewer.shapeFillColor : null;
    fillToggle?.setAttribute("aria-pressed", String(on));
  };
  fillToggle?.addEventListener("click", () =>
    reflectFill(fillToggle.getAttribute("aria-pressed") !== "true"),
  );
  fillSwatch?.addEventListener("click", () => fillInput?.click());
  fillInput?.addEventListener("input", () => {
    if (!fillInput.value) {
      return;
    }
    viewer.shapeFillColor = fillInput.value;
    fillSwatch?.style.setProperty("--markup-color", fillInput.value);
    reflectFill(true); // choosing a fill colour turns fill on
  });
}

/**
 * Wire the ink tool: the pen button toggles the freehand draw tool, and the
 * colour swatch opens a native picker that sets the colour for new strokes.
 */
function setupInkTools(viewer: Viewer): void {
  document
    .querySelector<HTMLButtonElement>("#ink-tool")
    ?.addEventListener("click", () => setInkTool(viewer, !viewer.inkTool));

  const swatch = document.querySelector<HTMLButtonElement>("#ink-color");
  const colorInput = document.querySelector<HTMLInputElement>("#ink-color-input");
  swatch?.addEventListener("click", () => colorInput?.click());
  colorInput?.addEventListener("input", () => {
    if (!colorInput.value) {
      return;
    }
    viewer.inkColor = colorInput.value;
    swatch?.style.setProperty("--markup-color", colorInput.value);
  });
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

/** Wire the find bar: icons, query input, next/prev, and close. */
function setupSearchBar(
  viewer: Viewer,
  run: (action: () => Promise<void>, what: string) => void,
): void {
  const setIcon = (id: string, name: IconName): void => {
    const element = document.querySelector<HTMLElement>(id);
    if (element) {
      element.innerHTML = icon(name);
    }
  };
  setIcon("#search-icon", "search");
  setIcon("#search-prev", "chevron-up");
  setIcon("#search-next", "chevron-down");
  setIcon("#search-close", "dismiss");

  const input = document.querySelector<HTMLInputElement>("#search-input");
  input?.addEventListener("input", () => run(() => runSearch(viewer, input.value), "search"));
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      stepSearch(viewer, event.shiftKey ? -1 : 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation(); // close find rather than cancelling a tool
      closeSearch(viewer);
    }
  });
  document.querySelector("#search-prev")?.addEventListener("click", () => stepSearch(viewer, -1));
  document.querySelector("#search-next")?.addEventListener("click", () => stepSearch(viewer, 1));
  document.querySelector("#search-close")?.addEventListener("click", () => closeSearch(viewer));
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

// ---- Find in document -----------------------------------------------------

const HAS_HIGHLIGHTS = typeof CSS !== "undefined" && "highlights" in CSS;

/** The text spans of a rendered page's text layer, with their text. */
function pageSpans(page: RenderedPage): { spans: HTMLElement[]; texts: string[] } {
  const spans = [...page.text.querySelectorAll<HTMLElement>("span")];
  return { spans, texts: spans.map((span) => span.textContent ?? "") };
}

/** How many matches precede the current one on its own page (its page ordinal). */
function currentOrdinal(viewer: Viewer, page: number): number {
  const cur = viewer.search.matches[viewer.search.current];
  if (!cur || cur.page !== page) {
    return -1;
  }
  return viewer.search.matches.filter((m) => m.page === page && m.start < cur.start).length;
}

/** Build the per-page text index once for the current document, sharing the
 * in-flight extraction so overlapping searches don't each rebuild it. */
async function ensureSearchIndex(viewer: Viewer): Promise<string[]> {
  if (viewer.search.index) {
    return viewer.search.index;
  }
  if (viewer.search.indexPromise) {
    return viewer.search.indexPromise;
  }
  const doc = viewer.doc;
  if (!doc) {
    return [];
  }
  const build = (async (): Promise<string[]> => {
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      pages.push(await extractPageText(doc, i));
    }
    viewer.search.index = pages;
    return pages;
  })();
  viewer.search.indexPromise = build;
  return build;
}

function updateSearchCount(viewer: Viewer): void {
  const count = document.querySelector<HTMLElement>("#search-count");
  if (!count) {
    return;
  }
  const { matches, current, query } = viewer.search;
  if (query.trim() === "") {
    count.textContent = "";
  } else if (matches.length === 0) {
    count.textContent = "No results";
  } else {
    count.textContent = `${current + 1} of ${matches.length}`;
  }
}

/** Redraw the match highlights over the live (rendered) pages. */
function refreshSearchHighlights(viewer: Viewer): void {
  if (!HAS_HIGHLIGHTS) {
    return;
  }
  CSS.highlights.delete("search-match");
  CSS.highlights.delete("search-current");
  const { query, matches } = viewer.search;
  if (query.trim() !== "" && matches.length > 0) {
    const all = new Highlight();
    const active = new Highlight();
    for (const page of viewer.pages) {
      if (!viewer.textLayers.has(page.index)) {
        continue; // only rendered pages have spans to range over
      }
      const { spans, texts } = pageSpans(page);
      const ordinal = currentOrdinal(viewer, page.index);
      matchRanges(texts, query).forEach((item, i) => {
        const startNode = spans[item.startItem]?.firstChild;
        const endNode = spans[item.endItem]?.firstChild;
        if (!startNode || !endNode) {
          return;
        }
        const range = document.createRange();
        try {
          range.setStart(startNode, item.startOffset);
          range.setEnd(endNode, item.endOffset);
        } catch {
          return;
        }
        (i === ordinal ? active : all).add(range);
      });
    }
    CSS.highlights.set("search-match", all);
    CSS.highlights.set("search-current", active);
  }
  repaintTextLayers(viewer);
}

/**
 * Force WKWebView to repaint the live text layers after the highlight registry
 * changed. WebKit's WKWebView keeps already-painted ::highlight() pseudos on
 * screen after their CSS.highlights entry is deleted or shrunk — the registry
 * is empty but the stale paint remains. Chromium and Playwright's WebKit both
 * invalidate correctly, so only the real macOS/iOS webview needs this nudge.
 * Toggling display off and on (with a forced reflow between) drops each text
 * layer from the render tree and rebuilds it, repainting from the now-current
 * registry. The layer is absolutely positioned inside a fixed-size page
 * container, so hiding it shifts no layout; the toggle is synchronous, so no
 * intermediate frame paints and nothing flickers.
 */
function repaintTextLayers(viewer: Viewer): void {
  for (const page of viewer.pages) {
    if (!viewer.textLayers.has(page.index)) {
      continue;
    }
    const { style } = page.text;
    style.display = "none";
    void page.text.offsetHeight; // force reflow so the restore paints fresh
    style.display = "";
  }
}

/** Bring the current match into view, scrolling its page in if needed. */
function scrollToCurrentMatch(viewer: Viewer): void {
  const cur = viewer.search.matches[viewer.search.current];
  const page = cur ? viewer.pages[cur.page] : undefined;
  if (!cur || !page) {
    return;
  }
  let target: Element = page.container;
  if (viewer.textLayers.has(cur.page)) {
    const { spans, texts } = pageSpans(page);
    const ordinal = currentOrdinal(viewer, cur.page);
    const span = spans[matchRanges(texts, viewer.search.query)[ordinal]?.startItem ?? -1];
    target = span ?? page.container;
  }
  target.scrollIntoView({ block: "center", behavior: "smooth" });
}

/** Run a query: build the index, find matches, highlight and jump to the first. */
async function runSearch(viewer: Viewer, query: string): Promise<void> {
  viewer.search.query = query;
  const seq = ++viewer.searchSeq;
  if (query.trim() === "") {
    viewer.search.matches = [];
    viewer.search.current = -1;
    updateSearchCount(viewer);
    refreshSearchHighlights(viewer);
    return;
  }
  // Only the first search of a document pays for extracting the page text.
  const building = viewer.search.index === null;
  if (building) {
    showLoading(viewer, true);
  }
  let index: string[];
  try {
    index = await ensureSearchIndex(viewer);
  } finally {
    if (building) {
      showLoading(viewer, false);
    }
  }
  // A newer query started while extracting; let it own the result.
  if (seq !== viewer.searchSeq) {
    return;
  }
  viewer.search.matches = findMatches(index, query);
  viewer.search.current = viewer.search.matches.length > 0 ? 0 : -1;
  updateSearchCount(viewer);
  refreshSearchHighlights(viewer);
  scrollToCurrentMatch(viewer);
}

/** Move to the next/previous match (wrapping). */
function stepSearch(viewer: Viewer, direction: 1 | -1): void {
  const total = viewer.search.matches.length;
  if (total === 0) {
    return;
  }
  viewer.search.current = (viewer.search.current + direction + total) % total;
  updateSearchCount(viewer);
  scrollToCurrentMatch(viewer);
  refreshSearchHighlights(viewer);
}

function openSearch(viewer: Viewer): void {
  const bar = document.querySelector<HTMLElement>("#search-bar");
  const input = document.querySelector<HTMLInputElement>("#search-input");
  if (!bar || !input || !viewer.doc) {
    return;
  }
  bar.hidden = false;
  input.focus();
  input.select();
}

function closeSearch(viewer: Viewer): void {
  const bar = document.querySelector<HTMLElement>("#search-bar");
  if (bar) {
    bar.hidden = true;
  }
  viewer.search = { ...viewer.search, query: "", matches: [], current: -1 };
  updateSearchCount(viewer);
  refreshSearchHighlights(viewer);
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
      }
    });
    page.overlay.appendChild(control);
  }
}

/** An annotation's id paired with its user-space box, for snap-sibling lookup. */
interface PageBox {
  readonly id: string;
  readonly box: SnapBox;
}

/**
 * Every annotation's box on a page, built once per layout so each box's snap
 * siblings can be derived by excluding itself — instead of re-walking the whole
 * model for every annotation on the page.
 */
function pageAnnotationBoxes(viewer: Viewer, pageIndex: number): PageBox[] {
  return (viewer.model?.annotations ?? [])
    .filter(
      (a): a is TextBox | SignatureStamp =>
        a.page === pageIndex && (a.kind === "text" || a.kind === "signature"),
    )
    .map((a) => ({
      id: a.id,
      box: { x: a.origin.x, y: a.origin.y, width: a.width, height: a.height },
    }));
}

/** Snap siblings for one box: every box on the page except the box itself. */
function siblingsExcept(pageBoxes: readonly PageBox[], selfId: string): SnapBox[] {
  return pageBoxes.filter((b) => b.id !== selfId).map((b) => b.box);
}

/** Remove an annotation from the model and re-render; shared by text and stamps. */
function deleteAnnotation(viewer: Viewer, id: string): void {
  if (viewer.model) {
    applyEdit(viewer, removeAnnotation(viewer.model, id));
    void rerender(viewer);
  }
}

/** Place the editable text-box controls for one page, bound back to the model. */
function placeTextBoxes(viewer: Viewer, page: RenderedPage, geometry: PageGeometry): void {
  const viewport = { scale: viewer.scale };
  const pageBoxes = pageAnnotationBoxes(viewer, page.index);
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
    control.dataset.annotationId = annotation.id;
    control.dataset.annotationKind = "text";
    bindTextBoxControl(control, annotation, commit);
    const commitAndRerender = (updated: TextBox): void => {
      commit(updated);
      void rerender(viewer);
    };
    const siblings = siblingsExcept(pageBoxes, annotation.id);
    bindTextBoxDrag(control, annotation, geometry, viewport, commitAndRerender, siblings);
    bindTextBoxResize(control, annotation, geometry, viewport, commitAndRerender, siblings);
    // Keyboard nudge repositions the control live and commits without a
    // re-render, so the box keeps focus between keystrokes.
    bindTextBoxKeyboard(control, annotation, geometry, viewport, commit);
    bindTextBoxDelete(control, annotation, (id) => deleteAnnotation(viewer, id));
    // Formatting toolbar (shown via :focus-within). Changes apply to the live
    // textarea and commit without a re-render, so editing/focus is uninterrupted.
    attachTextToolbar(control, annotation, (updated) => {
      applyTextBoxStyle(textBoxInput(control), updated, viewport);
      commit(updated);
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
  const pageBoxes = pageAnnotationBoxes(viewer, page.index);
  for (const annotation of viewer.model?.annotations ?? []) {
    if (annotation.kind !== "signature" || annotation.page !== page.index) {
      continue;
    }
    const control = buildStampControl(annotation, geometry, viewport);
    control.dataset.annotationId = annotation.id;
    control.dataset.annotationKind = "signature";
    const commitAndRerender = (updated: SignatureStamp): void => {
      if (viewer.model) {
        applyEdit(viewer, updateAnnotation(viewer.model, updated));
        void rerender(viewer);
      }
    };
    const commit = (updated: SignatureStamp): void => {
      if (viewer.model) {
        applyEdit(viewer, updateAnnotation(viewer.model, updated));
      }
    };
    const siblings = siblingsExcept(pageBoxes, annotation.id);
    bindStampDrag(control, annotation, geometry, viewport, commitAndRerender, siblings);
    bindStampScale(control, annotation, geometry, viewport, commitAndRerender, siblings);
    // Keyboard nudge commits live without a re-render, keeping the stamp focused.
    bindStampKeyboard(control, annotation, geometry, viewport, commit);
    bindStampDelete(control, annotation, (id) => deleteAnnotation(viewer, id));
    page.overlay.appendChild(control);
  }
}

/** Place the page's sticky notes: an anchored pin with a comment popup. */
function placeNotes(viewer: Viewer, page: RenderedPage, geometry: PageGeometry): void {
  const viewport = { scale: viewer.scale };
  for (const annotation of viewer.model?.annotations ?? []) {
    if (annotation.kind !== "note" || annotation.page !== page.index) {
      continue;
    }
    const control = buildNoteControl(annotation, geometry, viewport);
    // Comment edits commit without a re-render so the open popup keeps focus.
    bindNoteControl(control, annotation, (updated) => {
      if (viewer.model) {
        applyEdit(viewer, updateAnnotation(viewer.model, updated));
      }
    });
    bindNoteDelete(control, annotation, (id) => deleteAnnotation(viewer, id));
    bindNoteDrag(control, annotation, geometry, viewport, (updated) => {
      if (viewer.model) {
        applyEdit(viewer, updateAnnotation(viewer.model, updated));
        void rerender(viewer);
      }
    });
    // Keyboard nudge commits live without a re-render, keeping the pin focused.
    bindNoteKeyboard(control, annotation, geometry, viewport, (updated) => {
      if (viewer.model) {
        applyEdit(viewer, updateAnnotation(viewer.model, updated));
      }
    });
    page.overlay.appendChild(control);
    // A just-dropped note opens its popup so the comment can be typed at once.
    if (annotation.id === viewer.focusAnnotationId) {
      viewer.focusAnnotationId = null;
      control.classList.add("open");
      control.querySelector(".note-icon")?.setAttribute("aria-expanded", "true");
      control.querySelector<HTMLTextAreaElement>(".note-text")?.focus();
    }
  }
}

/** Paint the page's drawn shapes (rectangle/ellipse/line/arrow). */
function placeShapes(viewer: Viewer, page: RenderedPage, geometry: PageGeometry): void {
  const viewport = { scale: viewer.scale };
  for (const annotation of viewer.model?.annotations ?? []) {
    if (annotation.kind !== "shape" || annotation.page !== page.index) {
      continue;
    }
    const control = buildShapeControl(annotation, geometry, viewport);
    bindShapeDelete(control, annotation, (id) => deleteAnnotation(viewer, id));
    const commit = (updated: Shape): void => {
      if (viewer.model) {
        applyEdit(viewer, updateAnnotation(viewer.model, updated));
        void rerender(viewer);
      }
    };
    bindShapeDrag(control, annotation, geometry, viewport, commit);
    bindShapeResize(control, annotation, geometry, viewport, commit);
    // Keyboard nudge commits live without a re-render, keeping the shape focused.
    bindShapeKeyboard(control, annotation, geometry, viewport, (updated) => {
      if (viewer.model) {
        applyEdit(viewer, updateAnnotation(viewer.model, updated));
      }
    });
    page.overlay.appendChild(control);
  }
}

/** Paint the page's freehand ink annotations. */
function placeInk(viewer: Viewer, page: RenderedPage, geometry: PageGeometry): void {
  const viewport = { scale: viewer.scale };
  for (const annotation of viewer.model?.annotations ?? []) {
    if (annotation.kind !== "ink" || annotation.page !== page.index) {
      continue;
    }
    const control = buildInkControl(annotation, geometry, viewport);
    bindInkDelete(control, annotation, (id) => deleteAnnotation(viewer, id));
    page.overlay.appendChild(control);
  }
}

/** Paint the page's text-markup annotations (highlight/underline/strikethrough). */
function placeMarkups(viewer: Viewer, page: RenderedPage, geometry: PageGeometry): void {
  const viewport = { scale: viewer.scale };
  for (const annotation of viewer.model?.annotations ?? []) {
    if (annotation.kind !== "markup" || annotation.page !== page.index) {
      continue;
    }
    const control = buildMarkupControl(annotation, geometry, viewport);
    bindMarkupDelete(control, annotation, (id) => deleteAnnotation(viewer, id));
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

    if (viewer.shapeTool) {
      beginShapeDraw(viewer, page, geometry, rect, click);
      return;
    }

    if (viewer.inkTool) {
      beginInkDraw(viewer, page, geometry, rect, click);
      return;
    }

    if (viewer.textTool) {
      applyEdit(viewer, createTextBoxAt(viewer.model, click, geometry, viewport));
      viewer.focusAnnotationId =
        viewer.model.annotations[viewer.model.annotations.length - 1]?.id ?? null;
      setTextTool(viewer, false); // one box per activation
    } else if (viewer.noteTool) {
      applyEdit(viewer, createNoteAt(viewer.model, click, geometry, viewport));
      viewer.focusAnnotationId =
        viewer.model.annotations[viewer.model.annotations.length - 1]?.id ?? null;
      setNoteTool(viewer, false); // one note per activation
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

/** Minimum drag distance (screen px) before a shape is committed. */
const SHAPE_MIN_DRAG = 4;

/**
 * Run a shape draw: track the pointer from the press, showing a live preview, and
 * on release commit the shape (start -> end through the seam) unless the drag was
 * too small. The tool disarms after one shape, matching the other create tools.
 */
function beginShapeDraw(
  viewer: Viewer,
  page: RenderedPage,
  geometry: PageGeometry,
  rect: DOMRect,
  startClick: ScreenPoint,
): void {
  const kind = viewer.shapeTool;
  if (!kind || !viewer.model) {
    return;
  }
  const viewport = { scale: viewer.scale };
  let preview: HTMLElement | null = null;

  const draft = (endClick: ScreenPoint): Shape => ({
    kind: "shape",
    id: "preview",
    page: geometry.index,
    shape: kind,
    start: screenToModel(startClick, geometry, viewport),
    end: screenToModel(endClick, geometry, viewport),
    stroke: viewer.shapeStroke,
    strokeWidth: viewer.shapeStrokeWidth,
    fill: viewer.shapeFill,
  });

  const pointFor = (event: PointerEvent): ScreenPoint =>
    screenPoint(event.clientX - rect.left, event.clientY - rect.top);

  const onMove = (event: PointerEvent): void => {
    preview?.remove();
    preview = buildShapeControl(draft(pointFor(event)), geometry, viewport);
    preview.classList.add("shape-preview"); // non-interactive while drawing
    preview.querySelector(".shape-delete")?.remove();
    page.overlay.appendChild(preview);
  };

  const onUp = (event: PointerEvent): void => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    preview?.remove();
    const endClick = pointFor(event);
    const drag = Math.hypot(endClick.x - startClick.x, endClick.y - startClick.y);
    if (viewer.model && drag >= SHAPE_MIN_DRAG) {
      applyEdit(
        viewer,
        createShapeFromDrag(
          viewer.model,
          kind,
          viewer.shapeStroke,
          viewer.shapeStrokeWidth,
          viewer.shapeFill,
          startClick,
          endClick,
          geometry,
          viewport,
        ),
      );
    }
    setShapeTool(viewer, null); // one shape per activation
    void rerender(viewer);
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

/** Minimum pointer travel (screen px) between captured ink points. */
const INK_MIN_STEP = 2;

/**
 * Run a freehand ink draw: capture the pointer path from the press (thinned to a
 * minimum step so the stroke stays compact), show a live preview, and on release
 * commit the stroke through the seam. A path of fewer than two points is dropped.
 * The tool disarms after one stroke, matching the other create tools.
 */
function beginInkDraw(
  viewer: Viewer,
  page: RenderedPage,
  geometry: PageGeometry,
  rect: DOMRect,
  startClick: ScreenPoint,
): void {
  if (!viewer.inkTool || !viewer.model) {
    return;
  }
  const viewport = { scale: viewer.scale };
  const points: ScreenPoint[] = [startClick];
  let preview: HTMLElement | null = null;

  const pointFor = (event: PointerEvent): ScreenPoint =>
    screenPoint(event.clientX - rect.left, event.clientY - rect.top);

  const repaint = (): void => {
    preview?.remove();
    if (points.length < 2) {
      return;
    }
    const draft: Ink = {
      kind: "ink",
      id: "preview",
      page: geometry.index,
      paths: [points.map((p) => screenToModel(p, geometry, viewport))],
      color: viewer.inkColor,
      strokeWidth: viewer.inkStrokeWidth,
    };
    preview = buildInkControl(draft, geometry, viewport);
    preview.classList.add("ink-preview");
    preview.querySelector(".ink-delete")?.remove();
    page.overlay.appendChild(preview);
  };

  const onMove = (event: PointerEvent): void => {
    const next = pointFor(event);
    const last = points[points.length - 1]!;
    if (Math.hypot(next.x - last.x, next.y - last.y) >= INK_MIN_STEP) {
      points.push(next);
      repaint();
    }
  };

  const onUp = (): void => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    preview?.remove();
    if (viewer.model && points.length >= 2) {
      applyEdit(
        viewer,
        createInkFromPath(
          viewer.model,
          points,
          viewer.inkColor,
          viewer.inkStrokeWidth,
          geometry,
          viewport,
        ),
      );
    }
    setInkTool(viewer, false); // one stroke per activation
    void rerender(viewer);
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

/** The PDF-user-space placement for a right-click over a rendered page. */
function pagePlacement(
  viewer: Viewer,
  pageIndex: number,
  event: MouseEvent,
): StampPlacement | null {
  const page = viewer.pages[pageIndex];
  const geometry = viewer.model?.pages[pageIndex];
  if (!page || !geometry) {
    return null;
  }
  const rect = page.overlay.getBoundingClientRect();
  return { point: screenPoint(event.clientX - rect.left, event.clientY - rect.top), geometry };
}

/** Copy text to the system clipboard via the Tauri plugin (reliable in WKWebView). */
async function copyText(viewer: Viewer, text: string): Promise<void> {
  if (!text) {
    return;
  }
  try {
    await writeText(text);
  } catch (error) {
    notify(viewer, `Could not copy: ${String(error)}`, "error");
  }
}

/** Run a chosen context-menu action against the model or viewer chrome. */
function runContextAction(
  viewer: Viewer,
  target: ContextTarget,
  placement: StampPlacement | null,
  selectionText: string,
  action: MenuActionKey,
): void {
  switch (action) {
    case "copy":
      void copyText(viewer, selectionText);
      return;
    case "fit-width":
      void fitWidth(viewer);
      return;
    case "reset-zoom":
      void setScale(viewer, 1);
      return;
    case "edit-annotation":
      if (target.kind === "annotation") {
        viewer.focusAnnotationId = target.id;
        void rerender(viewer);
      }
      return;
    case "delete-annotation":
      if (target.kind === "annotation" && viewer.model) {
        applyEdit(viewer, removeAnnotation(viewer.model, target.id));
        void rerender(viewer);
      }
      return;
    case "add-text":
      if (placement && viewer.model) {
        applyEdit(
          viewer,
          createTextBoxAt(viewer.model, placement.point, placement.geometry, {
            scale: viewer.scale,
          }),
        );
        viewer.focusAnnotationId =
          viewer.model.annotations[viewer.model.annotations.length - 1]?.id ?? null;
        void rerender(viewer);
      }
      return;
    case "add-signature":
      openSignatureDialog(viewer, placement);
      return;
  }
}

/**
 * Replace the webview's default context menu with the app's own. Editable inputs
 * keep their native menu (paste must work); everywhere else the default is
 * suppressed and a context-sensitive menu is shown when there is something to
 * offer. The placement point for a page right-click is captured now, before the
 * menu can scroll the document out from under it.
 */
function handleContextMenu(viewer: Viewer, event: MouseEvent): void {
  const selection = window.getSelection();
  const hasSelection = !!selection && !selection.isCollapsed && selection.toString().trim() !== "";
  const target = classifyContextTarget(event.target as Element | null, hasSelection);
  if (target.kind === "editable") {
    return; // leave the native menu in place
  }
  event.preventDefault();
  const items = buildMenuItems(target);
  if (items.length === 0) {
    return; // chrome: native menu suppressed, nothing custom to show
  }
  const placement = target.kind === "page" ? pagePlacement(viewer, target.page, event) : null;
  // Capture the selected text now; the menu's focus would otherwise let it slip.
  const selectionText = hasSelection ? (selection?.toString() ?? "") : "";
  openContextMenu(items, { x: event.clientX, y: event.clientY }, (action) =>
    runContextAction(viewer, target, placement, selectionText, action),
  );
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
  placeMarkups(viewer, page, geometry);
  placeShapes(viewer, page, geometry);
  placeInk(viewer, page, geometry);
  placeNotes(viewer, page, geometry);

  // Selection is a non-critical enhancement: render the text layer after the
  // canvas, and never let a failure block the page from showing.
  try {
    const layer = await renderPageTextLayer(viewer.doc, page.index + 1, page.text, viewer.scale);
    if (live.has(page.index)) {
      viewer.textLayers.set(page.index, layer);
      // A page that scrolled in may contain search matches to highlight.
      if (viewer.search.query) {
        refreshSearchHighlights(viewer);
      }
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
  closeContextMenu(); // its targets are about to be replaced
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
  viewer.pages = placeholders;
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
  refreshSearchHighlights(viewer);
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
  closeSearch(viewer); // a fresh document starts with no active search
  viewer.search = emptySearch();
  viewer.searchSeq += 1; // invalidate any search still running on the old doc
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
    setNoteTool(viewer, false);
    setShapeTool(viewer, null);
    setInkTool(viewer, false);
    notify(viewer, "Click on the page to place a text box. Press Esc to cancel.", "info");
  }
}

/** Arm or disarm the freehand ink tool and reflect it on the toolbar and cursor. */
function setInkTool(viewer: Viewer, active: boolean): void {
  viewer.inkTool = active;
  viewer.mount.classList.toggle("tool-ink", active);
  document
    .querySelector<HTMLButtonElement>("#ink-tool")
    ?.setAttribute("aria-pressed", String(active));
  if (active) {
    setTextTool(viewer, false); // tools are mutually exclusive
    setNoteTool(viewer, false);
    setShapeTool(viewer, null);
    setStampTool(viewer, null);
    notify(viewer, "Drag on the page to draw freehand. Press Esc to cancel.", "info");
  }
}

/** Arm or disarm the sticky-note tool and reflect it on the toolbar and cursor. */
function setNoteTool(viewer: Viewer, active: boolean): void {
  viewer.noteTool = active;
  viewer.mount.classList.toggle("tool-note", active);
  document
    .querySelector<HTMLButtonElement>("#note-tool")
    ?.setAttribute("aria-pressed", String(active));
  if (active) {
    setTextTool(viewer, false); // tools are mutually exclusive
    setStampTool(viewer, null);
    setShapeTool(viewer, null);
    setInkTool(viewer, false);
    notify(viewer, "Click on the page to drop a note. Press Esc to cancel.", "info");
  }
}

const SHAPE_TOOL_IDS: Record<ShapeKind, string> = {
  rectangle: "#shape-rectangle",
  ellipse: "#shape-ellipse",
  line: "#shape-line",
  arrow: "#shape-arrow",
};

/** Arm or disarm the shape draw tool; a non-null kind means a drag draws it. */
function setShapeTool(viewer: Viewer, kind: ShapeKind | null): void {
  viewer.shapeTool = kind;
  viewer.mount.classList.toggle("tool-shape", kind !== null);
  // Reflect the armed kind on its button; clear the others.
  for (const [shapeKind, id] of Object.entries(SHAPE_TOOL_IDS)) {
    document
      .querySelector<HTMLButtonElement>(id)
      ?.setAttribute("aria-pressed", String(shapeKind === kind));
  }
  if (kind !== null) {
    setTextTool(viewer, false); // tools are mutually exclusive
    setNoteTool(viewer, false);
    setStampTool(viewer, null);
    setInkTool(viewer, false);
    notify(viewer, "Drag on the page to draw. Press Esc to cancel.", "info");
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
    setTextTool(viewer, false); // tools are mutually exclusive
    setNoteTool(viewer, false);
    setShapeTool(viewer, null);
    setInkTool(viewer, false);
    notify(viewer, "Click on the page to place your signature. Press Esc to cancel.", "info");
  }
}

/** True while a create tool (text, note, shape, ink or signature) is armed. */
function toolArmed(viewer: Viewer): boolean {
  return (
    viewer.textTool ||
    viewer.noteTool ||
    viewer.shapeTool !== null ||
    viewer.inkTool ||
    viewer.pendingStamp !== null
  );
}

/** Cancel any armed create tool and clear its hint. */
function cancelTools(viewer: Viewer): void {
  setTextTool(viewer, false);
  setNoteTool(viewer, false);
  setShapeTool(viewer, null);
  setInkTool(viewer, false);
  setStampTool(viewer, null);
  viewer.toasts?.clear();
}

/** The selection to mark up: the live one if present, else the last captured. */
function activeMarkupRange(viewer: Viewer): Range | null {
  const selection = window.getSelection();
  if (
    selection &&
    !selection.isCollapsed &&
    selection.rangeCount > 0 &&
    selection.toString().trim() !== ""
  ) {
    return selection.getRangeAt(0);
  }
  return viewer.markupRange;
}

/** Drop the current text selection and the captured markup range. */
function clearMarkupSelection(viewer: Viewer): void {
  window.getSelection()?.removeAllRanges();
  viewer.markupRange = null;
}

/** Each live page paired with its on-screen bounds, for routing selection rects. */
function markupTargets(viewer: Viewer): MarkupTargetPage[] {
  const targets: MarkupTargetPage[] = [];
  for (const page of viewer.pages) {
    const geometry = viewer.model?.pages[page.index];
    if (!geometry) {
      continue;
    }
    const bounds = page.overlay.getBoundingClientRect();
    targets.push({
      geometry,
      bounds: { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height },
    });
  }
  return targets;
}

/**
 * Mark up the current text selection in the given style, using the current
 * markup colour. The selection's client rects map to user-space quads per page
 * through the seam; the new markup(s) commit to the model and the selection is
 * cleared. A collapsed or off-page selection is a no-op with a hint.
 */
function applyMarkup(viewer: Viewer, style: MarkupStyle): void {
  if (!viewer.model) {
    return;
  }
  const range = activeMarkupRange(viewer);
  const rects = range
    ? Array.from(range.getClientRects()).map((r) => ({
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
      }))
    : [];
  if (rects.length === 0) {
    notify(viewer, "Select some text first, then choose a markup.", "info");
    return;
  }
  const next = markupSelection(
    viewer.model,
    style,
    viewer.markupColor,
    rects,
    markupTargets(viewer),
    { scale: viewer.scale },
  );
  if (next === viewer.model) {
    notify(viewer, "That selection isn't over a page.", "info");
    return;
  }
  applyEdit(viewer, next);
  clearMarkupSelection(viewer);
  void rerender(viewer);
}

// Where the context menu's "Add signature here" wants the stamp dropped. When
// present the dialog places the stamp at this point on "use"/import; when null
// it arms the sign tool for a click-to-place, as the dock button does.
interface StampPlacement {
  point: ScreenPoint;
  geometry: PageGeometry;
}

/** Place the stamp at a recorded point, or arm the tool for a click-to-place. */
function placeOrArmStamp(
  viewer: Viewer,
  image: StampImage,
  placement: StampPlacement | null,
): void {
  setTextTool(viewer, false); // tools are mutually exclusive
  if (placement && viewer.model) {
    applyEdit(
      viewer,
      createSignatureStampAt(
        viewer.model,
        placement.point,
        placement.geometry,
        { scale: viewer.scale },
        image,
      ),
    );
    void rerender(viewer);
  } else {
    setStampTool(viewer, image);
  }
}

/**
 * Open the signature dialog: a fresh pad to draw on, with clear/cancel/use. With
 * a `placement` the captured PNG is dropped at that point; without one, signature
 * placement is armed so the next page click drops the stamp.
 */
function openSignatureDialog(viewer: Viewer, placement: StampPlacement | null = null): void {
  const dialog = document.querySelector<HTMLDialogElement>("#signature-dialog");
  const host = document.querySelector<HTMLElement>("#signature-pad-host");
  if (!dialog || !host) {
    return;
  }
  const save = dialog.querySelector<HTMLInputElement>("#signature-save");
  if (save) {
    save.checked = false; // opt-in afresh each time the dialog opens
  }
  const pad = createSignaturePad(SIGNATURE_PAD.width, SIGNATURE_PAD.height);
  host.replaceChildren(pad.element);
  bindSignatureDialog(viewer, dialog, pad, placement);
  void renderSavedSignatures(viewer, dialog, placement);
  dialog.showModal();
}

/** Persist a signature for reuse when the dialog's "Save for reuse" box is ticked. */
async function persistSignatureIfRequested(
  viewer: Viewer,
  dialog: HTMLDialogElement,
  pngBytes: Uint8Array,
): Promise<void> {
  if (!dialog.querySelector<HTMLInputElement>("#signature-save")?.checked) {
    return;
  }
  try {
    await saveSignature(pngBytes);
  } catch (error) {
    notify(viewer, `Could not save the signature: ${String(error)}`, "error");
  }
}

/** Place a previously saved signature, rasterising it back into a stamp. */
async function useSavedSignature(
  viewer: Viewer,
  dialog: HTMLDialogElement,
  pngBytes: Uint8Array,
  placement: StampPlacement | null,
): Promise<void> {
  try {
    const image = await importImageAsStamp(pngBytes, DEFAULT_STAMP_WIDTH);
    placeOrArmStamp(viewer, image, placement);
    dialog.close();
  } catch (error) {
    notify(viewer, `Could not use that signature: ${String(error)}`, "error");
  }
}

/**
 * Fill the dialog's saved-signature strip. Each card previews a stored signature
 * and lets the user place it, rename it, make it the default, or delete it. The
 * default sorts first (Rust-side). Management actions persist via the store and
 * then re-render the strip so it stays a pure projection of what is on disk.
 */
async function renderSavedSignatures(
  viewer: Viewer,
  dialog: HTMLDialogElement,
  placement: StampPlacement | null,
): Promise<void> {
  const strip = dialog.querySelector<HTMLElement>("#saved-signatures");
  if (!strip) {
    return;
  }
  let saved: SavedSignature[];
  try {
    saved = await listSignatures();
  } catch (error) {
    notify(viewer, `Could not load saved signatures: ${String(error)}`, "error");
    return;
  }
  strip.replaceChildren();
  strip.hidden = saved.length === 0;

  const reload = (): void => void renderSavedSignatures(viewer, dialog, placement);
  const guard = (run: Promise<void>, whatFailed: string): void => {
    run.then(reload).catch((error) => {
      notify(viewer, `${whatFailed}: ${String(error)}`, "error");
    });
  };
  const actions: SavedSignatureActions = {
    onUse: (id) => {
      const signature = saved.find((s) => s.id === id);
      if (signature) {
        void useSavedSignature(viewer, dialog, signature.pngBytes, placement);
      }
    },
    onRename: (id, name) => guard(renameSignature(id, name), "Could not rename the signature"),
    onSetDefault: (id) => guard(setDefaultSignature(id), "Could not set the default signature"),
    onDelete: (id) => guard(deleteSignature(id), "Could not delete the signature"),
  };

  saved.forEach((signature, index) => {
    strip.appendChild(buildSavedSignatureCard(signature, index, actions));
  });
}

/**
 * Import a signature from an image file: pick via Rust (open_image), rasterise
 * to a transparent PNG, and arm placement. Unsupported or unreadable files
 * surface on the status line.
 */
async function importSignature(
  viewer: Viewer,
  dialog: HTMLDialogElement,
  placement: StampPlacement | null,
): Promise<void> {
  const data = await invoke<number[] | null>("open_image");
  if (!data) {
    return; // user cancelled
  }
  try {
    const image = await importImageAsStamp(new Uint8Array(data), DEFAULT_STAMP_WIDTH);
    void persistSignatureIfRequested(viewer, dialog, image.pngBytes);
    placeOrArmStamp(viewer, image, placement);
    dialog.close();
  } catch (error) {
    notify(viewer, `Could not import that image: ${String(error)}`, "error");
  }
}

/** Wire the dialog's clear/cancel/use actions to a freshly mounted pad. */
function bindSignatureDialog(
  viewer: Viewer,
  dialog: HTMLDialogElement,
  pad: SignaturePad,
  placement: StampPlacement | null,
): void {
  const action = (id: string, run: () => void): void => {
    const button = dialog.querySelector<HTMLButtonElement>(id);
    if (button) {
      button.onclick = run;
    }
  };
  action("#signature-clear", () => pad.clear());
  action("#signature-cancel", () => dialog.close());
  action("#signature-import", () => {
    void importSignature(viewer, dialog, placement);
  });
  action("#signature-use", () => {
    if (pad.isEmpty()) {
      return;
    }
    const aspect = SIGNATURE_PAD.height / SIGNATURE_PAD.width;
    const pngBytes = pad.exportPng();
    void persistSignatureIfRequested(viewer, dialog, pngBytes);
    placeOrArmStamp(
      viewer,
      {
        pngBytes,
        width: DEFAULT_STAMP_WIDTH,
        height: DEFAULT_STAMP_WIDTH * aspect,
      },
      placement,
    );
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
    ...(needsFont ? { fonts: await loadFontFamilies() } : {}),
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
    noteTool: false,
    shapeTool: null,
    shapeStroke: DEFAULT_SHAPE_COLOR,
    shapeStrokeWidth: 2,
    shapeFill: null,
    shapeFillColor: DEFAULT_SHAPE_FILL,
    inkTool: false,
    inkColor: DEFAULT_INK_COLOR,
    inkStrokeWidth: 2,
    pendingStamp: null,
    markupColor: DEFAULT_MARKUP_COLOR,
    markupRange: null,
    focusAnnotationId: null,
    history: null,
    encrypted: false,
    observer: null,
    pageObserver: null,
    pageRatios: new Map(),
    textLayers: new Map(),
    pages: [],
    search: emptySearch(),
    searchSeq: 0,
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

  document.addEventListener("contextmenu", (event) => handleContextMenu(viewer, event));

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

  document.querySelector<HTMLButtonElement>("#note-tool")?.addEventListener("click", () => {
    setNoteTool(viewer, !viewer.noteTool);
  });

  document.querySelector<HTMLButtonElement>("#sign-tool")?.addEventListener("click", () => {
    openSignatureDialog(viewer);
  });

  setupMarkupTools(viewer);
  setupShapeTools(viewer);
  setupInkTools(viewer);

  // The empty-state screen offers the same Open action as the dock.
  document
    .querySelector<HTMLButtonElement>("#empty-open")
    ?.addEventListener("click", () => run(() => openUserPdf(viewer), "open that PDF"));

  setupOverflowMenu();
  setupSearchBar(viewer, run);

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
    // Cmd/Ctrl+F opens find-in-document.
    if ((platform === "mac" ? event.metaKey : event.ctrlKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      openSearch(viewer);
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
