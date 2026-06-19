# Releasing

Ceralo releases are cut from a version tag. Pushing a `vX.Y.Z` tag triggers
[`.github/workflows/release.yml`](.github/workflows/release.yml), which builds
the installers on the Linux/macOS/Windows matrix and attaches them to a **draft**
GitHub release for you to review and publish.

## Steps

1. Make sure `master` is green (the CI workflow must pass on all three OSes).
2. Bump the version in all four places, kept in sync:
   - `package.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/Cargo.lock` (the `ceralo` package entry)
   - `src-tauri/tauri.conf.json`
     Run `cargo check` in `src-tauri` to confirm the lockfile is consistent.
3. Update [`CHANGELOG.md`](CHANGELOG.md): add a `## [X.Y.Z] - YYYY-MM-DD` section
   describing the user-facing changes, and add its compare link at the bottom.
4. Commit as `chore(release): X.Y.Z` and push `master`.
5. Tag and push:
   ```
   git tag -a vX.Y.Z -m "Ceralo X.Y.Z"
   git push origin vX.Y.Z
   ```
   Do **not** create the GitHub release by hand — let the workflow own it. (In
   0.4.0 the release was created manually before the workflow ran, so it ended
   up published rather than as a reviewable draft; avoid that.)
6. The Release workflow builds the bundles (macOS is a universal Intel +
   Apple Silicon binary) and creates a **draft** release named
   `Ceralo vX.Y.Z` with the installers attached.
7. Open the draft and write the release notes: paste the changelog section,
   then append the **install instructions for the unsigned binaries** (per-OS
   steps for clearing Gatekeeper/SmartScreen — keep them in sync with the
   "Install" section of the [README](README.md)). Confirm the assets are present
   for all three OSes, then **Publish**.

## macOS signing and notarization secrets

The Release workflow signs and notarizes the macOS bundle **when the signing
secrets are present**. If any are missing the build still succeeds but produces
an unsigned, un-notarized bundle (Gatekeeper warns on first launch). The secrets
are all-or-nothing: add the full set together. Set them under the repo's
**Settings → Secrets and variables → Actions**.

There are two independent credentials: a **Developer ID Application certificate**
(signs the app) and an **App Store Connect API key** (submits it to Apple's
notary service). Both are required for a notarized release.

| Secret                       | What it is                                             |
| ---------------------------- | ------------------------------------------------------ |
| `APPLE_CERTIFICATE`          | base64 of the `.p12` (Developer ID cert + private key) |
| `APPLE_CERTIFICATE_PASSWORD` | password set when exporting the `.p12`                 |
| `APPLE_SIGNING_IDENTITY`     | `Developer ID Application: <Name> (<TeamID>)`          |
| `APPLE_API_ISSUER`           | App Store Connect API key Issuer ID (UUID)             |
| `APPLE_API_KEY_ID`           | the API key's 10-char Key ID                           |
| `APPLE_API_KEY_BASE64`       | base64 of the `.p8` API key file                       |

### Developer ID Application certificate (`APPLE_CERTIFICATE*`)

Requires the paid Apple Developer Program and Account Holder/Admin rights.

1. In **Keychain Access → Certificate Assistant → Request a Certificate From a
   Certificate Authority**, enter your Apple ID email and a Common Name, choose
   **Saved to disk**, and save the `.certSigningRequest`. This also creates the
   matching private key in your login keychain — keep using the same Mac.
2. In the [developer portal](https://developer.apple.com) under **Certificates**,
   create a **Developer ID Application** certificate (not "Apple Distribution",
   not "Developer ID Installer"), upload the CSR, and download the `.cer`.
3. Double-click the `.cer` to import it. In Keychain Access, **login** keychain,
   **My Certificates** category, confirm the cert shows its private key nested
   underneath. Right-click → **Export** as **Personal Information Exchange
   (.p12)** and set a password (this becomes `APPLE_CERTIFICATE_PASSWORD`).
4. Produce the secret values:

   ```sh
   base64 -i cert.p12 | pbcopy          # APPLE_CERTIFICATE
   security find-identity -v -p codesigning
   ```

   The quoted string `find-identity` prints is `APPLE_SIGNING_IDENTITY`; the
   10-char code in its parentheses is your Team ID (also top-right in the portal).

5. Remove the local `.p12` afterward (`rm cert.p12`); keep an offline backup in a
   password manager.

### App Store Connect API key (`APPLE_API_*`)

The notary credential — separate from the certificate above.

1. In **App Store Connect → Users and Access → Integrations → App Store Connect
   API**, generate a **Team Key** with the **Developer** access role (Account
   Holder/Admin only).
2. Record the **Issuer ID** (UUID, `APPLE_API_ISSUER`) and the key's **Key ID**
   (10 chars, `APPLE_API_KEY_ID`), then **Download API Key** — the `.p8` can only
   be downloaded once.
3. base64-encode it for the secret (the workflow decodes it back to a file at
   build time):

   ```sh
   base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy   # APPLE_API_KEY_BASE64
   ```

4. Remove the local `.p8` afterward; keep an offline backup (non-recoverable).

Before the first notarized release, confirm there are no pending agreements in
App Store Connect — unaccepted agreements make notarization fail with an
unhelpful error. The notary service is asynchronous and the release job may sit
on the notarization step for several minutes; that is normal.

## Windows signing (planned via SignPath Foundation)

Windows builds ship **unsigned** until a certificate is in place. The macOS
approach (base64 a cert into a secret) does not transfer to Windows: since June
2023 the CA/Browser Forum requires code-signing private keys to live on certified
hardware (a FIPS 140-2 USB token / HSM) or a cloud signing service, so CAs no
longer issue an exportable `.pfx`. A USB token can't be attached to a hosted
runner, so CI signing needs a cloud service with an API, and most of those are
priced for registered businesses.

**The intended path is the [SignPath Foundation](https://signpath.org/), which
provides free code signing to qualifying open-source projects** on the cloud
SignPath.io platform (it has a GitHub Actions integration, so signing happens in
CI). Ceralo became eligible when the Commons Clause was dropped — the
Foundation requires an OSI-approved open-source licence, which plain Apache-2.0
is and Apache-2.0 + Commons Clause was not.

Remaining steps before Windows is signed:

1. Apply to the SignPath Foundation for an open-source code-signing certificate
   (they also weigh project maturity, a public repo, and a named maintainer).
2. Once approved, wire the SignPath GitHub Action into `release.yml` as a signing
   step for the Windows artifacts, with the SignPath API token and project slugs
   stored as repository secrets.
3. Update [KNOWN_ISSUES.md](KNOWN_ISSUES.md) and the README install notes to drop
   the SmartScreen workaround for Windows once builds are signed.

The signed binary's publisher will show as **SignPath Foundation**, not an
individual name. Signing removes the "unknown publisher" wording; SmartScreen
reputation still accrues over downloads and time (only an EV certificate grants
immediate SmartScreen trust, which the free Foundation cert is not).

Fallback options if the Foundation route doesn't work out: **Certum Open Source**
(cheap, individual, but the key is on a hardware token so signing is local, not
CI) or **Azure Trusted Signing** (cheap and CI-friendly where the individual
track is available, otherwise needs an organization).

## Notes

- When the signing secrets above are unset, macOS and Windows binaries ship
  **unsigned**: macOS shows a Gatekeeper warning and Windows a SmartScreen
  warning on first launch; see [KNOWN_ISSUES.md](KNOWN_ISSUES.md) for the launch
  workarounds. Windows signing is still tracked as separate work.
- The workflow can also be run from the Actions tab via **workflow_dispatch**
  against an existing tag if a build needs to be re-run.
