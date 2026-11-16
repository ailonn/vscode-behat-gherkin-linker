import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "test/unit/**/*.test.ts",
      "test/stress/**/*.test.ts",
      "test/guards/**/*.test.ts",
    ],
    environment: "node",
  },
});
