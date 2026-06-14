// Generates the PDF test fixtures. Run with `node scripts/make-fixtures.mjs`.
//
// Three techniques:
//  - hand-rolled minimal PDFs (deterministic, dependency-free) for the simple
//    structural fixtures and the XFA refusal case;
//  - pdf-lib for the AcroForm corpus and the large multi-page document;
//  - qpdf (brew install qpdf) for the linearized and encrypted variants.
//
// The committed fixtures are what tests and CI use; qpdf is only needed to
// regenerate the linearized/encrypted ones. See fixtures/README.md.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts } from "pdf-lib";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "fixtures");
mkdirSync(outDir, { recursive: true });

const write = (name, bytes) => {
  writeFileSync(join(outDir, name), bytes);
  console.log(`wrote fixtures/${name} (${bytes.length} bytes)`);
};

// --- Hand-rolled minimal PDFs ------------------------------------------------

/** Assemble a PDF from object bodies (object N is index N-1) with a valid xref. */
function buildPdf(objects, rootObj) {
  let body = "%PDF-1.7\n%\xff\xff\xff\xff\n";
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

const page = (parent, contents) =>
  `<< /Type /Page /Parent ${parent} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents ${contents} 0 R >>`;

const contentStream = (label) => {
  const stream = `BT /F1 24 Tf 72 700 Td (${label}) Tj ET`;
  return `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
};

// Two US-Letter pages, no forms.
const twoPage = buildPdf(
  [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
    page(2, 4),
    contentStream("Page 1"),
    page(2, 6),
    contentStream("Page 2"),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ],
  1,
);
write("two-page.pdf", twoPage);

// One page rotated 90 degrees via /Rotate (MediaBox stays portrait).
const rotated90 = buildPdf(
  [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Rotate 90 /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    contentStream("Rotated"),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ],
  1,
);
write("rotated-90.pdf", rotated90);

// An XFA form: an AcroForm whose /XFA entry must trigger graceful refusal.
const xfaXml =
  '<?xml version="1.0"?><xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><template xmlns="http://www.xfa.org/schema/xfa-template/3.0/"/></xdp:xdp>';
const xfa = buildPdf(
  [
    "<< /Type /Catalog /Pages 2 0 R /AcroForm 4 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
    "<< /Fields [] /XFA 5 0 R >>",
    `<< /Length ${xfaXml.length} >>\nstream\n${xfaXml}\nendstream`,
  ],
  1,
);
write("xfa.pdf", xfa);

// --- pdf-lib generated -------------------------------------------------------

// An AcroForm with one of every field type SignetPDF supports.
async function buildAcroForm() {
  const doc = await PDFDocument.create();
  const sheet = doc.addPage([612, 792]);
  const form = doc.getForm();

  form.createTextField("text.fullName").addToPage(sheet, { x: 72, y: 700, width: 240, height: 20 });
  form.createCheckBox("check.agree").addToPage(sheet, { x: 72, y: 660, width: 14, height: 14 });

  const radio = form.createRadioGroup("radio.color");
  radio.addOptionToPage("red", sheet, { x: 72, y: 620, width: 14, height: 14 });
  radio.addOptionToPage("blue", sheet, { x: 120, y: 620, width: 14, height: 14 });

  const dropdown = form.createDropdown("choice.city");
  dropdown.addOptions(["London", "Paris", "Tokyo"]);
  dropdown.addToPage(sheet, { x: 72, y: 580, width: 200, height: 20 });

  const list = form.createOptionList("choice.fruit");
  list.addOptions(["Apple", "Pear", "Plum"]);
  list.addToPage(sheet, { x: 72, y: 480, width: 200, height: 80 });

  return Buffer.from(await doc.save());
}

// A several-hundred-page document for virtualization testing (m5-9).
async function buildLarge(pageCount) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pageCount; i += 1) {
    const sheet = doc.addPage([612, 792]);
    sheet.drawText(`Page ${i}`, { x: 72, y: 720, size: 24, font });
  }
  return Buffer.from(await doc.save());
}

const acroform = await buildAcroForm();
write("acroform.pdf", acroform);
write("large.pdf", await buildLarge(300));

// --- qpdf derived (linearized + encrypted) -----------------------------------

function qpdf(args) {
  execFileSync("qpdf", args, { cwd: outDir });
}

try {
  qpdf(["--linearize", "two-page.pdf", "linearized.pdf"]);
  console.log("wrote fixtures/linearized.pdf");
  // Empty user password: opens transparently but the file is encrypted.
  qpdf([
    "--encrypt",
    "--user-password=",
    "--owner-password=",
    "--bits=256",
    "--",
    "acroform.pdf",
    "encrypted-empty.pdf",
  ]);
  console.log("wrote fixtures/encrypted-empty.pdf");
  // Requires a user password to open.
  qpdf([
    "--encrypt",
    "--user-password=secret",
    "--owner-password=owner",
    "--bits=256",
    "--",
    "two-page.pdf",
    "encrypted-password.pdf",
  ]);
  console.log("wrote fixtures/encrypted-password.pdf");
} catch (error) {
  console.warn(
    `\nqpdf step skipped (${error.message}).\n` +
      "Install qpdf (brew install qpdf) to regenerate linearized/encrypted fixtures.",
  );
}
