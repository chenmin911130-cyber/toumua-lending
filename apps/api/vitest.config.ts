import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    testTimeout: 120000,
    hookTimeout: 120000,
    include: ["test/**/*.spec.ts"],
  },
});
