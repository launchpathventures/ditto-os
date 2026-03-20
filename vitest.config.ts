import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Mock the Anthropic SDK at module level to prevent import-time failures
    // without ANTHROPIC_API_KEY. This is NOT mocking the database — the
    // "no mocks" constraint applies to SQLite, not external API clients.
    setupFiles: ["src/test-setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
