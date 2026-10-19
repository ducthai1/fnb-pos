import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import type { FastifyInstance } from "fastify";
import { BROWSER_BUILD_DIR, SQLITE_WASM_DIR } from "./build-browser-bundle";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".wasm": "application/wasm",
};

/**
 * Serves the test page from the API's own origin: same origin means no CORS for the sync
 * calls, and http://127.0.0.1 counts as a secure context, which OPFS requires.
 * Deliberately no COOP/COEP headers: opfs-sahpool must work without them.
 */
export function registerBrowserAssets(app: FastifyInstance): void {
  const serveFrom = (prefix: string, dir: string) => {
    app.get<{ Params: { "*": string } }>(`${prefix}/*`, async (request, reply) => {
      const name = request.params["*"];
      const path = join(dir, name);
      if (name.includes("..") || !existsSync(path)) return reply.code(404).send();
      return reply
        .header("content-type", CONTENT_TYPES[extname(path)] ?? "application/octet-stream")
        .header("cache-control", "no-store")
        .send(readFileSync(path));
    });
  };
  serveFrom("/spike", BROWSER_BUILD_DIR);
  serveFrom("/vendor/sqlite-wasm", SQLITE_WASM_DIR);
}
