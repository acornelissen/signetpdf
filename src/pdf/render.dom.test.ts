// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { clearPageCanvas, createPagePlaceholders } from "./render";

describe("createPagePlaceholders", () => {
  it("creates one sized, empty placeholder per page", () => {
    const mount = document.createElement("div");
    const pages = createPagePlaceholders(mount, [
      { width: 600, height: 800 },
      { width: 400, height: 300 },
    ]);

    expect(pages).toHaveLength(2);
    expect(mount.querySelectorAll(".page-container")).toHaveLength(2);
    expect(pages[0]?.container.style.width).toBe("600px");
    expect(pages[0]?.container.style.height).toBe("800px");
    expect(pages[1]?.container.style.width).toBe("400px");
    // Overlays start empty; canvases are rendered on demand when near the viewport.
    expect(pages[0]?.overlay.childElementCount).toBe(0);
    expect(pages[0]?.canvas.className).toBe("page");
    // A text layer sits between the canvas and the overlay for selection.
    expect(pages[0]?.text.className).toBe("textLayer");
    const children = [...(pages[0]?.container.children ?? [])].map((el) => el.className);
    expect(children).toEqual(["page", "textLayer", "overlay"]);
  });

  it("replaces existing content on each call", () => {
    const mount = document.createElement("div");
    createPagePlaceholders(mount, [{ width: 10, height: 10 }]);
    createPagePlaceholders(mount, [{ width: 20, height: 20 }]);
    expect(mount.querySelectorAll(".page-container")).toHaveLength(1);
  });

  it("clearPageCanvas releases the backing store", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 800;
    clearPageCanvas(canvas);
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });
});
