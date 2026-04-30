import { defineConfig } from "vitest/config";
import path from "path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // The React plugin transpiles JSX in `.tsx` source files so vitest can
  // load the web-package renderers. The web package's next-build pipeline
  // is unaffected; this only runs inside the test runner.
  plugins: [react()],
  test: {
    globals: true,
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "packages/core/src/**/*.test.ts",
      "packages/web/**/*.test.ts",
      "packages/web/**/*.test.tsx",
      "packages/bridge-cli/src/**/*.test.ts",
      // Brief 220 AC #12 — runbook bash-syntax check colocated with the doc.
      "docs/runner-templates/**/*.test.ts",
    ],
    // Mock the Anthropic SDK at module level to prevent import-time failures
    // without ANTHROPIC_API_KEY. This is NOT mocking the database — the
    // "no mocks" constraint applies to SQLite, not external API clients.
    setupFiles: ["src/test-setup.ts"],
  },
  resolve: {
    alias: [
      // The web package's @/* alias resolves against packages/web/. This
      // takes precedence over the engine's @/* alias because vitest
      // resolves alias arrays in declaration order.
      { find: /^@\/(lib\/.*|components\/.*|app\/.*)$/, replacement: path.resolve(__dirname, "packages/web/$1") },
      { find: "@", replacement: path.resolve(__dirname, "src") },
    ],
  },
});
