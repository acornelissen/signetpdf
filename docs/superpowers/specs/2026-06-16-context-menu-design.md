# Custom right-click context menu

Issue: Ceralo-gi4

## Goal

Replace the webview's default right-click menu with an app-specific,
context-sensitive menu. The menu's items depend on what is under the cursor.
Editable inputs keep their native menu so paste keeps working.

## Non-goals

- Custom menu over form fields or the text-annotation editing textarea. Those
  keep the native cut/copy/paste menu.
- Native OS menus via Tauri/Rust. The menu is DOM-driven in TypeScript like the
  rest of the app.
- New actions beyond what the app already exposes (copy, add text, add
  signature, fit width, reset zoom, edit/delete annotation).

## Architecture

A new module `src/app/contextmenu.ts` owns the menu. It has three parts with
clear boundaries:

1. **Classifier** (pure): maps a `contextmenu` event target to a context
   descriptor, or `null` when the menu should not open.
2. **Item builder** (pure): maps a context descriptor to a list of item specs
   (`{ label, action, disabled }`).
3. **Menu component** (DOM): renders item specs into a floating menu, handles
   keyboard navigation, focus, positioning, and dismissal. Activating an item
   runs its `action` and closes the menu.

`main.ts` registers one document-level `contextmenu` listener. On each event it
runs the classifier; if it returns a context, it calls `preventDefault()`,
builds the items (binding each action to the relevant viewer call), and opens
the menu at the cursor. If the classifier returns `null` because the target is
editable, the listener does nothing and the native menu shows. For any other
`null` (app chrome, empty state) the listener calls `preventDefault()` and shows
no menu.

### Context descriptor

```ts
type ContextTarget =
  | { kind: "selection" }
  | { kind: "annotation"; annotationKind: "text" | "signature"; id: string }
  | { kind: "page"; page: number; point: Point } // point in PDF user space
  | { kind: "editable" } // sentinel: caller leaves the native menu alone
  | { kind: "chrome" }; // suppress native, show nothing
```

The classifier returns `ContextTarget`. `main.ts` treats `editable` as
"do nothing" and `chrome` as "suppress only".

### Classification rule (in order)

1. Target is `input`, `textarea`, or inside `[contenteditable]` → `editable`.
2. A non-empty window text selection exists → `selection`.
3. Target is inside a placed annotation control → `annotation` with its kind
   and id. The classifier finds the nearest annotation control and reads its id
   and kind from the control's `dataset` (`data-annotation-id`,
   `data-annotation-kind`); if the controls don't already carry these, the plan
   adds them when the controls are built.
4. Target is inside a rendered page overlay → `page`, converting the cursor
   position to a user-space point via the coordinate seam.
5. Otherwise → `chrome`.

Selection ranks above annotation/page so right-clicking a live selection always
offers Copy, matching the platform convention.

## Items per context

| Context           | Items                                                       |
| ----------------- | ----------------------------------------------------------- |
| selection         | Copy                                                        |
| annotation (text) | Edit (focus the box for editing), Delete                    |
| annotation (sig)  | Delete                                                      |
| page              | Add text here, Add signature here, Fit width, Reset to 100% |

No `disabled` items are needed: every context that produces items implies its
precondition (a page/annotation only exists once a document is open, Copy only
appears with a selection), so the builder never emits an unrunnable item.

Note on text boxes: a text box is mostly its editing `textarea`, which keeps the
native menu so paste works. The annotation menu (Edit/Delete) therefore surfaces
when right-clicking the box's non-editable chrome (its grip/border), not the
textarea. Signature stamps have no input, so right-clicking anywhere on them
offers Delete.

## "Add ... here" placement

- **Add text here**: calls `createTextBoxAt(model, point, geometry, viewport)`
  with the right-click point — the same path the text tool uses on click — then
  re-renders and focuses the new box.
- **Add signature here**: records `{ page, point }`, opens the existing
  signature dialog, and on "use" places the stamp at the recorded point instead
  of arming a click-to-place. This adds an optional placement point threaded
  into the signature-dialog flow; when absent, the dialog behaves as today
  (arm the sign tool, place on next click).

## Menu component behavior

- Single floating element appended to the document; only one open at a time
  (opening a new menu closes any existing one).
- `role="menu"`; each item is a `role="menuitem"` button.
- On open, focus moves to the first enabled item. Up/Down move between items
  (wrapping), Home/End jump to first/last, Enter or Space activate, Escape
  closes the menu and restores focus to the element that had it before opening.
- Dismiss on: outside pointer-down, scroll, window resize, Escape, or a new
  context-menu event.
- Positioned at the cursor and clamped so it stays within the viewport
  (flip/shift near edges).
- Styled to match the dock (same surface, radius, and focus treatment).

## Testing

- **Classifier unit tests** (`contextmenu.test.ts`): editable targets →
  `editable`; selection present → `selection` regardless of underlying element;
  annotation target → correct kind and id; page target → `page` with the seam
  conversion; bare chrome → `chrome`. Selection outranks annotation/page.
- **Item builder unit tests**: each context produces the expected labels and
  order; disabled flags set correctly when no document is open.
- **Menu DOM tests** (`contextmenu.dom.test.ts`): opens with first item focused;
  Up/Down/Home/End navigation skips disabled items and wraps; Enter activates
  and closes; Escape closes and restores focus; outside pointer-down closes; an
  editable target leaves the native menu (handler does not `preventDefault`).
- Placement reuses existing `createTextBoxAt` / `createSignatureStampAt`, which
  already have coverage; new wiring (deferred signature placement point) gets a
  focused test through the dialog flow.

## Out-of-scope follow-ups

- Native OS menu via Tauri, if OS-native chrome is ever wanted.
- Custom clipboard menu over editable inputs.
