import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["tests/e2e/**/*.spec.ts"],
    fileParallelism: false,
    globals: true,
    include: ["tests/**/*.spec.ts"],
    hookTimeout: 120000,
    maxWorkers: 1,
    testTimeout: 120000,
  },
});
