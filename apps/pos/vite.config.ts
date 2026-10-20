import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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

export default defineConfig({
  plugins: [react()],
  // SQLite WASM finds its .wasm next to its own module; pre-bundling would move it away.
  optimizeDeps: { exclude: ["@sqlite.org/sqlite-wasm"] },
  // The database Worker imports modules, which the default classic Worker format cannot.
  worker: { format: "es" },
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
  build: { target: "es2022" },
});
