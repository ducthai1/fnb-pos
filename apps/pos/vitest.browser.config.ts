import { defineConfig } from "vitest/config";

// The POS screens in the machine's Chrome (headless), measured for overflow with hostile
// names at phone and tablet width. Runs in `pnpm e2e`, not in `pnpm verify`.
export default defineConfig({
  test: {
    include: ["test/browser/**/*.test.ts"],
    globalSetup: ["test/browser/global-setup-serve-screens.ts"],
    hookTimeout: 180_000,
    testTimeout: 120_000,
  },
});
