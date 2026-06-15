import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { addAnnotation, createModel, setFieldValue } from "../model/document";
import { userSpacePoint } from "../model/geometry";
import { loadPdfDocument } from "../pdf/document";
import { saveModel } from "./save";

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
    });

    const items = await textItems(await saveModel(model, { fontBytes: fontBytes() }), 1);

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
    });
    model = addAnnotation(model, {
      kind: "text",
      page: 1,
      origin: userSpacePoint(72, 700),
      width: 200,
      height: 24,
      text: "SecondPageNote",
      fontSize: 12,
    });

    const saved = await saveModel(model, { fontBytes: fontBytes() });
    const page1 = (await textItems(saved, 1)).map((i) => i.str).join("");
    const page2 = (await textItems(saved, 2)).map((i) => i.str).join("");

    expect(page1).toContain("FirstPageNote");
    expect(page1).not.toContain("SecondPageNote");
    expect(page2).toContain("SecondPageNote");
    expect(page2).not.toContain("FirstPageNote");
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

  it("returns fresh bytes without touching the source", async () => {
    const original = fixture("two-page.pdf");
    const model = createModel(original);
    const saved = await saveModel(model);
    expect(saved).toBeInstanceOf(Uint8Array);
    expect(model.sourceBytes).toBe(original);
  });
});
