import { defineConfig } from "vitest/config";

// Golden paths of the POS as a person walks them: the real API on an embedded Postgres, the
// POS's production build, the machine's Chrome. One stack for the run, started once.
export default defineConfig({
  test: {
    include: ["pos/**/*.spec.ts"],
    globalSetup: ["support/global-setup-start-pos-stack.ts"],
    hookTimeout: 240_000,
    testTimeout: 180_000,
  },
});
