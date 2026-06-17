import type { TextAlign, TextBox } from "../model/document";

// A small floating formatting toolbar for a selected/editing text box: font
// size, bold, italic, colour and alignment. It holds no state of its own — each
// control reflects the box and every change routes back through onChange (which
// the caller commits via updateAnnotation), then the controls re-reflect the new
// box. The caller shows/hides it with the box's focus (see CSS :focus-within).

const ALIGNMENTS: readonly { value: TextAlign; label: string; glyph: string }[] = [
  { value: "left", label: "Align left", glyph: "⤎" },
  { value: "center", label: "Align center", glyph: "↔" },
  { value: "right", label: "Align right", glyph: "⤏" },
];

const FONT_SIZE_MIN = 4;
const FONT_SIZE_MAX = 144;

function toggleButton(className: string, label: string, text: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-pressed", "false");
  button.textContent = text;
  return button;
}

/**
 * Build the toolbar into `host`, reflecting `box`, and wire its controls to
 * `onChange`. Returns nothing; the toolbar lives in the host until it is removed
 * with the box. Each control applies one field and emits the updated box.
 */
export function attachTextToolbar(
  host: HTMLElement,
  box: TextBox,
  onChange: (updated: TextBox) => void,
): void {
  let current = box;

  const toolbar = document.createElement("div");
  toolbar.className = "text-box-toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Text formatting");
  // Keep pointer-downs from bubbling to the page/overlay (which would start a
  // placement or clear selection); the controls handle their own events.
  toolbar.addEventListener("pointerdown", (event) => event.stopPropagation());

  const size = document.createElement("input");
  size.type = "number";
  size.className = "ttb-size";
  size.min = String(FONT_SIZE_MIN);
  size.max = String(FONT_SIZE_MAX);
  size.setAttribute("aria-label", "Font size");

  const bold = toggleButton("ttb-bold", "Bold", "B");
  const italic = toggleButton("ttb-italic", "Italic", "I");

  const color = document.createElement("input");
  color.type = "color";
  color.className = "ttb-color";
  color.setAttribute("aria-label", "Text color");

  const alignButtons = ALIGNMENTS.map((a) => {
    const button = toggleButton("ttb-align", a.label, a.glyph);
    button.dataset.align = a.value;
    button.addEventListener("click", () => emit({ ...current, align: a.value }));
    return button;
  });

  bold.addEventListener("click", () => emit({ ...current, bold: !current.bold }));
  italic.addEventListener("click", () => emit({ ...current, italic: !current.italic }));
  color.addEventListener("input", () => emit({ ...current, color: color.value }));
  size.addEventListener("change", () => {
    const next = Number.parseInt(size.value, 10);
    if (Number.isFinite(next) && next >= FONT_SIZE_MIN && next <= FONT_SIZE_MAX) {
      emit({ ...current, fontSize: next });
    } else {
      reflect(current); // reject out-of-range input, restore the shown value
    }
  });

  toolbar.append(size, bold, italic, color, ...alignButtons);
  host.appendChild(toolbar);

  function reflect(b: TextBox): void {
    size.value = String(b.fontSize);
    bold.setAttribute("aria-pressed", String(b.bold));
    italic.setAttribute("aria-pressed", String(b.italic));
    color.value = b.color;
    for (const button of alignButtons) {
      button.setAttribute("aria-pressed", String(button.dataset.align === b.align));
    }
  }

  function emit(updated: TextBox): void {
    current = updated;
    reflect(current);
    onChange(current);
  }

  reflect(current);
}
