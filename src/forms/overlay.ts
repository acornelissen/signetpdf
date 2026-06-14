import { modelToScreen, type Viewport } from "../model/coords";
import type { PageGeometry } from "../model/document";
import { userSpacePoint } from "../model/geometry";
import type { FormField } from "./fields";

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

function position(element: HTMLElement, rect: ScreenRect): void {
  element.style.left = `${rect.left}px`;
  element.style.top = `${rect.top}px`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
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

function createControl(field: FormField): HTMLInputElement | null {
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
    default:
      // dropdown / optionlist arrive in m2-4.
      return null;
  }
}
