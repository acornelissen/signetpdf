// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { PageGeometry, TextBox } from "../model/document";
import { userSpacePoint } from "../model/geometry";
import { bindTextBoxControl, bindTextBoxDrag, buildTextBoxControl, textBoxInput } from "./overlay";

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

/** A pointer-like event jsdom can construct (MouseEvent carries clientX/Y). */
function pointer(type: string, clientX: number, clientY: number): MouseEvent {
  return new MouseEvent(type, { clientX, clientY, bubbles: true });
}

describe("buildTextBoxControl (DOM)", () => {
  it("shows the model text, carries the annotation id, and is positioned in px", () => {
    const container = buildTextBoxControl(box(), page, viewport);
    expect(container.dataset.annotationId).toBe("t1");
    expect(container.style.left).toMatch(/px$/);
    expect(container.style.width).toMatch(/px$/);
    expect(textBoxInput(container).value).toBe("hello");
  });

  it("scales the font size with the viewport", () => {
    const container = buildTextBoxControl(box({ fontSize: 12 }), page, { scale: 2 });
    expect(textBoxInput(container).style.fontSize).toBe("24px");
  });
});

describe("text box editing", () => {
  it("commits the edited text through onCommit on blur", () => {
    const original = box({ text: "hello" });
    const container = buildTextBoxControl(original, page, viewport);
    const commits: TextBox[] = [];
    bindTextBoxControl(container, original, (updated) => commits.push(updated));

    const input = textBoxInput(container);
    input.value = "hello world";
    input.dispatchEvent(new Event("blur"));

    expect(commits).toHaveLength(1);
    expect(commits[0]?.text).toBe("hello world");
    expect(commits[0]?.id).toBe("t1");
  });

  it("does not commit when the text is unchanged", () => {
    const original = box({ text: "hello" });
    const container = buildTextBoxControl(original, page, viewport);
    const commits: TextBox[] = [];
    bindTextBoxControl(container, original, (updated) => commits.push(updated));

    textBoxInput(container).dispatchEvent(new Event("blur"));

    expect(commits).toHaveLength(0);
  });

  it("cancels on Escape, reverting the field and committing nothing", () => {
    const original = box({ text: "hello" });
    const container = buildTextBoxControl(original, page, viewport);
    const commits: TextBox[] = [];
    bindTextBoxControl(container, original, (updated) => commits.push(updated));

    const input = textBoxInput(container);
    input.value = "throwaway";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    input.dispatchEvent(new Event("blur"));

    expect(input.value).toBe("hello");
    expect(commits).toHaveLength(0);
  });
});

describe("text box move", () => {
  it("commits the new origin after dragging the grip", () => {
    const original = box();
    const container = buildTextBoxControl(original, page, viewport);
    document.body.appendChild(container);
    const moves: TextBox[] = [];
    bindTextBoxDrag(container, original, page, viewport, (updated) => moves.push(updated));

    const grip = container.querySelector<HTMLElement>(".text-box-grip");
    grip?.dispatchEvent(pointer("pointerdown", 10, 10));
    window.dispatchEvent(pointer("pointermove", 110, 50));
    window.dispatchEvent(pointer("pointerup", 110, 50));

    // Drag right 100 / down 40 at scale 1: x +100, y -40 (screen y inverts).
    expect(moves).toHaveLength(1);
    expect(moves[0]?.origin.x).toBeCloseTo(172);
    expect(moves[0]?.origin.y).toBeCloseTo(660);
  });

  it("treats a grip click with no movement as not a move", () => {
    const original = box();
    const container = buildTextBoxControl(original, page, viewport);
    const moves: TextBox[] = [];
    bindTextBoxDrag(container, original, page, viewport, (updated) => moves.push(updated));

    const grip = container.querySelector<HTMLElement>(".text-box-grip");
    grip?.dispatchEvent(pointer("pointerdown", 10, 10));
    window.dispatchEvent(pointer("pointerup", 10, 10));

    expect(moves).toHaveLength(0);
  });
});
