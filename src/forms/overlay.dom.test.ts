// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { Viewport } from "../model/coords";
import type { PageGeometry } from "../model/document";
import type { FormField } from "./fields";
import { buildFieldControl } from "./overlay";

const page: PageGeometry = { index: 0, width: 612, height: 792, rotation: 0 };
const viewport: Viewport = { scale: 1 };
const rect = { x: 10, y: 10, width: 20, height: 20 };

function control(field: FormField): HTMLInputElement {
  const element = buildFieldControl(field, page, viewport);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error("expected an input control");
  }
  return element;
}

describe("buildFieldControl (DOM)", () => {
  it("builds a checkbox carrying its on-value and field name", () => {
    const checkbox = control({
      name: "check.agree",
      kind: "checkbox",
      page: 0,
      rect,
      onValue: "Yes",
    });
    expect(checkbox.type).toBe("checkbox");
    expect(checkbox.dataset.fieldName).toBe("check.agree");
    expect(checkbox.value).toBe("Yes");
  });

  it("builds radios that share a group name and stay mutually exclusive", () => {
    const red = control({ name: "radio.color", kind: "radio", page: 0, rect, onValue: "0" });
    const blue = control({ name: "radio.color", kind: "radio", page: 0, rect, onValue: "1" });
    document.body.append(red, blue);

    expect(red.type).toBe("radio");
    expect(red.name).toBe("radio.color");
    expect(blue.value).toBe("1");

    red.checked = true;
    blue.checked = true;
    expect(red.checked).toBe(false); // selecting blue deselects red
  });

  it("positions the control with absolute CSS pixels", () => {
    const checkbox = control({ name: "c", kind: "checkbox", page: 0, rect, onValue: "Yes" });
    expect(checkbox.style.left).toMatch(/px$/);
    expect(checkbox.style.width).toMatch(/px$/);
  });
});
