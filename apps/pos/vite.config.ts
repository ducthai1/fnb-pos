import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import {
  buildNumberOf,
  commitSecondsOf,
  releaseIdOf,
  releaseStamp,
  shortGitSha,
} from "./build-release";

// The POS calls the API under /api on its own origin, so neither the API nor the till
// needs CORS; the dev and preview servers forward it to wherever the API runs.
const apiOrigin = process.env.FNB_API_ORIGIN ?? "http://127.0.0.1:3000";
const apiProxy = {
  "/api": {
    target: apiOrigin,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api/, ""),
  },
};

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const builtAt = new Date();
const releaseId = releaseIdOf({
  version,
  env: process.env,
  gitSha: () => shortGitSha(process.cwd()),
  now: () => builtAt,
});

const buildNumber = buildNumberOf({
  env: process.env,
  commitSeconds: () => commitSecondsOf(process.cwd()),
  now: () => builtAt,
});

export default defineConfig({
  plugins: [react(), releaseStamp(releaseId, builtAt, buildNumber)],
  // SQLite WASM finds its .wasm next to its own module; pre-bundling would move it away.
  optimizeDeps: { exclude: ["@sqlite.org/sqlite-wasm"] },
  // The database Worker imports modules, which the default classic Worker format cannot.
  worker: { format: "es" },
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
  build: { target: "es2022" },
});
