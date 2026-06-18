# Security Policy

## Supported versions

SignetPDF is pre-1.0 and ships fixes only on the latest release. Please make sure
you are on the most recent version before reporting.

| Version | Supported |
| ------- | --------- |
| 0.4.x   | ✅        |
| < 0.4   | ❌        |

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue.

Use GitHub's private reporting: go to the repository's **Security** tab and
choose **Report a vulnerability**. Include reproduction steps, affected version
and platform, and the impact you observed. We aim to acknowledge a report within
a few days and will coordinate a fix and disclosure with you.

## Scope and context

SignetPDF is a local desktop app — no accounts, no servers, no telemetry. Some
properties worth knowing when assessing a report:

- File I/O is performed in the Rust backend behind a small set of Tauri
  commands. Writes are restricted to paths the user granted via a native dialog,
  and saved-signature ids are validated before any filesystem access.
- Reusable signatures are stored locally (owner-only on macOS/Linux); they never
  leave the device. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md).
- Release binaries are currently **unsigned and unnotarized** — this is a known
  gap, documented in [KNOWN_ISSUES.md](KNOWN_ISSUES.md), not a vulnerability.

Reports that depend only on bypassing the OS "unidentified developer" warnings
on unsigned builds are out of scope until code-signing lands.
