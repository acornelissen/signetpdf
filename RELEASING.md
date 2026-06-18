# Releasing

SignetPDF releases are cut from a version tag. Pushing a `vX.Y.Z` tag triggers
[`.github/workflows/release.yml`](.github/workflows/release.yml), which builds
the installers on the Linux/macOS/Windows matrix and attaches them to a **draft**
GitHub release for you to review and publish.

## Steps

1. Make sure `master` is green (the CI workflow must pass on all three OSes).
2. Bump the version in all four places, kept in sync:
   - `package.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/Cargo.lock` (the `signetpdf` package entry)
   - `src-tauri/tauri.conf.json`
     Run `cargo check` in `src-tauri` to confirm the lockfile is consistent.
3. Update [`CHANGELOG.md`](CHANGELOG.md): add a `## [X.Y.Z] - YYYY-MM-DD` section
   describing the user-facing changes, and add its compare link at the bottom.
4. Commit as `chore(release): X.Y.Z` and push `master`.
5. Tag and push:
   ```
   git tag -a vX.Y.Z -m "SignetPDF X.Y.Z"
   git push origin vX.Y.Z
   ```
   Do **not** create the GitHub release by hand — let the workflow own it. (In
   0.4.0 the release was created manually before the workflow ran, so it ended
   up published rather than as a reviewable draft; avoid that.)
6. The Release workflow builds the bundles (macOS is a universal Intel +
   Apple Silicon binary) and creates a **draft** release named
   `SignetPDF vX.Y.Z` with the installers attached.
7. Open the draft, paste the changelog section as the release notes, confirm the
   assets are present for all three OSes, then **Publish**.

## Notes

- Binaries are currently **unsigned and unnotarized**. macOS shows a Gatekeeper
  warning and Windows a SmartScreen warning on first launch; see
  [KNOWN_ISSUES.md](KNOWN_ISSUES.md) for the launch workarounds. Signing and
  notarization are tracked as separate work and will remove these warnings.
- The workflow can also be run from the Actions tab via **workflow_dispatch**
  against an existing tag if a build needs to be re-run.
