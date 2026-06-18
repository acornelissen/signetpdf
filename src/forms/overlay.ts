import { modelToScreen, type Viewport } from "../model/coords";
import type { PageGeometry } from "../model/document";
import { userSpacePoint } from "../model/geometry";
import { positionElement as position } from "../overlay/position";
import type { FieldKind, FormField } from "./fields";

/** A control's CSS box within a page overlay (pixels, top-left origin). */
export interface ScreenRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Convert a field's user-space rectangle to its CSS box on screen by running two
 * opposite corners through the coordinate seam and taking their bounding box.
 * This is the single source of overlay placement, so controls line up with the
 * rendered page at any scale and rotation.
 */
export function fieldScreenRect(
  field: FormField,
  page: PageGeometry,
  viewport: Viewport,
): ScreenRect {
  const corner1 = modelToScreen(userSpacePoint(field.rect.x, field.rect.y), page, viewport);
  const corner2 = modelToScreen(
    userSpacePoint(field.rect.x + field.rect.width, field.rect.y + field.rect.height),
    page,
    viewport,
  );
  return {
    left: Math.min(corner1.x, corner2.x),
    top: Math.min(corner1.y, corner2.y),
    width: Math.abs(corner1.x - corner2.x),
    height: Math.abs(corner1.y - corner2.y),
  };
}

/**
 * Build the HTML control for a field, positioned in the page overlay. Returns
 * null for kinds not handled yet (checkbox/radio arrive in m2-3, choice in
 * m2-4). The model stays the source of truth — binding happens in m2-5.
 */
export function buildFieldControl(
  field: FormField,
  page: PageGeometry,
  viewport: Viewport,
): HTMLElement | null {
  const control = createControl(field);
  if (!control) {
    return null;
  }
  control.classList.add("field");
  control.dataset.fieldName = field.name;
  position(control, fieldScreenRect(field, page, viewport));
  return control;
}

/** Set a control's displayed value from the model. Controls hold no own state. */
export function applyFieldValue(
  control: HTMLElement,
  kind: FieldKind,
  value: string | boolean | undefined,
): void {
  if (value === undefined) {
    return;
  }
  if (kind === "checkbox") {
    (control as HTMLInputElement).checked = value === true;
    return;
  }
  if (kind === "radio") {
    const radio = control as HTMLInputElement;
    radio.checked = radio.value === String(value);
    return;
  }
  (control as HTMLInputElement | HTMLSelectElement).value = String(value);
}

/**
 * Wire a control's edits to the model via onEdit. Every change routes through
 * here, so the document model stays the single source of truth (m1 invariant 1).
 */
export function bindFieldControl(
  control: HTMLElement,
  field: FormField,
  onEdit: (name: string, value: string | boolean) => void,
): void {
  const { name, kind } = field;
  switch (kind) {
    case "text":
      control.addEventListener("input", () => {
        onEdit(name, (control as HTMLInputElement).value);
      });
      return;
    case "checkbox":
      control.addEventListener("change", () => {
        onEdit(name, (control as HTMLInputElement).checked);
      });
      return;
    case "radio":
      control.addEventListener("change", () => {
        const radio = control as HTMLInputElement;
        if (radio.checked) {
          onEdit(name, radio.value);
        }
      });
      return;
    case "dropdown":
    case "optionlist":
      control.addEventListener("change", () => {
        onEdit(name, (control as HTMLSelectElement).value);
      });
      return;
  }
}

function populateOptions(select: HTMLSelectElement, options: readonly string[]): void {
  for (const value of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
}

function createControl(field: FormField): HTMLElement | null {
  switch (field.kind) {
    case "text": {
      const input = document.createElement("input");
      input.type = "text";
      input.classList.add("field-text");
      input.setAttribute("aria-label", field.name);
      return input;
    }
    case "checkbox": {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.classList.add("field-toggle");
      input.setAttribute("aria-label", field.name);
      if (field.onValue !== undefined) {
        input.value = field.onValue;
      }
      return input;
    }
    case "radio": {
      const input = document.createElement("input");
      input.type = "radio";
      input.classList.add("field-toggle");
      // Shared name makes the browser enforce group exclusivity.
      input.name = field.name;
      if (field.onValue !== undefined) {
        input.value = field.onValue;
      }
      input.setAttribute("aria-label", `${field.name}: ${field.onValue ?? ""}`);
      return input;
    }
    case "dropdown": {
      const select = document.createElement("select");
      select.classList.add("field-choice");
      select.setAttribute("aria-label", field.name);
      populateOptions(select, field.options ?? []);
      return select;
    }
    case "optionlist": {
      const select = document.createElement("select");
      select.classList.add("field-choice", "field-list");
      // Render as a multi-row list box rather than a collapsed dropdown.
      select.size = Math.min(Math.max(field.options?.length ?? 2, 2), 6);
      select.setAttribute("aria-label", field.name);
      populateOptions(select, field.options ?? []);
      return select;
    }
    default:
      return null;
  }
}
