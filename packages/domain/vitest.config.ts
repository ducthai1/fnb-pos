import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Property suites run thousands of random orders: about a second each here, five times
    // that on a hosted CI runner. The budget is for slow machines, not for slow code.
    testTimeout: 30_000,
  },
});
