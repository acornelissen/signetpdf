// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { PageGeometry, TextBox } from "../model/document";
import { userSpacePoint } from "../model/geometry";
import {
  bindTextBoxControl,
  bindTextBoxDelete,
  bindTextBoxDrag,
  bindTextBoxResize,
  buildTextBoxControl,
  textBoxInput,
} from "./overlay";

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
    bold: false,
    italic: false,
    color: "#000000",
    align: "left",
    family: "sans",
    ...overrides,
  };
}

/** A pointer-like event jsdom can construct (MouseEvent carries clientX/Y). */
function pointer(type: string, clientX: number, clientY: number): MouseEvent {
  return new MouseEvent(type, { clientX, clientY, bubbles: true });
}

/** A pointer event with Alt held, to exercise the snap-bypass path. */
function altPointer(type: string, clientX: number, clientY: number): MouseEvent {
  return new MouseEvent(type, { clientX, clientY, bubbles: true, altKey: true });
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

  it("reflects the box formatting on the textarea", () => {
    const container = buildTextBoxControl(
      box({ bold: true, italic: true, color: "#cc0000", align: "center" }),
      page,
      viewport,
    );
    const input = textBoxInput(container);
    expect(input.style.fontWeight).toBe("700");
    expect(input.style.fontStyle).toBe("italic");
    expect(input.style.textAlign).toBe("center");
    expect(input.style.color).toBe("rgb(204, 0, 0)");
  });

  it("maps the font family to a generic CSS family on the textarea", () => {
    expect(textBoxInput(buildTextBoxControl(box(), page, viewport)).style.fontFamily).toBe(
      "sans-serif",
    );
    expect(
      textBoxInput(buildTextBoxControl(box({ family: "serif" }), page, viewport)).style.fontFamily,
    ).toBe("serif");
    expect(
      textBoxInput(buildTextBoxControl(box({ family: "mono" }), page, viewport)).style.fontFamily,
    ).toBe("monospace");
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

  it("snaps the committed origin to the grid when snapping is enabled", () => {
    const original = box();
    const container = buildTextBoxControl(original, page, viewport);
    const moves: TextBox[] = [];
    // An empty sibling list still enables grid snapping.
    bindTextBoxDrag(container, original, page, viewport, (updated) => moves.push(updated), []);

    const grip = container.querySelector<HTMLElement>(".text-box-grip");
    grip?.dispatchEvent(pointer("pointerdown", 10, 10));
    window.dispatchEvent(pointer("pointermove", 110, 50));
    window.dispatchEvent(pointer("pointerup", 110, 50));

    // Raw move lands at x172; the 10pt grid pulls it to 170.
    expect(moves[0]?.origin.x).toBeCloseTo(170);
    expect(moves[0]?.origin.y).toBeCloseTo(660);
  });

  it("snaps a moved box's left edge to a neighbour's left edge", () => {
    const original = box();
    const container = buildTextBoxControl(original, page, viewport);
    const moves: TextBox[] = [];
    // Neighbour's left edge at x171; a raw move to x172 aligns the left edges
    // (1pt away, beating the grid pull to 170).
    const neighbour = { x: 171, y: 100, width: 50, height: 50 };
    bindTextBoxDrag(container, original, page, viewport, (updated) => moves.push(updated), [
      neighbour,
    ]);

    const grip = container.querySelector<HTMLElement>(".text-box-grip");
    grip?.dispatchEvent(pointer("pointerdown", 10, 10));
    window.dispatchEvent(pointer("pointermove", 110, 50));
    window.dispatchEvent(pointer("pointerup", 110, 50));

    expect(moves[0]?.origin.x).toBeCloseTo(171);
  });

  it("bypasses snapping while Alt is held on release", () => {
    const original = box();
    const container = buildTextBoxControl(original, page, viewport);
    const moves: TextBox[] = [];
    bindTextBoxDrag(container, original, page, viewport, (updated) => moves.push(updated), []);

    const grip = container.querySelector<HTMLElement>(".text-box-grip");
    grip?.dispatchEvent(pointer("pointerdown", 10, 10));
    window.dispatchEvent(pointer("pointermove", 110, 50));
    window.dispatchEvent(altPointer("pointerup", 110, 50));

    // Unsnapped: the raw drag result is kept for fine control.
    expect(moves[0]?.origin.x).toBeCloseTo(172);
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

describe("text box delete", () => {
  it("removes exactly the selected box when its delete button is clicked", () => {
    const original = box({ id: "keep-me" });
    const container = buildTextBoxControl(original, page, viewport);
    const deleted: string[] = [];
    bindTextBoxDelete(container, original, (id) => deleted.push(id));

    const button = container.querySelector<HTMLButtonElement>(".text-box-delete");
    expect(button?.getAttribute("aria-label")).toBe("Delete text annotation");
    button?.click();

    expect(deleted).toEqual(["keep-me"]);
  });
});

describe("text box resize", () => {
  it("commits a larger box after dragging the resize handle out", () => {
    // box() spans screen (72,72)-(312,92) at scale 1 (240 wide, 20 tall).
    const original = box();
    const container = buildTextBoxControl(original, page, viewport);
    const resizes: TextBox[] = [];
    bindTextBoxResize(container, original, page, viewport, (updated) => resizes.push(updated));

    const handle = container.querySelector<HTMLElement>(".text-box-resize");
    handle?.dispatchEvent(pointer("pointerdown", 312, 92));
    window.dispatchEvent(pointer("pointermove", 352, 112));
    window.dispatchEvent(pointer("pointerup", 352, 112));

    // Drag handle right 40 / down 20 at scale 1: width +40, height +20.
    expect(resizes).toHaveLength(1);
    expect(resizes[0]?.width).toBeCloseTo(280);
    expect(resizes[0]?.height).toBeCloseTo(40);
  });

  it("snaps the resized edge to the grid when snapping is enabled", () => {
    const original = box();
    const container = buildTextBoxControl(original, page, viewport);
    const resizes: TextBox[] = [];
    bindTextBoxResize(container, original, page, viewport, (updated) => resizes.push(updated), []);

    const handle = container.querySelector<HTMLElement>(".text-box-resize");
    handle?.dispatchEvent(pointer("pointerdown", 312, 92));
    window.dispatchEvent(pointer("pointermove", 352, 112));
    window.dispatchEvent(pointer("pointerup", 352, 112));

    // Right edge lands at user-x 352, snapped to 350: width 350-72 = 278.
    expect(resizes[0]?.width).toBeCloseTo(278);
    expect(resizes[0]?.height).toBeCloseTo(40);
  });
});
