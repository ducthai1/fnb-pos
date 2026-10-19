import { defineConfig } from "vitest/config";

// Store and sync-loop rules against a real SQLite file: runs in `pnpm verify`. The
// scenarios against the real API and Postgres run in `pnpm test:sync`.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
