import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Headless by default. Model and coordinate-seam logic is pure and runs
    // under the node environment; DOM-dependent suites opt into jsdom locally.
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // The model and coordinate seam are the critical, pure logic the M1 gate
      // holds to a high bar. UI glue (main.ts, pdf/render) is exercised live.
      include: ["src/model/**/*.ts"],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 90,
      },
    },
  },
});
