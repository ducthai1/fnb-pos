import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/integration/**/*.test.ts"],
    globalSetup: ["test/integration/global-setup-start-postgres.ts"],
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
});
