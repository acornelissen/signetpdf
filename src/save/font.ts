import fontkit from "@pdf-lib/fontkit";
import type { PDFDocument, PDFFont } from "pdf-lib";

// pdf-lib's standard fonts are WinAnsi (Latin-1) only, so drawn text outside
// that set fails to encode. We embed an open-licensed Unicode font (Noto Sans,
// OFL — see src/assets/fonts/OFL.txt) so the save projection (m3-7) can draw
// accented, Greek, Cyrillic and other glyphs. Subsetting keeps only the glyphs
// actually used, so the saved file grows by a few KB, not the whole 550KB face.

/**
 * Embed the Unicode text font into a pdf-lib document and return it. fontkit is
 * registered here (pdf-lib needs it to embed non-standard fonts); the font is
 * subset on save. Callers pass the font to drawText for free-text annotations.
 */
export async function embedUnicodeFont(doc: PDFDocument, fontBytes: Uint8Array): Promise<PDFFont> {
  doc.registerFontkit(fontkit);
  return doc.embedFont(fontBytes, { subset: true });
}
