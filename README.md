# SignetPDF

A minimal, free, cross-platform PDF viewer for filling forms, editing text and signing.

SignetPDF is a desktop app (Tauri 2 + Vite + TypeScript) that opens a PDF, fills its
AcroForm fields, adds free-text annotations, and places a visual signature, then saves the
result back to a real PDF. It is deliberately small: no accounts, no cloud, no telemetry.

## Status

Early development, approaching a 0.1.0 release. Form filling, free-text annotation, visual
signatures, undo/redo and flatten-on-export work; packaging is the remaining milestone. See
the build plan in the [beads](https://github.com/gastownhall/beads) tracker under `.beads/`
(`bd ready` to list available work), and [KNOWN_ISSUES.md](KNOWN_ISSUES.md) for current
limitations.

## Requirements

Runtimes are pinned with [mise](https://mise.jdx.dev/):

```
mise install        # node 22, rust stable
npm install
```

You also need the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS
(on macOS, the Xcode Command Line Tools).

## Develop

```
npm run tauri dev     # launch the desktop app
npm test              # Vitest suite (headless)
npm run typecheck     # tsc --noEmit
npm run lint          # ESLint + Prettier
npm run format        # Prettier, write mode
```

Rust unit tests for the Tauri commands live in `src-tauri` and run with `cargo test`.

## Build

```
npm run tauri build   # produce a platform bundle in src-tauri/target
```

Binary code-signing and notarization are out of scope for 0.1.0: macOS builds are
unnotarized (Gatekeeper warning) and Windows builds are unsigned (SmartScreen warning). See
[KNOWN_ISSUES.md](KNOWN_ISSUES.md) for the launch workarounds and other limitations.

## License

[Apache-2.0](LICENSE), copyright The SignetPDF contributors.
