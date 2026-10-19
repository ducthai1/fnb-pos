import { defineConfig } from "vitest/config";

// Sync scenarios: a till's real local store and sync loop against the real API on a real
// Postgres (embedded, one for the run). Each file opens its own shop, so files run in parallel.
export default defineConfig({
  test: {
    include: ["test/scenarios/**/*.test.ts"],
    globalSetup: ["test/global-setup-start-postgres.ts"],
    hookTimeout: 60_000,
    testTimeout: 120_000,
  },
});
