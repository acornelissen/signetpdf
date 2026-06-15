# Known issues and limitations (0.1.0)

SignetPDF 0.1.0 is deliberately small. These are the gaps we know about, with
workarounds where they exist.

## Unsigned binaries

Binary code-signing and notarization are out of scope for 0.1.0.

- **macOS:** builds are not notarized, so Gatekeeper shows a warning on first
  launch. Open it with right-click (or Control-click) on the app and choose
  **Open**, then confirm; or clear the quarantine attribute with
  `xattr -dr com.apple.quarantine /Applications/SignetPDF.app`.
- **Windows:** builds are unsigned, so SmartScreen may warn. Choose **More
  info**, then **Run anyway**.

Build from source if you would rather not rely on a prebuilt binary.

## Encrypted PDFs

Encrypted PDFs open for viewing and filling:

- An empty user password opens transparently.
- A password-protected file prompts for the password (you can retry).

**Saving an encrypted PDF is disabled.** The save path uses pdf-lib, which
cannot decrypt PDF content, so it can neither preserve the encryption nor write
a valid decrypted copy. Rather than emit a broken or silently unencrypted file,
SignetPDF refuses to save and says so. To edit and save, remove the password
first (for example, print to PDF) and reopen the result.

## XFA forms

Only AcroForm fields are supported. XFA forms are detected and refused with a
clear message rather than rendered incorrectly.

## Fonts in drawn text

Free-text annotations are drawn with an embedded subset of Noto Sans, which
covers Latin, Greek, Cyrillic and common punctuation. Characters outside that
font's coverage (for example, CJK scripts) may not render in the saved file.

## Large documents

Every page is rendered up front; there is no lazy or virtualized rendering yet.
Very large documents (hundreds of pages) use more memory and open more slowly.
Virtualized rendering is planned.

## Accessibility

The app meets a baseline of WCAG 2.2 AA: form controls and annotations carry
accessible names, controls are keyboard-reachable with visible focus, a selected
signature can be removed with the Delete key, and colours meet AA contrast.

Not yet implemented:

- Arrow-key move and resize of annotations (today, move and resize are
  pointer-driven; deletion is keyboard-accessible).
- Creating and placing annotations without a pointer.
- Exposing the page's text structure to assistive technology (the page is drawn
  to a canvas).
