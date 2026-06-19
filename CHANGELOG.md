# Changelog

All notable changes to Ceralo are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-06-19

### Changed

- Renamed the project from SignetPDF to **Ceralo** to avoid a naming collision
  with an existing SignetPDF browser extension. This changes the product name,
  the npm/Cargo package name, the bundle identifier (`org.ceralo`), the window
  title, and the installer/bundle filenames. No functional change.
- License: removed the Commons Clause. Ceralo is now under plain Apache-2.0,
  an OSI-approved open-source licence, so it may be used commercially. This also
  makes the project eligible for open-source code-signing programs.

## [1.0.0] - 2026-06-19

### Added

- Text markup: highlight, underline, and strikethrough over selected text, with a
  colour picker. Markup is saved into the PDF and reads through the text.
- Sticky-note comments: drop an anchored note on the page and type a comment,
  saved as a standard PDF text annotation.
- Shapes: rectangle, ellipse, line, and arrow, drawn by dragging, each with a
  stroke colour and an optional fill.
- Freehand ink: draw on the page with a pen in any colour.
- The new annotations are first-class: move them by dragging or with the arrow
  keys, resize shapes by their handles, delete them, and undo/redo every change.

### Changed

- Reorganised the toolbar. Markup tools open from a **Highlight** button, and the
  drawing and annotation tools (text, note, shapes, ink) open from a **Drawing &
  annotation** button, each as a popover, keeping the main dock uncluttered.

### Fixed

- The on-screen highlight is now translucent so the highlighted text stays
  readable.
- Closing the window with unsaved changes now shows a confirmation dialog. The
  previous prompt relied on a browser dialog the desktop webview does not render,
  so it never appeared.

## [0.4.2] - 2026-06-18

### Fixed

- Snapping no longer shrinks a text box or signature stamp below the minimum
  size when a dragged edge aligns with a nearby grid line or annotation edge.
- The saved-signature manager's delete confirmation now triggers once, even on
  repeated or rapid clicks.

### Changed

- Dependency updates (Tauri 2.11.3 and assorted dev tooling) and added CodeQL
  static analysis for the TypeScript and Rust code.

## [0.4.1] - 2026-06-18

### Added

- New app icon: a gold signet seal with a pen nib on the brand blue.

### Changed

- Release builds: the macOS bundle is now a universal binary, so it runs on both
  Intel and Apple Silicon Macs (0.4.0 was Apple Silicon only).
- Documented how to install the unsigned binaries (per-OS steps for clearing the
  first-launch Gatekeeper/SmartScreen warning) in the README and release notes.

## [0.4.0] - 2026-06-18

### Added

- Selectable text layer over each page, with copy to the clipboard (Cmd/Ctrl+C).
- Find in document: a search bar with match highlighting, next/previous
  navigation, and a count of matches across every page (including pages not yet
  rendered).
- Custom right-click context menu with selection, page, and annotation actions;
  editable inputs keep the native menu.
- Reusable signatures: save a drawn or imported signature for later, and manage
  the saved set — preview, rename, set a default, and delete.
- Text formatting for text boxes: bold, italic, color, and alignment, applied
  from a floating toolbar that appears on focus.
- Font family choice for text boxes (sans, serif, mono); the matching Noto face
  is embedded in the saved PDF.
- Keyboard move and resize for a selected text box or signature stamp, with a
  clear selected-vs-editing state (Escape steps back).
- Optional snapping while dragging or resizing text boxes and stamps: edges snap
  to a 10pt grid or to a neighbouring annotation's edge; hold Alt to bypass it
  for fine placement.

### Fixed

- The unsaved-changes (Save) indicator and the undo/redo buttons now update
  immediately after edits that don't trigger a re-render — typing in a text box,
  keyboard nudges, formatting changes, and form-field edits.

## [0.3.0] - 2026-06-15

### Added

- Zoom: a preset ladder, reset to 100%, and pinch / Ctrl+wheel zoom (including
  WebKit trackpad pinch gestures).
- Open a PDF by drag-and-drop; press Escape to cancel an armed tool.
- Page-position indicator and a loading state.
- Accessibility: roving-tabindex toolbar, an overflow menu, and a pressed state
  for the Sign tool.

### Changed

- Smoother pinch zoom: preview via CSS transform, then rasterise on settle.
- License: Apache-2.0 with the Commons Clause (non-commercial; may not be sold).

## [0.2.0] - 2026-06-15

### Added

- UI redesign: a floating dock toolbar, toast notifications, a startup
  empty state, and an inline Lucide-style icon set.

### Changed

- CI moved off the deprecated Node 20 actions.

## [0.1.0] - 2026-06-15

Initial release — the walking skeleton through milestone M5.

### Added

- AcroForm support: detect and render text, checkbox, radio, and choice fields,
  bind edits to the document model, and refuse XFA forms with a clear message.
- Text boxes: click to create, edit in place, move by drag, resize with handles,
  and delete.
- Signatures: a drawing pad, image import, and placing, moving, and scaling a
  signature stamp.
- Save as a pure projection of the model: write AcroForm field values, draw
  free-text annotations (with an embedded Unicode font), embed signature images,
  and an optional flatten-on-export.
- Undo/redo over immutable document-model snapshots.
- Keyboard shortcuts, labelled controls, and keyboard operation throughout.
- Encrypted PDFs: detection with an in-app password dialog.
- Virtualized page rendering for large documents.
- Native file I/O via Rust commands (open, save, save as) with a path-grant
  allowlist.

[1.0.1]: https://github.com/acornelissen/ceralo/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/acornelissen/ceralo/compare/v0.4.2...v1.0.0
[0.4.2]: https://github.com/acornelissen/ceralo/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/acornelissen/ceralo/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/acornelissen/ceralo/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/acornelissen/ceralo/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/acornelissen/ceralo/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/acornelissen/ceralo/releases/tag/v0.1.0
