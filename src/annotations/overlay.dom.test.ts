// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { PageGeometry, TextBox } from "../model/document";
import { userSpacePoint } from "../model/geometry";
import { bindTextBoxControl, buildTextBoxControl } from "./overlay";

const page: PageGeometry = { index: 0, width: 612, height: 792, rotation: 0 };
const viewport = { scale: 1 };

function box(overrides: Partial<TextBox> = {}): TextBox {
  return {
    kind: "text",
    id: "t1",
    page: 0,
    origin: userSpacePoint(72, 700),
    width: 240,
    height: 20,
    text: "hello",
    fontSize: 12,
    ...overrides,
  };
}

function build(b: TextBox): HTMLTextAreaElement {
  const element = buildTextBoxControl(b, page, viewport);
  if (!(element instanceof HTMLTextAreaElement)) {
    throw new Error("expected a textarea");
  }
  return element;
}

describe("buildTextBoxControl (DOM)", () => {
  it("shows the model text, carries the annotation id, and is positioned in px", () => {
    const textarea = build(box());
    expect(textarea.value).toBe("hello");
    expect(textarea.dataset.annotationId).toBe("t1");
    expect(textarea.style.left).toMatch(/px$/);
    expect(textarea.style.width).toMatch(/px$/);
  });

  it("scales the font size with the viewport", () => {
    const textarea = buildTextBoxControl(box({ fontSize: 12 }), page, { scale: 2 });
    expect(textarea.style.fontSize).toBe("24px");
  });
});

describe("text box editing", () => {
  it("commits the edited text through onCommit on blur", () => {
    const original = box({ text: "hello" });
    const textarea = build(original);
    const commits: TextBox[] = [];
    bindTextBoxControl(textarea, original, (updated) => commits.push(updated));

    textarea.value = "hello world";
    textarea.dispatchEvent(new Event("blur"));

    expect(commits).toHaveLength(1);
    expect(commits[0]?.text).toBe("hello world");
    expect(commits[0]?.id).toBe("t1");
  });

  it("does not commit when the text is unchanged", () => {
    const original = box({ text: "hello" });
    const textarea = build(original);
    const commits: TextBox[] = [];
    bindTextBoxControl(textarea, original, (updated) => commits.push(updated));

    textarea.dispatchEvent(new Event("blur"));

    expect(commits).toHaveLength(0);
  });

  it("cancels on Escape, reverting the field and committing nothing", () => {
    const original = box({ text: "hello" });
    const textarea = build(original);
    const commits: TextBox[] = [];
    bindTextBoxControl(textarea, original, (updated) => commits.push(updated));

    textarea.value = "throwaway";
    textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    textarea.dispatchEvent(new Event("blur"));

    expect(textarea.value).toBe("hello");
    expect(commits).toHaveLength(0);
  });
});
