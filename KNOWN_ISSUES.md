# Known issues and limitations

SignetPDF is deliberately small. These are the gaps we know about, with
workarounds where they exist.

## Unsigned binaries

Binary code-signing and notarization are not done yet.

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

Text annotations can be drawn in three families — sans, serif, and mono — and
the matching font is embedded in the saved PDF (Noto Sans, Noto Serif, and Noto
Sans Mono, with bold and italic variants; mono has no italic and falls back to
its regular face). Coverage is Latin plus the common scripts those Noto faces
include. Characters outside that coverage (for example, CJK scripts) may not
render in the saved file.

## Saved signatures

A signature you choose to save for reuse is stored unencrypted as a PNG in the
app's local data directory. On macOS and Linux the files are restricted to the
owner (0600); on Windows they use the account's normal file permissions. They
never leave the device. Delete them from the signature dialog's manager.

## Accessibility

The app meets a baseline of WCAG 2.2 AA: form controls and annotations carry
accessible names, controls are keyboard-reachable with visible focus, selected
text boxes and signatures can be moved, resized, and deleted from the keyboard,
and colours meet AA contrast.

Not yet implemented:

- Creating and placing a new annotation without a pointer (creation is still
  click- or right-click-driven; once placed, an annotation is fully keyboard
  operable).
- Full reading-order exposure of the page to assistive technology. Page text is
  now rendered as a selectable, copyable text layer (real DOM text rather than
  only canvas pixels), but it is positioned for selection and is not yet
  structured as a semantic reading order for screen readers.

## Dependency advisories

`glib` 0.18 carries a medium advisory (GHSA-wrw7-89jp-8q8g, an unsoundness in
`VariantStrIter`). It reaches SignetPDF only transitively through Tauri's
gtk-rs 0.18 stack on **Linux** — the macOS (WKWebView) and Windows (WebView2)
builds don't pull glib in — and `gtk` 0.18 caps glib at `^0.18`, so it can't be
moved to the patched 0.20 until Tauri upgrades gtk-rs. The app does not call the
affected API. It will be bumped when Tauri adopts glib 0.20.
