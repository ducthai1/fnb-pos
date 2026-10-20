import { defineConfig } from "vitest/config";

// Component tests in jsdom: screens with their rules, against fakes of the server only.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test-support/vitest-setup.ts"],
    // A screen full of hostile data takes seconds in jsdom here and five times that on a
    // hosted CI runner. The budget is for slow machines, not for slow code.
    testTimeout: 30_000,
  },
});
