import { defineConfig } from "vitest/config";

// The browser LocalStore in the machine's Chrome (headless), driven by playwright-core:
// SQLite WASM on OPFS in a Worker. Runs in `pnpm e2e`, not in `pnpm verify`.
export default defineConfig({
  test: {
    include: ["test/browser/**/*.test.ts"],
    globalSetup: ["test/browser/global-setup-serve-pages.ts"],
    hookTimeout: 180_000,
    testTimeout: 120_000,
  },
});
