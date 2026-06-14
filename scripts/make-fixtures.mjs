// Generates the PDF test fixtures used by the suite. Run with `node
// scripts/make-fixtures.mjs`. Hand-rolls minimal PDFs with a correct xref
// table so the bytes are deterministic and dependency-free. The richer
// "awkward corpus" (rotation, AcroForm, XFA) arrives with m1-10.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "fixtures");

/**
 * Assemble a PDF from a list of object bodies (object N is index N-1), with a
 * correct cross-reference table and trailer.
 * @param {string[]} objects body text for objects 1..N
 * @param {number} rootObj object number of the document catalog
 */
function buildPdf(objects, rootObj) {
  const header = "%PDF-1.7\n%\xff\xff\xff\xff\n";
  let body = header;
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const xrefStart = body.length;
  const count = objects.length + 1;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${count} /Root ${rootObj} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(body + xref + trailer, "latin1");
}

function page(parent, contents) {
  return `<< /Type /Page /Parent ${parent} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents ${contents} 0 R >>`;
}

function contentStream(label) {
  const stream = `BT /F1 24 Tf 72 700 Td (${label}) Tj ET`;
  return `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
}

// Two US-Letter pages, each with a line of text.
const twoPage = buildPdf(
  [
    "<< /Type /Catalog /Pages 2 0 R >>", // 1
    "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>", // 2
    page(2, 4), // 3
    contentStream("Page 1"), // 4
    page(2, 6), // 5
    contentStream("Page 2"), // 6
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", // 7
  ],
  1,
);

// One US-Letter page rotated 90 degrees via /Rotate (the MediaBox stays
// portrait; only the display rotation differs).
const rotated90 = buildPdf(
  [
    "<< /Type /Catalog /Pages 2 0 R >>", // 1
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", // 2
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Rotate 90 /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>", // 3
    contentStream("Rotated"), // 4
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", // 5
  ],
  1,
);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "two-page.pdf"), twoPage);
console.log(`wrote fixtures/two-page.pdf (${twoPage.length} bytes)`);
writeFileSync(join(outDir, "rotated-90.pdf"), rotated90);
console.log(`wrote fixtures/rotated-90.pdf (${rotated90.length} bytes)`);
