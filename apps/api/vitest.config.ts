import { defineConfig } from "vitest/config";

// Pure modules only (no database): runs in `pnpm verify`. Route and SQL behaviour is
// covered by vitest.integration.config.ts against a real Postgres.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
