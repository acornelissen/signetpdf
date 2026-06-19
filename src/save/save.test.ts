import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { addAnnotation, createModel, setFieldValue } from "../model/document";
import { userSpacePoint } from "../model/geometry";
import { loadPdfDocument } from "../pdf/document";
import { EncryptedSaveError, hexToRgb, isEncryptedPdf, saveModel } from "./save";

// A 1x1 transparent PNG; drawImage sets the displayed box, so pixel size is moot.
const PNG_1x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==";

function pngBytes(): Uint8Array {
  return new Uint8Array(Buffer.from(PNG_1x1, "base64"));
}

type Matrix = [number, number, number, number, number, number];

/** Compose two affine matrices the way a PDF `cm` operator updates the CTM. */
function multiply(m: Matrix, t: Matrix): Matrix {
  return [
    m[0] * t[0] + m[2] * t[1],
    m[1] * t[0] + m[3] * t[1],
    m[0] * t[2] + m[2] * t[3],
    m[1] * t[2] + m[3] * t[3],
    m[0] * t[4] + m[2] * t[5] + m[4],
    m[1] * t[4] + m[3] * t[5] + m[5],
  ];
}

/**
 * The full CTM in effect at each image paint on a page. pdf.js splits the
 * placement across several transform ops, so we replay them through a
 * save/restore stack to recover the composed matrix [a, b, c, d, e, f].
 */
async function imageTransforms(bytes: Uint8Array, pageNumber: number): Promise<Matrix[]> {
  const doc = await loadPdfDocument(bytes);
  const opList = await (await doc.getPage(pageNumber)).getOperatorList();
  const transforms: Matrix[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  for (let i = 0; i < opList.fnArray.length; i += 1) {
    const fn = opList.fnArray[i];
    if (fn === OPS.save) {
      stack.push(ctm);
    } else if (fn === OPS.restore) {
      ctm = stack.pop() ?? ctm;
    } else if (fn === OPS.transform) {
      ctm = multiply(ctm, opList.argsArray[i] as Matrix);
    } else if (fn === OPS.paintImageXObject) {
      transforms.push(ctm);
    }
  }
  return transforms;
}

/** A filled rectangle recovered from a page's content stream. */
interface FilledRect {
  color: string | null; // most recent fill colour as a hex string
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Every filled path on a page, with its fill colour and absolute (user-space)
 * bounding box. pdf-lib draws a rectangle as a translate `cm` followed by a
 * `constructPath` whose local bbox is `[0, 0, w, h]`; we replay the transform
 * stack to recover the absolute box, mirroring imageTransforms. Used to verify
 * text-markup quads (highlight/underline/strikethrough) survive a round-trip.
 */
async function filledRects(bytes: Uint8Array, pageNumber: number): Promise<FilledRect[]> {
  const doc = await loadPdfDocument(bytes);
  const opList = await (await doc.getPage(pageNumber)).getOperatorList();
  const rects: FilledRect[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  let fill: string | null = null;
  for (let i = 0; i < opList.fnArray.length; i += 1) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i] as unknown;
    if (fn === OPS.save) {
      stack.push(ctm);
    } else if (fn === OPS.restore) {
      ctm = stack.pop() ?? ctm;
    } else if (fn === OPS.transform) {
      ctm = multiply(ctm, args as Matrix);
    } else if (fn === OPS.setFillRGBColor) {
      fill = (args as string[])[0] ?? null;
    } else if (fn === OPS.constructPath) {
      const minMax = (args as [number, Record<number, number>[], Record<number, number>])[2];
      const [c0, c1, c2, c3] = [minMax[0]!, minMax[1]!, minMax[2]!, minMax[3]!];
      const p1x = ctm[0] * c0 + ctm[2] * c1 + ctm[4];
      const p1y = ctm[1] * c0 + ctm[3] * c1 + ctm[5];
      const p2x = ctm[0] * c2 + ctm[2] * c3 + ctm[4];
      const p2y = ctm[1] * c2 + ctm[3] * c3 + ctm[5];
      rects.push({
        color: fill,
        x: Math.min(p1x, p2x),
        y: Math.min(p1y, p2y),
        width: Math.abs(p2x - p1x),
        height: Math.abs(p2y - p1y),
      });
    }
  }
  return rects;
}

interface PdfWidget {
  subtype?: string;
  fieldName?: string;
  fieldValue?: string | string[] | null;
}

interface PdfTextItem {
  str: string;
  transform: number[];
}

function fontBytes(): Uint8Array {
  return new Uint8Array(
    readFileSync(fileURLToPath(new URL("../assets/fonts/NotoSans-Regular.ttf", import.meta.url))),
  );
}

function serifBytes(weight: "Regular" | "Bold"): Uint8Array {
  return new Uint8Array(
    readFileSync(
      fileURLToPath(new URL(`../assets/fonts/NotoSerif-${weight}.ttf`, import.meta.url)),
    ),
  );
}

/** Extract text items (with baseline position) from a saved page via pdf.js. */
async function textItems(bytes: Uint8Array, pageNumber: number): Promise<PdfTextItem[]> {
  const doc = await loadPdfDocument(bytes);
  const content = await (await doc.getPage(pageNumber)).getTextContent();
  return content.items as unknown as PdfTextItem[];
}

/** All visible text across every page, concatenated. */
async function allText(bytes: Uint8Array): Promise<string> {
  const doc = await loadPdfDocument(bytes);
  let text = "";
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const content = await (await doc.getPage(pageNumber)).getTextContent();
    text += (content.items as unknown as PdfTextItem[]).map((item) => item.str).join(" ");
  }
  return text;
}

/** Read each field's persisted value from the saved bytes via pdf.js. */
async function fieldValues(bytes: Uint8Array): Promise<Record<string, string | null>> {
  const doc = await loadPdfDocument(bytes);
  const result: Record<string, string | null> = {};
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const widgets = (await (
      await doc.getPage(pageNumber)
    ).getAnnotations()) as unknown as PdfWidget[];
    for (const widget of widgets) {
      if (widget.subtype !== "Widget" || !widget.fieldName || widget.fieldName in result) {
        continue;
      }
      const value = Array.isArray(widget.fieldValue)
        ? (widget.fieldValue[0] ?? null)
        : widget.fieldValue;
      result[widget.fieldName] = value ?? null;
    }
  }
  return result;
}

interface PdfTextAnnotation {
  subtype?: string;
  contentsObj?: { str?: string };
  rect?: number[];
}

/** Read the /Text (sticky-note) annotations from a saved page via pdf.js. */
async function noteAnnotations(
  bytes: Uint8Array,
  pageNumber: number,
): Promise<{ contents: string; rect: number[] }[]> {
  const doc = await loadPdfDocument(bytes);
  const list = (await (
    await doc.getPage(pageNumber)
  ).getAnnotations()) as unknown as PdfTextAnnotation[];
  return list
    .filter((a) => a.subtype === "Text")
    .map((a) => ({ contents: a.contentsObj?.str ?? "", rect: a.rect ?? [] }));
}

function fixture(name: string): Uint8Array {
  return new Uint8Array(
    readFileSync(fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url))),
  );
}

async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await loadPdfDocument(bytes)).numPages;
}

async function fieldNames(bytes: Uint8Array): Promise<string[]> {
  const doc = await loadPdfDocument(bytes);
  const fields = await doc.getFieldObjects();
  return Object.keys(fields ?? {}).sort();
}

// Encrypted fixtures are excluded here; encrypted handling is m1-12.
const nonXfaFixtures = ["two-page.pdf", "rotated-90.pdf", "acroform.pdf", "linearized.pdf"];

describe("saveModel empty round-trip", () => {
  it.each(nonXfaFixtures)("preserves page count and AcroForm field set for %s", async (name) => {
    const original = fixture(name);
    const saved = await saveModel(createModel(original));

    expect(await pageCount(saved)).toBe(await pageCount(original));
    expect(await fieldNames(saved)).toEqual(await fieldNames(original));
  });

  it("writes every field type and they persist on re-open", async () => {
    let model = createModel(fixture("acroform.pdf"));
    model = setFieldValue(model, "text.fullName", "Ada Lovelace");
    model = setFieldValue(model, "check.agree", true);
    model = setFieldValue(model, "radio.color", "1");
    model = setFieldValue(model, "choice.city", "Paris");
    model = setFieldValue(model, "choice.fruit", "Pear");

    const values = await fieldValues(await saveModel(model));

    expect(values["text.fullName"]).toBe("Ada Lovelace");
    expect(values["check.agree"]).toBe("Yes");
    expect(values["radio.color"]).toBe("1");
    expect(values["choice.city"]).toBe("Paris");
    expect(values["choice.fruit"]).toBe("Pear");
  });

  it("draws a text box whose content and baseline position survive re-open", async () => {
    let model = createModel(fixture("two-page.pdf"));
    model = addAnnotation(model, {
      kind: "text",
      page: 0,
      origin: userSpacePoint(72, 700),
      width: 220,
      height: 24,
      text: "Hello kůň",
      fontSize: 14,
      bold: false,
      italic: false,
      color: "#000000",
      align: "left",
      family: "sans",
    });

    const items = await textItems(
      await saveModel(model, { fonts: { sans: { regular: fontBytes() } } }),
      1,
    );

    const joined = items.map((item) => item.str).join("");
    expect(joined).toContain("Hello kůň");
    const drawn = items.find((item) => item.str.includes("Hello"));
    expect(drawn?.transform[4]).toBeCloseTo(72, 0);
    expect(drawn?.transform[5]).toBeCloseTo(700, 0);
  });

  it("draws each text box on its own page across a multi-page document", async () => {
    let model = createModel(fixture("two-page.pdf"));
    model = addAnnotation(model, {
      kind: "text",
      page: 0,
      origin: userSpacePoint(72, 700),
      width: 200,
      height: 24,
      text: "FirstPageNote",
      fontSize: 12,
      bold: false,
      italic: false,
      color: "#000000",
      align: "left",
      family: "sans",
    });
    model = addAnnotation(model, {
      kind: "text",
      page: 1,
      origin: userSpacePoint(72, 700),
      width: 200,
      height: 24,
      text: "SecondPageNote",
      fontSize: 12,
      bold: false,
      italic: false,
      color: "#000000",
      align: "left",
      family: "sans",
    });

    const saved = await saveModel(model, { fonts: { sans: { regular: fontBytes() } } });
    const page1 = (await textItems(saved, 1)).map((i) => i.str).join("");
    const page2 = (await textItems(saved, 2)).map((i) => i.str).join("");

    expect(page1).toContain("FirstPageNote");
    expect(page1).not.toContain("SecondPageNote");
    expect(page2).toContain("SecondPageNote");
    expect(page2).not.toContain("FirstPageNote");
  });

  it("right-aligns a line further along x than left alignment", async () => {
    const base = {
      kind: "text",
      page: 0,
      origin: userSpacePoint(72, 700),
      width: 300,
      height: 24,
      text: "Hi",
      fontSize: 14,
      bold: false,
      italic: false,
      color: "#000000",
      family: "sans",
    } as const;
    const leftModel = addAnnotation(createModel(fixture("two-page.pdf")), {
      ...base,
      align: "left",
    });
    const rightModel = addAnnotation(createModel(fixture("two-page.pdf")), {
      ...base,
      align: "right",
    });

    const drawnX = async (model: typeof leftModel) =>
      (
        await textItems(await saveModel(model, { fonts: { sans: { regular: fontBytes() } } }), 1)
      ).find((i) => i.str.includes("Hi"))?.transform[4];

    const leftX = await drawnX(leftModel);
    const rightX = await drawnX(rightModel);
    expect(leftX).toBeCloseTo(72, 0); // left edge at the origin
    expect(rightX).toBeGreaterThan(leftX!); // right alignment pushes it along x
  });

  it("draws a serif text box when the serif family is supplied", async () => {
    let model = createModel(fixture("two-page.pdf"));
    model = addAnnotation(model, {
      kind: "text",
      page: 0,
      origin: userSpacePoint(72, 700),
      width: 220,
      height: 24,
      text: "Serif line",
      fontSize: 14,
      bold: true,
      italic: false,
      color: "#000000",
      align: "left",
      family: "serif",
    });

    const saved = await saveModel(model, {
      fonts: {
        sans: { regular: fontBytes() },
        serif: {
          regular: serifBytes("Regular"),
          bold: serifBytes("Bold"),
        },
      },
    });

    expect((await textItems(saved, 1)).map((i) => i.str).join("")).toContain("Serif line");
  });
});

describe("hexToRgb", () => {
  it("parses #rrggbb into 0..1 components", () => {
    expect(hexToRgb("#cc0000")).toEqual({ r: 0.8, g: 0, b: 0 });
    expect(hexToRgb("#ffffff")).toEqual({ r: 1, g: 1, b: 1 });
  });

  it("falls back to black for an unparseable value", () => {
    expect(hexToRgb("nope")).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("embeds a signature image on its page at the expected box", async () => {
    let model = createModel(fixture("two-page.pdf"));
    model = addAnnotation(model, {
      kind: "signature",
      page: 1,
      origin: userSpacePoint(100, 200),
      width: 120,
      height: 60,
      pngBytes: pngBytes(),
    });

    const saved = await saveModel(model);

    expect(await imageTransforms(saved, 1)).toHaveLength(0); // nothing on page 1
    const onPage2 = await imageTransforms(saved, 2);
    expect(onPage2).toHaveLength(1);
    const [a, , , d, e, f] = onPage2[0] ?? ([0, 0, 0, 0, 0, 0] as Matrix);
    expect(a).toBeCloseTo(120, 0); // width
    expect(d).toBeCloseTo(60, 0); // height
    expect(e).toBeCloseTo(100, 0); // origin x
    expect(f).toBeCloseTo(200, 0); // origin y
  });

  it("draws a highlight as a full-quad filled rectangle that survives re-open", async () => {
    let model = createModel(fixture("two-page.pdf"));
    model = addAnnotation(model, {
      kind: "markup",
      page: 0,
      style: "highlight",
      color: "#ff0000",
      quads: [{ origin: userSpacePoint(72, 700), width: 120, height: 12 }],
    });

    const rects = await filledRects(await saveModel(model), 1);
    const mark = rects.find((r) => r.color?.toLowerCase() === "#ff0000");
    expect(mark).toBeDefined();
    expect(mark?.x).toBeCloseTo(72, 0);
    expect(mark?.y).toBeCloseTo(700, 0);
    expect(mark?.width).toBeCloseTo(120, 0);
    expect(mark?.height).toBeCloseTo(12, 0); // full quad height
  });

  it("draws an underline as a thin rectangle along the bottom of the quad", async () => {
    let model = createModel(fixture("two-page.pdf"));
    model = addAnnotation(model, {
      kind: "markup",
      page: 0,
      style: "underline",
      color: "#0000ff",
      quads: [{ origin: userSpacePoint(72, 700), width: 120, height: 12 }],
    });

    const mark = (await filledRects(await saveModel(model), 1)).find(
      (r) => r.color?.toLowerCase() === "#0000ff",
    );
    expect(mark).toBeDefined();
    expect(mark?.x).toBeCloseTo(72, 0);
    expect(mark?.width).toBeCloseTo(120, 0);
    expect(mark?.height).toBeLessThan(3); // thin rule, not the full quad
    expect(mark?.y).toBeCloseTo(700, 0); // sits at the quad's bottom
  });

  it("draws a strikethrough rule across the vertical middle of the quad", async () => {
    let model = createModel(fixture("two-page.pdf"));
    model = addAnnotation(model, {
      kind: "markup",
      page: 0,
      style: "strikethrough",
      color: "#00aa00",
      quads: [{ origin: userSpacePoint(72, 700), width: 120, height: 12 }],
    });

    const mark = (await filledRects(await saveModel(model), 1)).find(
      (r) => r.color?.toLowerCase() === "#00aa00",
    );
    expect(mark).toBeDefined();
    expect(mark?.height).toBeLessThan(3);
    expect(mark?.y).toBeGreaterThan(703); // around the middle (700 + 12/2)
    expect(mark?.y).toBeLessThan(709);
  });

  it("draws one rectangle per quad for a multi-line selection", async () => {
    let model = createModel(fixture("two-page.pdf"));
    model = addAnnotation(model, {
      kind: "markup",
      page: 0,
      style: "highlight",
      color: "#ff00ff",
      quads: [
        { origin: userSpacePoint(72, 700), width: 120, height: 12 },
        { origin: userSpacePoint(72, 684), width: 90, height: 12 },
      ],
    });

    const marks = (await filledRects(await saveModel(model), 1)).filter(
      (r) => r.color?.toLowerCase() === "#ff00ff",
    );
    expect(marks).toHaveLength(2);
  });

  it("draws markup only on its own page", async () => {
    let model = createModel(fixture("two-page.pdf"));
    model = addAnnotation(model, {
      kind: "markup",
      page: 1,
      style: "highlight",
      color: "#ff0000",
      quads: [{ origin: userSpacePoint(72, 700), width: 120, height: 12 }],
    });

    const saved = await saveModel(model);
    expect((await filledRects(saved, 1)).some((r) => r.color?.toLowerCase() === "#ff0000")).toBe(
      false,
    );
    expect((await filledRects(saved, 2)).some((r) => r.color?.toLowerCase() === "#ff0000")).toBe(
      true,
    );
  });

  it("writes a sticky note as a /Text annotation whose comment survives re-open", async () => {
    let model = createModel(fixture("two-page.pdf"));
    model = addAnnotation(model, {
      kind: "note",
      page: 0,
      origin: userSpacePoint(100, 650),
      text: "review this paragraph",
    });

    const notes = await noteAnnotations(await saveModel(model), 1);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.contents).toBe("review this paragraph");
    expect(notes[0]?.rect[0]).toBeCloseTo(100, 0); // anchored at the origin x
  });

  it("places each note on its own page", async () => {
    let model = createModel(fixture("two-page.pdf"));
    model = addAnnotation(model, {
      kind: "note",
      page: 1,
      origin: userSpacePoint(100, 650),
      text: "second page note",
    });

    const saved = await saveModel(model);
    expect(await noteAnnotations(saved, 1)).toHaveLength(0);
    expect((await noteAnnotations(saved, 2))[0]?.contents).toBe("second page note");
  });

  it("flatten bakes field values into content and removes editable fields", async () => {
    let model = createModel(fixture("acroform.pdf"));
    model = setFieldValue(model, "text.fullName", "Ada Lovelace");

    const flattened = await saveModel(model, { flatten: true });

    expect(await fieldNames(flattened)).toHaveLength(0); // no editable AcroForm
    expect(await allText(flattened)).toContain("Ada Lovelace"); // value baked in
  });

  it("keeps fields editable on a normal (non-flatten) save", async () => {
    let model = createModel(fixture("acroform.pdf"));
    model = setFieldValue(model, "text.fullName", "Ada Lovelace");

    const saved = await saveModel(model);

    expect((await fieldNames(saved)).length).toBeGreaterThan(0); // still editable
  });

  it("refuses to save an encrypted PDF rather than emit a broken or stripped file", async () => {
    await expect(saveModel(createModel(fixture("encrypted-empty.pdf")))).rejects.toBeInstanceOf(
      EncryptedSaveError,
    );
  });

  it("detects whether a PDF is encrypted", async () => {
    expect(await isEncryptedPdf(fixture("encrypted-empty.pdf"))).toBe(true);
    expect(await isEncryptedPdf(fixture("two-page.pdf"))).toBe(false);
  });

  it("returns fresh bytes without touching the source", async () => {
    const original = fixture("two-page.pdf");
    const model = createModel(original);
    const saved = await saveModel(model);
    expect(saved).toBeInstanceOf(Uint8Array);
    expect(model.sourceBytes).toBe(original);
  });
});
