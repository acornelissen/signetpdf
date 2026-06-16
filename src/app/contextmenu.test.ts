// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildMenuItems, clampMenuPosition, classifyContextTarget } from "./contextmenu";

/** Build a detached element tree and return the deepest child to right-click. */
function tree(html: string): Element {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host.querySelector("[data-target]") ?? host.firstElementChild!;
}

describe("classifyContextTarget", () => {
  it("leaves editable inputs to the native menu", () => {
    const input = tree(`<input data-target />`);
    const textarea = tree(`<textarea data-target></textarea>`);
    const editable = tree(`<div contenteditable><span data-target>hi</span></div>`);
    expect(classifyContextTarget(input, false)).toEqual({ kind: "editable" });
    expect(classifyContextTarget(textarea, false)).toEqual({ kind: "editable" });
    expect(classifyContextTarget(editable, false)).toEqual({ kind: "editable" });
  });

  it("offers the selection menu when text is selected, outranking the page", () => {
    const span = tree(`<div data-page-index="2"><span data-target>word</span></div>`);
    expect(classifyContextTarget(span, true)).toEqual({ kind: "selection" });
  });

  it("keeps the native menu for an editable target even with a selection", () => {
    const input = tree(`<input data-target />`);
    expect(classifyContextTarget(input, true)).toEqual({ kind: "editable" });
  });

  it("classifies a placed annotation by its kind and id", () => {
    const textBox = tree(
      `<div class="text-box" data-annotation-id="t1" data-annotation-kind="text"><span data-target></span></div>`,
    );
    const stamp = tree(
      `<div data-annotation-id="s1" data-annotation-kind="signature"><span data-target></span></div>`,
    );
    expect(classifyContextTarget(textBox, false)).toEqual({
      kind: "annotation",
      annotationKind: "text",
      id: "t1",
    });
    expect(classifyContextTarget(stamp, false)).toEqual({
      kind: "annotation",
      annotationKind: "signature",
      id: "s1",
    });
  });

  it("classifies a bare page click by page index", () => {
    const overlay = tree(`<div data-page-index="3"><div data-target></div></div>`);
    expect(classifyContextTarget(overlay, false)).toEqual({ kind: "page", page: 3 });
  });

  it("treats app chrome as suppress-only", () => {
    const chrome = tree(`<div class="dock"><button data-target>Save</button></div>`);
    expect(classifyContextTarget(chrome, false)).toEqual({ kind: "chrome" });
  });

  it("treats a null target as chrome", () => {
    expect(classifyContextTarget(null, false)).toEqual({ kind: "chrome" });
  });
});

describe("buildMenuItems", () => {
  it("offers Copy for a selection", () => {
    expect(buildMenuItems({ kind: "selection" })).toEqual([{ label: "Copy", action: "copy" }]);
  });

  it("offers Edit and Delete for a text box", () => {
    expect(buildMenuItems({ kind: "annotation", annotationKind: "text", id: "t1" })).toEqual([
      { label: "Edit", action: "edit-annotation" },
      { label: "Delete", action: "delete-annotation" },
    ]);
  });

  it("offers only Delete for a signature stamp", () => {
    expect(buildMenuItems({ kind: "annotation", annotationKind: "signature", id: "s1" })).toEqual([
      { label: "Delete", action: "delete-annotation" },
    ]);
  });

  it("offers placement and zoom actions for a page", () => {
    expect(buildMenuItems({ kind: "page", page: 0 })).toEqual([
      { label: "Add text here", action: "add-text" },
      { label: "Add signature here", action: "add-signature" },
      { label: "Fit width", action: "fit-width" },
      { label: "Reset to 100%", action: "reset-zoom" },
    ]);
  });

  it("offers nothing for editable or chrome targets", () => {
    expect(buildMenuItems({ kind: "editable" })).toEqual([]);
    expect(buildMenuItems({ kind: "chrome" })).toEqual([]);
  });
});

describe("clampMenuPosition", () => {
  const viewport = { width: 1000, height: 800 };
  const size = { width: 200, height: 150 };

  it("keeps the requested point when the menu fits", () => {
    expect(clampMenuPosition({ x: 100, y: 100 }, size, viewport)).toEqual({ x: 100, y: 100 });
  });

  it("shifts left and up so the menu stays within the viewport", () => {
    expect(clampMenuPosition({ x: 950, y: 750 }, size, viewport)).toEqual({ x: 800, y: 650 });
  });

  it("never positions off the top-left edge", () => {
    const tall = { width: 200, height: 900 };
    expect(clampMenuPosition({ x: 5, y: 700 }, tall, viewport)).toEqual({ x: 5, y: 0 });
  });
});
