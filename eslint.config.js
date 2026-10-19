import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/coverage/**", "**/.turbo/**", "spikes/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The domain package runs identically on the POS (offline) and on the server,
    // so it must stay pure: no network, no clock, no randomness. Callers pass them in.
    files: ["packages/domain/**/*.ts"],
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
);
