import { describe, expect, it } from "vitest";
import { icon, type IconName } from "./icons";

describe("icon", () => {
  it("renders an inline SVG inheriting currentColor (CSP-safe, themeable)", () => {
    const svg = icon("save");
    expect(svg).toContain("<svg");
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('stroke="currentColor"');
    // Decorative: the accessible name comes from the button, not the glyph.
    expect(svg).toContain('aria-hidden="true"');
  });

  it("throws on an unknown icon name so typos fail loudly", () => {
    // @ts-expect-error deliberately invalid name
    expect(() => icon("not-an-icon")).toThrow();
  });

  it("exposes every dock and toast icon", () => {
    const names: IconName[] = [
      "open",
      "save",
      "save-as",
      "export",
      "text",
      "sign",
      "undo",
      "redo",
      "minus",
      "plus",
      "fit-width",
      "more",
      "info",
      "success",
      "error",
      "dismiss",
      "document",
      "search",
      "chevron-up",
      "chevron-down",
    ];
    for (const name of names) {
      expect(icon(name)).toContain("<svg");
    }
  });
});
