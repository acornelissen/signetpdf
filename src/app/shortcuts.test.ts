import { describe, expect, it } from "vitest";
import { matchShortcut, type KeyChord } from "./shortcuts";

function chord(over: Partial<KeyChord>): KeyChord {
  return { key: "", metaKey: false, ctrlKey: false, shiftKey: false, ...over };
}

describe("matchShortcut", () => {
  it("uses Cmd on macOS and ignores Ctrl there", () => {
    expect(matchShortcut(chord({ key: "s", metaKey: true }), "mac")).toBe("save");
    expect(matchShortcut(chord({ key: "s", ctrlKey: true }), "mac")).toBeNull();
  });

  it("uses Ctrl elsewhere and ignores the Meta key", () => {
    expect(matchShortcut(chord({ key: "s", ctrlKey: true }), "other")).toBe("save");
    expect(matchShortcut(chord({ key: "s", metaKey: true }), "other")).toBeNull();
  });

  it("maps the core actions", () => {
    expect(matchShortcut(chord({ key: "o", ctrlKey: true }), "other")).toBe("open");
    expect(matchShortcut(chord({ key: "s", ctrlKey: true, shiftKey: true }), "other")).toBe(
      "save-as",
    );
    expect(matchShortcut(chord({ key: "z", ctrlKey: true }), "other")).toBe("undo");
    expect(matchShortcut(chord({ key: "z", ctrlKey: true, shiftKey: true }), "other")).toBe("redo");
    expect(matchShortcut(chord({ key: "y", ctrlKey: true }), "other")).toBe("redo");
    expect(matchShortcut(chord({ key: "=", ctrlKey: true }), "other")).toBe("zoom-in");
    expect(matchShortcut(chord({ key: "+", ctrlKey: true }), "other")).toBe("zoom-in");
    expect(matchShortcut(chord({ key: "-", ctrlKey: true }), "other")).toBe("zoom-out");
    expect(matchShortcut(chord({ key: "0", ctrlKey: true }), "other")).toBe("zoom-reset");
  });

  it("is case-insensitive on the key", () => {
    expect(matchShortcut(chord({ key: "Z", metaKey: true }), "mac")).toBe("undo");
  });

  it("returns null without the platform modifier or for unmapped keys", () => {
    expect(matchShortcut(chord({ key: "s" }), "mac")).toBeNull();
    expect(matchShortcut(chord({ key: "q", metaKey: true }), "mac")).toBeNull();
  });
});
