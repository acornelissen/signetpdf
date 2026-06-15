// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { iconButton } from "./icons";

describe("iconButton", () => {
  it("builds an accessible button with a label, id and glyph", () => {
    const button = iconButton("open", "Open PDF", "open");
    expect(button.tagName).toBe("BUTTON");
    expect(button.type).toBe("button");
    expect(button.id).toBe("open");
    expect(button.className).toContain("btn-icon");
    expect(button.getAttribute("aria-label")).toBe("Open PDF");
    expect(button.querySelector("svg")).not.toBeNull();
  });

  it("appends the keyboard shortcut to the tooltip but not the label", () => {
    const button = iconButton("save", "Save", "save", { shortcut: "⌘S" });
    expect(button.getAttribute("aria-label")).toBe("Save");
    expect(button.getAttribute("data-tip")).toBe("Save  ⌘S");
  });

  it("appends extra classes after btn-icon", () => {
    const button = iconButton("more", "More", "more", { className: "dock-overflow" });
    expect(button.className).toBe("btn-icon dock-overflow");
  });
});
