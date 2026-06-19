# Contributing to Ceralo

Thanks for your interest. Ceralo is a small, free, cross-platform desktop PDF
app (Tauri 2 + Vite + TypeScript, with a Rust backend). Contributions are
welcome by fork and pull request.

## Getting set up

Runtimes are pinned with [mise](https://mise.jdx.dev/):

```
mise install        # node + rust (stable)
npm install
```

You also need the [Tauri prerequisites](https://tauri.app/start/prerequisites/)
for your OS. Then:

```
npm run tauri dev     # launch the desktop app
```

## Before you open a PR

Run the same gates CI does — all must be green:

```
npm run lint          # ESLint + Prettier
npm run typecheck     # tsc --noEmit
npm test              # Vitest
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

Please also:

- Write a test first for any behaviour change (the project is test-driven).
- Use [Conventional Commits](https://www.conventionalcommits.org/) for messages
  (e.g. `feat(text): …`, `fix(forms): …`). Keep commits atomic.
- Match the surrounding code style; keep changes focused.

## Architecture you must respect

Most bugs are violations of one of three invariants — please keep to them (they
are described in detail in [CLAUDE.md](CLAUDE.md)):

1. **One immutable `DocumentModel` is the single source of truth.** Every
   mutation returns a new model; UI widgets hold no state of their own and route
   changes through a model mutator.
2. **The coordinate seam lives in one module** (`src/model/coords.ts`). All
   user-space ↔ screen conversion goes through it.
3. **Save is a pure projection**: model → pdf-lib → bytes, DOM-free and
   unit-tested.

Only AcroForm PDFs are supported; XFA is detected and refused by design.

## Reporting bugs and ideas

Open a [GitHub issue](https://github.com/acornelissen/ceralo/issues) for bugs
and feature requests, or start a [Discussion](https://github.com/acornelissen/ceralo/discussions)
for questions. For security issues, follow [SECURITY.md](SECURITY.md) — do not
file a public issue.

By contributing, you agree your contributions are licensed under the repository's
[LICENSE](LICENSE) (Apache-2.0).
