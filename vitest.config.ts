import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["tests/e2e/**/*.spec.ts"],
    globals: true,
    include: ["tests/**/*.spec.ts"],
    hookTimeout: 120000,
    testTimeout: 120000,
  },
});
