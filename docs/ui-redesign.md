# Ceralo UI redesign — design spec

Status: proposed. This is a design document, not implementation. It defines the
floating dock toolbar, the floating toast/status system, a shared design-token
layer, and the consistency rules that tie the existing dialogs and annotation
chrome to them.

Scope is presentation only. It touches `index.html`, `src/styles.css`, and small
wiring in `src/main.ts` (the status helper, an icon-button factory). It does
**not** touch the model, the coordinate seam, save, or any architecture
invariant. Rendering code stays free of annotation/field state.

Decisions locked with the user:

- Toolbar: **bottom-center floating dock** (rounded pill, detached from the
  window edge).
- Theme: **polished light only**. Dark mode is deferred to a follow-up bead;
  tokens are authored so a dark palette is a variable swap, not a rewrite.

---

## 1. Design tokens

All hard-coded colors/spacing today are inline literals (`#396cd8`, `0.5rem`,
`6px`, ad-hoc shadows). Replace them with a single token layer at `:root` so the
toolbar, toasts, dialogs, and annotation chrome stay visually consistent by
construction (one source of truth, mirrors invariant #1's spirit for styling).

```css
:root {
  /* Neutral surfaces (warm gray, softer than the current flat #f6f6f6) */
  --bg: #eef0f3; /* app canvas behind the pages */
  --surface: #ffffff; /* page, dialog, dock body */
  --surface-muted: #f4f5f7; /* inputs, hover fills */
  --border: #d9dce1; /* hairline borders */
  --border-strong: #b9bec7;

  /* Text */
  --text: #1a1c20; /* primary (>= 14:1 on surface) */
  --text-muted: #5b616b; /* secondary labels, ~5.4:1 on surface */

  /* Brand + semantics (AA: >= 4.5:1 against white for text/icon use) */
  --accent: #2f6bd8; /* primary blue, refined from #396cd8 */
  --accent-strong: #2557b3; /* pressed / on-accent text background */
  --accent-soft: rgba(47, 107, 216, 0.08);
  --success: #1b7a3d;
  --success-strong: #15622f;
  --danger: #c0182b;
  --danger-strong: #99121f;

  /* On-accent foreground */
  --on-accent: #ffffff;

  /* Radius */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px; /* dock + toast pills */
  --radius-pill: 999px;

  /* Spacing scale (4px base) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;

  /* Elevation */
  --shadow-1: 0 1px 3px rgba(16, 18, 22, 0.12);
  --shadow-2: 0 4px 14px rgba(16, 18, 22, 0.16);
  --shadow-dock: 0 8px 30px rgba(16, 18, 22, 0.22), 0 2px 6px rgba(16, 18, 22, 0.12);

  /* Motion (respect prefers-reduced-motion, see §6) */
  --ease: cubic-bezier(0.2, 0.7, 0.2, 1);
  --dur-fast: 120ms;
  --dur-med: 200ms;

  /* Control sizing */
  --hit: 40px; /* min touch/click target — WCAG 2.5.8 floor is 24px; 40 is comfortable */
}
```

> Note: `--text-muted` is `#5b616b`; ignore the stray placeholder line above when
> implementing (kept here only to flag the value was chosen for contrast).

Dark mode later = re-declare these under `@media (prefers-color-scheme: dark)` or
a `:root[data-theme="dark"]` selector. No component CSS changes.

---

## 2. Floating dock toolbar

### Layout

A single horizontal pill, `position: fixed`, centered on the bottom edge:

```
left: 50%; transform: translateX(-50%); bottom: var(--space-5);
```

The viewer scroll column gets `padding-bottom` equal to the dock height + gap so
the last page can scroll clear of the dock (it must never permanently cover
content).

The dock is a frosted surface: `background: color-mix(in srgb, var(--surface) 88%, transparent)`
with `backdrop-filter: blur(12px)`, `border: 1px solid var(--border)`,
`border-radius: var(--radius-lg)`, `box-shadow: var(--shadow-dock)`,
`padding: var(--space-2)`.

### Grouping

Buttons are organized into semantic groups separated by thin vertical dividers
(`1px` `--border`, `60%` height, `var(--space-1)` margins). Order, left to right:

1. **File** — Open, Save, Save As, Export flat
2. **Edit tools** — Text, Sign (these are toggles / armed states)
3. **History** — Undo, Redo
4. **Zoom** — Zoom out, `100%` readout, Zoom in, Fit width

The product name `Ceralo` (`<h1>`) leaves the toolbar. It moves to a minimal
top-left app title or is dropped from the chrome entirely (title is in the OS
window frame). Keeping it out of the dock keeps the dock about _actions_.

### Icon buttons

Each control becomes an **icon button**: a square `--hit` × `--hit` target,
`border-radius: var(--radius-md)`, transparent background at rest. The visible
label is an inline SVG icon; the text label is kept for assistive tech and
tooltip (never removed, just visually moved — see Accessibility).

Icon set: **inline SVG** in the Lucide visual style (24px, `stroke-width: 1.75`,
`currentColor`). Inline SVG is mandatory here — the CSP forbids remote fonts/CDN
icon packs, and inline strokes inherit `currentColor` so state colors come free.
Icons are emitted by a small factory in `main.ts`/a helper module rather than
pasted into HTML, so the markup stays a list of buttons.

Action → icon map:

| Action      | Lucide icon                      | Notes                                                |
| ----------- | -------------------------------- | ---------------------------------------------------- |
| Open PDF    | `folder-open`                    |                                                      |
| Save        | `save`                           | shows a dirty dot when `model.dirty` (see §2 states) |
| Save As     | `save` + small `pen`/`copy`      | use `copy` to differentiate from Save                |
| Export flat | `layers` / `file-down`           | flattened = collapsed layers metaphor                |
| Text        | `type`                           | toggle                                               |
| Sign        | `pen-tool` / `signature`         | opens signature dialog                               |
| Undo        | `undo-2`                         | disabled state when `!canUndo`                       |
| Redo        | `redo-2`                         |                                                      |
| Zoom out    | `minus`                          |                                                      |
| Zoom in     | `plus`                           |                                                      |
| Fit width   | `move-horizontal` / `maximize-2` |                                                      |

The zoom readout (`#zoom-level`) stays a text span with `tabular-nums`, centered
between the −/+ buttons, `aria-live="polite"` (unchanged behavior).

### Button states (all via tokens)

| State                                        | Visual                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| Rest                                         | transparent bg, `--text` icon                                                        |
| Hover                                        | `--surface-muted` bg, `--text` icon, `--dur-fast` ease                               |
| Focus-visible                                | `2px solid var(--accent)` outline, `2px` offset (keyboard only)                      |
| Active/press                                 | `--accent-soft` bg                                                                   |
| Toggle on (`aria-pressed="true"`, Text tool) | `--accent` bg, `--on-accent` icon                                                    |
| Armed (Sign placement pending)               | same accent treatment as toggle-on, applied to Sign                                  |
| Disabled (`disabled`)                        | `opacity: 0.4`, `cursor: not-allowed`, no hover                                      |
| Dirty (Save only)                            | small `--danger`/`--accent` dot badge top-right of the Save icon while `model.dirty` |

The existing `aria-pressed` toggle for Text already drives state; Sign should get
the same armed indication (today only the cursor changes). Add a body/dock class
or `data-armed` toggled from `setStampTool`.

### Responsive / overflow

The dock has 12+ controls. On a narrow window the four groups may exceed width.
Rule: the dock `max-width: calc(100vw - 2 * var(--space-4))`, groups `flex-wrap`
is **not** used (a wrapping dock looks broken). Instead, below a breakpoint
(~720px) collapse the File group's Save As / Export flat into an overflow
"More" menu button (`more-horizontal` icon → a small popover list). Zoom and the
primary tools always stay visible. This keeps the pill one row tall always.

---

## 3. Floating toast / status system

Today `#status` is a left-aligned red paragraph under the toolbar, `role="alert"`,
shown only for errors and a few successes ("Saved.", "Exported a flattened
copy."). It is inconsistent (errors and confirmations look identical) and tied to
the old top layout.

Replace with a **floating centered toast** stack.

### Placement

`position: fixed`, top-center: `top: var(--space-5); left: 50%;
transform: translateX(-50%)`. Toasts stack downward with `var(--space-2)` gaps.
Top-center keeps them away from the bottom dock and reads as transient.

### Variants

One component, three semantic variants driven by a `data-variant`:

| Variant   | Use                                                        | Accent      | Icon             |
| --------- | ---------------------------------------------------------- | ----------- | ---------------- |
| `info`    | neutral notices ("This PDF is encrypted — view/fill only") | `--accent`  | `info`           |
| `success` | confirmations ("Saved.", "Exported a flattened copy.")     | `--success` | `check-circle`   |
| `error`   | failures ("Could not save the PDF: …")                     | `--danger`  | `alert-triangle` |

Each toast: frosted `--surface` pill, `--radius-lg`, `--shadow-2`, left color
bar / leading icon in the variant color, message text in `--text`, optional
dismiss `×`. `padding: var(--space-3) var(--space-4)`.

### Behavior

- `success` and `info` auto-dismiss after ~4s; `error` is **sticky** (manual
  dismiss or replaced by the next action) so failures aren't missed.
- Enter: fade + 8px upward slide, `--dur-med` `--ease`. Exit: fade, `--dur-fast`.
- Max ~3 visible; oldest drops first.
- Encrypted-document notice and the "armed tool" hints can also flow through this
  as `info` toasts.

### Accessibility

- The toast container is an `aria-live` region: a polite region for
  `info`/`success`, an assertive `role="alert"` for `error`. Simplest correct
  shape: two stacked live regions (one `polite`, one `assertive`) and route by
  variant — this preserves today's screen-reader behavior for errors.
- Auto-dismiss timers pause on hover/focus so a keyboard user can read them.
- Dismiss button is a real `<button>` with `aria-label="Dismiss"`.

### API impact (`main.ts`)

`setStatus(viewer, message)` becomes `notify(viewer, message, variant)` (or keep
`setStatus` as an `error`-default wrapper to minimize churn). Call sites:

- `save` / `saveAs` "Saved." → `success`
- `exportFlattened` "Exported a flattened copy." → `success`
- encrypted notices, XFA refusal, image-import failure, the generic
  `Could not ${what}` catch in `run()` → `error` (or `info` for the encrypted
  _notice_, which is not a failure)
- The `run()` wrapper clears toasts at the start of an action (today it sets
  `""`); keep that reset.

---

## 4. Dialog consistency (password + signature)

The two `<dialog>`s already share a shape but repeat button CSS. Unify them on
the tokens:

- Backdrop: `rgba(16, 18, 22, 0.45)` + `backdrop-filter: blur(2px)`.
- Panel: `--surface`, `--radius-md` (use `--radius-lg` for visual match with the
  dock), `--shadow-dock`, `padding: var(--space-5)`.
- Buttons: one shared `.btn` / `.btn-primary` / `.btn-ghost` class set (see §5)
  instead of `.password-actions button` and `.signature-actions button`
  duplicating the same rules. Primary actions (`Open`, `Place signature`) use
  `--accent` / `--success`; secondary use ghost.
- Inputs and the signature pad: `--surface-muted` fill, `--border`,
  `--radius-sm`, accent focus ring — same focus treatment everywhere.
- Entry animation matches toasts (fade + slight scale), reduced-motion aware.

The signature dialog's "Place signature" should read as primary (success green is
fine, matching the placed-stamp green chrome) and "Import image…" stays a ghost
button pushed left.

---

## 5. Shared button classes (kill the duplication)

Today button CSS is written three times (toolbar, password-actions,
signature-actions). Define once:

```css
.btn {
  /* base: font, radius-sm, padding, border, focus ring, transition */
}
.btn-icon {
  /* square --hit target, transparent, for the dock */
}
.btn-primary {
  background: var(--accent);
  color: var(--on-accent);
}
.btn-success {
  background: var(--success);
  color: var(--on-accent);
}
.btn-ghost {
  background: transparent;
  border-color: var(--border);
}
.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

DRY threshold is met (three occurrences). The dialogs and dock both consume these.

---

## 6. Annotation & field chrome — token alignment

The overlay chrome (text box, stamp, field outlines) currently hard-codes
`#396cd8`, `#2e7d32`, `#b00020`. Re-point them at `--accent`, `--success`,
`--danger` so a single accent change recolors the whole app. No geometry or
behavior changes — purely swapping literals for variables. The grips/handles keep
their current sizes and positions (they are tuned to the coordinate seam; leave
the math alone).

Focus rings on overlay controls already meet AA; standardize them on the shared
`:focus-visible` token (`--accent`, 2px, offset) for one consistent focus look
across dock, dialogs, and overlay.

---

## 7. Accessibility checklist (WCAG 2.2 AA floor)

- **Icon buttons keep text labels.** Each dock button has either
  `aria-label="Open PDF"` or a visually-hidden `<span class="sr-only">`. Never an
  icon alone. The `.sr-only` utility (clip-rect pattern) is added to styles.
- **Tooltips** on hover/focus show the same label + shortcut (e.g. "Save ⌘S").
  Tooltip is supplementary, not the only label.
- **Hit targets** ≥ 40px (exceeds the 24px AA minimum, 2.5.8).
- **Contrast**: every token pairing above is chosen for ≥ 4.5:1 text / ≥ 3:1 UI.
  Toggle-on uses `--accent` with white icon (verified ≥ 4.5:1).
- **Focus order**: dock is a single `<nav aria-label="Toolbar">` /
  `role="toolbar"`; arrow-key roving is a nice-to-have, Tab order is the floor.
- **Live regions**: toasts as described in §3 preserve `role="alert"` semantics
  for errors.
- **Reduced motion**: wrap all transitions in
  `@media (prefers-reduced-motion: no-preference)`; default to no animation.
- **Keyboard**: existing shortcuts unchanged; dock is fully tabbable; dialogs
  already trap focus via `showModal()`.

---

## 8. Change map (for the implementation beads)

| File                               | Change                                                                                                                                                                                                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/styles.css`                   | Add token `:root` block; rewrite `.toolbar` → `.dock`; add `.btn*`, `.toast*`, `.sr-only`, tooltip; re-point overlay/dialog colors to tokens. Largest diff.                                                                                                       |
| `index.html`                       | Restructure `<header class="toolbar">` into `<nav class="dock" role="toolbar">` with grouped icon buttons; move `<h1>` out; replace `#status` `<p>` with a `#toasts` live-region container; add tooltip markup.                                                   |
| `src/main.ts`                      | Add an icon-button / SVG factory (or import from a new `src/app/icons.ts`); replace `setStatus` with `notify(variant)` and update call sites; toggle Sign armed state for visual feedback; wire dismiss + auto-timeout for toasts; optional overflow "More" menu. |
| `src/app/icons.ts` (new)           | Inline Lucide SVG strings keyed by name; `iconButton(name, label, id)` helper. CSP-safe, no deps.                                                                                                                                                                 |
| `src/app/toast.ts` (new, optional) | Toast stack manager (create/dismiss/timeout/live-region routing), unit-testable headless.                                                                                                                                                                         |

Suggested commits (atomic, conventional):

1. `feat(ui): add design tokens and shared button classes`
2. `feat(ui): inline Lucide icon set and icon-button helper`
3. `feat(ui): floating bottom dock toolbar`
4. `feat(ui): floating toast/status system with variants`
5. `refactor(ui): point dialogs and overlay chrome at tokens`

Each compiles and keeps tests green; the toast manager and icon helper get unit
tests first (TDD), the pure-CSS commits are verified against the fixtures by eye

- the existing DOM tests.

---

## 9. Out of scope / follow-ups (file as beads)

- Dark theme palette (tokens are ready for it).
- Roving-tabindex arrow navigation in the dock.
- Per-tool contextual sub-bars (e.g. font size for the text tool) — a future
  enhancement once the dock exists.
- An empty-state / drop-zone screen ("Open a PDF or drop one here") for when no
  document is loaded.
