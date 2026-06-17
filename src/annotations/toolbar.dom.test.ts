// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { userSpacePoint } from "../model/geometry";
import type { TextBox } from "../model/document";
import { attachTextToolbar } from "./toolbar";

function box(extra: Partial<TextBox> = {}): TextBox {
  return {
    kind: "text",
    id: "t1",
    page: 0,
    origin: userSpacePoint(0, 0),
    width: 100,
    height: 20,
    text: "",
    fontSize: 12,
    bold: false,
    italic: false,
    color: "#000000",
    align: "left",
    ...extra,
  };
}

const host = () => document.createElement("div");

describe("attachTextToolbar", () => {
  it("reflects the box formatting in its controls", () => {
    const h = host();
    attachTextToolbar(
      h,
      box({ bold: true, align: "center", fontSize: 18, color: "#cc0000" }),
      vi.fn(),
    );
    expect(h.querySelector('[role="toolbar"]')).not.toBeNull();
    expect(h.querySelector<HTMLInputElement>(".ttb-size")!.value).toBe("18");
    expect(h.querySelector(".ttb-bold")!.getAttribute("aria-pressed")).toBe("true");
    expect(h.querySelector(".ttb-italic")!.getAttribute("aria-pressed")).toBe("false");
    expect(h.querySelector('[data-align="center"]')!.getAttribute("aria-pressed")).toBe("true");
    expect(h.querySelector<HTMLInputElement>(".ttb-color")!.value).toBe("#cc0000");
  });

  it("toggling bold calls onChange with the flipped flag and presses the control", () => {
    const h = host();
    const changes: TextBox[] = [];
    attachTextToolbar(h, box(), (u) => changes.push(u));
    const bold = h.querySelector<HTMLButtonElement>(".ttb-bold")!;
    bold.click();
    expect(changes.at(-1)!.bold).toBe(true);
    expect(bold.getAttribute("aria-pressed")).toBe("true");
  });

  it("choosing an alignment calls onChange and moves the pressed state", () => {
    const h = host();
    const changes: TextBox[] = [];
    attachTextToolbar(h, box(), (u) => changes.push(u));
    h.querySelector<HTMLButtonElement>('[data-align="right"]')!.click();
    expect(changes.at(-1)!.align).toBe("right");
    expect(h.querySelector('[data-align="right"]')!.getAttribute("aria-pressed")).toBe("true");
    expect(h.querySelector('[data-align="left"]')!.getAttribute("aria-pressed")).toBe("false");
  });

  it("editing the size commits a number through onChange", () => {
    const h = host();
    const changes: TextBox[] = [];
    attachTextToolbar(h, box(), (u) => changes.push(u));
    const size = h.querySelector<HTMLInputElement>(".ttb-size")!;
    size.value = "20";
    size.dispatchEvent(new Event("change", { bubbles: true }));
    expect(changes.at(-1)!.fontSize).toBe(20);
  });
});
