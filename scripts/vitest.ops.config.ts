import { defineConfig } from "vitest/config";

// The backup and restore drill: two embedded Postgres servers of its own and the client
// tools pg_dump/pg_restore (FNB_PG_BIN_DIR or PATH), which the other suites do not need.
export default defineConfig({
  test: {
    include: ["test/ops/**/*.test.ts"],
    hookTimeout: 180_000,
    testTimeout: 120_000,
  },
});
