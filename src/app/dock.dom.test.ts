// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildDock } from "./dock";

describe("buildDock", () => {
  it("is a toolbar landmark", () => {
    const dock = buildDock("mac");
    expect(dock.getAttribute("role")).toBe("toolbar");
    expect(dock.getAttribute("aria-label")).toBe("Toolbar");
  });

  it("exposes every action by the id main.ts wires", () => {
    const dock = buildDock("mac");
    for (const id of [
      "open",
      "save",
      "save-as",
      "export-flat",
      "text-tool",
      "sign-tool",
      "undo",
      "redo",
      "zoom-out",
      "zoom-in",
      "zoom-fit",
      "zoom-level",
      "page-indicator",
    ]) {
      expect(dock.querySelector(`#${id}`), id).not.toBeNull();
    }
  });

  it("marks toggle tools with aria-pressed and disables history initially", () => {
    const dock = buildDock("mac");
    expect(dock.querySelector("#text-tool")?.getAttribute("aria-pressed")).toBe("false");
    expect(dock.querySelector<HTMLButtonElement>("#undo")?.disabled).toBe(true);
    expect(dock.querySelector<HTMLButtonElement>("#redo")?.disabled).toBe(true);
  });

  it("formats tooltips with the platform modifier", () => {
    expect(buildDock("mac").querySelector("#save")?.getAttribute("data-tip")).toBe("Save  ⌘S");
    expect(buildDock("other").querySelector("#save")?.getAttribute("data-tip")).toBe(
      "Save  Ctrl+S",
    );
    expect(buildDock("mac").querySelector("#save-as")?.getAttribute("data-tip")).toBe(
      "Save as  ⇧⌘S",
    );
  });
});
