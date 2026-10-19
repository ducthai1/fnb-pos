import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/coverage/**", "**/.turbo/**", "spikes/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The domain and feature-flags packages run identically on the POS (offline) and on
    // the server, so they must stay pure: no network, no clock, no randomness. Callers
    // pass them in. Contracts too: the till and the server must accept or refuse the very
    // same message, which a schema reading the clock or a store could not promise.
    files: [
      "packages/domain/**/*.ts",
      "packages/feature-flags/**/*.ts",
      "packages/contracts/**/*.ts",
      "packages/printing/**/*.ts",
    ],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "domain is pure: no I/O" },
        { name: "localStorage", message: "domain is pure: no I/O" },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now", message: "domain is pure: pass the time in" },
        { object: "Math", property: "random", message: "domain must be deterministic" },
      ],
    },
  },
  {
    // Printing turns a document into bytes; sending them is the native shell's job. Only the
    // golden-file helper and tests may touch the file system.
    files: ["packages/printing/src/**/*.ts"],
    ignores: ["packages/printing/src/**/*.test.ts", "packages/printing/src/test-support/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["node:*"], message: "printing is pure: the shell does I/O" }] },
      ],
    },
  },
);
