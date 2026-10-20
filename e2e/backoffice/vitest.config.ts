import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Golden paths of the backoffice as an owner walks them: the real API on an embedded
// Postgres, the backoffice's production build, the machine's Chrome. One stack for the run;
// one spec at a time, so a run holds one Chrome.
export default defineConfig({
  test: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    include: ["**/*.spec.ts"],
    globalSetup: ["support/global-setup-start-backoffice-stack.ts"],
    fileParallelism: false,
    hookTimeout: 400_000,
    testTimeout: 180_000,
  },
});
