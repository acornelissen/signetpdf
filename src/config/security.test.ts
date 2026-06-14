import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const config = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../src-tauri/tauri.conf.json", import.meta.url)), "utf8"),
) as {
  app: { withGlobalTauri: boolean; security: { csp: string; freezePrototype: boolean } };
};

const csp = config.app.security.csp;

describe("tauri security config", () => {
  it("sets a content security policy", () => {
    expect(typeof csp).toBe("string");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
  });

  it("allows the bundled pdf.js worker without remote origins or eval", () => {
    expect(csp).toMatch(/worker-src[^;]*'self'/);
    expect(csp).not.toContain("'unsafe-eval'");
    // The only absolute origin allowed is the Tauri IPC endpoint; no remote hosts.
    expect(csp).not.toMatch(/https?:\/\/(?!ipc\.localhost)/);
  });

  it("hides the global Tauri namespace", () => {
    expect(config.app.withGlobalTauri).toBe(false);
  });

  // freezePrototype is off because pdf-lib throws at import time when
  // Object.prototype is frozen (strict-mode assignment to an inherited
  // read-only toString). It is imported at startup, so the freeze would
  // dead-lock the whole app on "Loading...". This canary proves the
  // incompatibility still exists; if pdf-lib ever becomes freeze-safe the
  // subprocess will exit 0 and this test will fail, prompting us to
  // reconsider re-enabling freezePrototype.
  it("keeps freezePrototype off because pdf-lib cannot load under a frozen prototype", () => {
    expect(config.app.security.freezePrototype).toBe(false);

    const script =
      "Object.freeze(Object.prototype);Object.freeze(Array.prototype);" +
      "import('pdf-lib').then(() => process.exit(0)).catch(() => process.exit(7));";
    let exitCode = 0;
    try {
      execFileSync(process.execPath, ["--input-type=module", "-e", script], {
        cwd: fileURLToPath(new URL("../..", import.meta.url)),
        stdio: "ignore",
      });
    } catch (error) {
      exitCode = (error as { status?: number }).status ?? -1;
    }
    expect(exitCode).toBe(7);
  });
});
