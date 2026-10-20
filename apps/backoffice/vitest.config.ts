import { defineConfig } from "vitest/config";

// Component tests in jsdom: screens with their rules, against a fake of the API only.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test-support/vitest-setup.ts"],
  },
});
