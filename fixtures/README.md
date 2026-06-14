# Test fixtures

A deliberately awkward corpus of PDFs the test suite leans on. Regenerate them
all with:

```
node scripts/make-fixtures.mjs
```

The committed files are what tests and CI use. Regenerating the linearized and
encrypted variants needs [qpdf](https://qpdf.sourceforge.io/) (`brew install
qpdf`); everything else is produced from `pdf-lib` or hand-rolled bytes.

| File                     | What it is                                                          | Used for                              |
| ------------------------ | ------------------------------------------------------------------- | ------------------------------------- |
| `two-page.pdf`           | Two US-Letter pages, no forms                                       | page count, rendering, no-forms path  |
| `rotated-90.pdf`         | One page with `/Rotate 90` (MediaBox stays portrait)                | geometry capture, the coordinate seam |
| `acroform.pdf`           | AcroForm with text, checkbox, radio group, dropdown and option list | field detection and fill (m2)         |
| `xfa.pdf`                | AcroForm carrying an `/XFA` entry                                   | XFA refusal (m2-1)                    |
| `linearized.pdf`         | Linearized (web-optimized) copy of `two-page.pdf`                   | save round-trip on awkward structure  |
| `encrypted-empty.pdf`    | AES-256, empty user password (opens transparently)                  | encrypted handling (m1-12)            |
| `encrypted-password.pdf` | AES-256, user password `secret`                                     | encrypted handling (m1-12)            |
| `large.pdf`              | 300 pages                                                           | large-document virtualization (m5-9)  |

XFA is detected via the AcroForm `/XFA` entry (pdf-lib:
`acroForm.has(PDFName.of("XFA"))`), which is present on `xfa.pdf` and absent on
`acroform.pdf`.
