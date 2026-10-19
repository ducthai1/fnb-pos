import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Each file boots its own embedded Postgres; running them one at a time keeps
    // the timing-sensitive sync scenarios from competing for the CPU.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
