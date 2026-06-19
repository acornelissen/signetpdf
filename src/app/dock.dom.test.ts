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
      "note-tool",
      "sign-tool",
      "markup-highlight",
      "markup-underline",
      "markup-strikethrough",
      "markup-color",
      "markup-color-input",
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

  it("is a single-tab-stop toolbar: one button at tabindex 0", () => {
    const dock = buildDock("mac");
    const stops = [...dock.querySelectorAll("button")].filter((b) => b.tabIndex === 0);
    expect(stops).toHaveLength(1);
    // The first enabled button (Open) carries the tab stop; disabled ones don't.
    expect(stops[0]?.id).toBe("open");
  });

  it("provides a hidden overflow menu mapping items to dock actions", () => {
    const dock = buildDock("mac");
    const more = dock.querySelector<HTMLButtonElement>("#dock-more");
    expect(more?.hidden).toBe(true); // shown only on a narrow window
    expect(more?.getAttribute("aria-haspopup")).toBe("true");
    const actions = [...dock.querySelectorAll<HTMLElement>(".dock-menu-item")].map(
      (item) => item.dataset.action,
    );
    expect(actions).toEqual(["save-as", "export-flat"]);
  });

  it("arrow keys move focus across buttons, skipping disabled ones", () => {
    const dock = buildDock("mac");
    document.body.append(dock);
    const open = dock.querySelector<HTMLButtonElement>("#open")!;
    open.focus();
    dock.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    // Next enabled after Open is Save (Save As/Export are enabled too; Save is next).
    expect(document.activeElement?.id).toBe("save");
    dock.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(document.activeElement?.id).toBe("zoom-fit");
    dock.remove();
  });
});
