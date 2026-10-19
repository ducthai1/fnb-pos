import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/integration/**/*.test.ts"],
    // One embedded Postgres for the whole run; each test file isolates itself with fresh
    // tenant ids or its own scratch database, so files still run in parallel.
    globalSetup: ["test/integration/global-setup-start-postgres.ts"],
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
