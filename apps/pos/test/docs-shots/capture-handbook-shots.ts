import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import react from "@vitejs/plugin-react";
import type { Browser } from "playwright-core";
import { type Plugin, build, preview } from "vite";
import { HANDBOOK_SHOTS, MAX_SHOT_BYTES, shotFileName } from "./handbook-shot-list";
import { PHOTO_FILES_BY_URL } from "./pretty-photos";

// `pnpm docs:shots:may-quay`: builds the sample café's screens page as the POS is built,
// serves it on a free port, and saves each screen of the shot list as a WebP for the handbook.

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../../..");
const SEED_IMAGES = join(REPO, "scripts/src/dev-stack/seed/images");
const OUT = join(REPO, "docs/handbook/images/may-quay");

/** Answers the page's photo requests as the API would, with the seed's photos. */
function serveSeedPhotos(): Plugin {
  return {
    name: "serve-seed-photos",
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        const file = PHOTO_FILES_BY_URL.get(request.url ?? "");
        if (file === undefined) return next();
        response.setHeader("content-type", "image/webp");
        response.end(readFileSync(join(SEED_IMAGES, `${file}.webp`)));
      });
    },
  };
}

/** PNG bytes to WebP at the best quality that stays under the handbook's weight. */
async function toWebp(browser: Browser, png: Buffer): Promise<Buffer> {
  const page = await browser.newPage();
  try {
    const base64 = await page.evaluate(
      async ({ data, max }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        canvas.getContext("2d")!.drawImage(image, 0, 0);
        for (const quality of [0.9, 0.82, 0.74, 0.66, 0.58, 0.5, 0.42, 0.34]) {
          const url = canvas.toDataURL("image/webp", quality);
          const body = url.slice(url.indexOf(",") + 1);
          if (body.length * 0.75 <= max) return body;
        }
        throw new Error("no WebP quality fits the weight");
      },
      { data: png.toString("base64"), max: MAX_SHOT_BYTES },
    );
    return Buffer.from(base64, "base64");
  } finally {
    await page.close();
  }
}

async function main() {
  const outDir = join(HERE, "../../tmp", `docs-shots-${randomUUID()}`);
  const shared = { configFile: false as const, root: HERE, logLevel: "warn" as const };
  await build({
    ...shared,
    plugins: [react()],
    build: { outDir, emptyOutDir: true, rollupOptions: { input: join(HERE, "docs-screens.html") } },
  });
  const server = await preview({
    ...shared,
    plugins: [serveSeedPhotos()],
    build: { outDir },
    preview: { host: "127.0.0.1", port: 0, strictPort: true },
  });
  const { port } = server.httpServer.address() as AddressInfo;
  const browser = await launchSystemChrome();
  try {
    mkdirSync(OUT, { recursive: true });
    for (const shot of HANDBOOK_SHOTS) {
      const context = await browser.newContext({
        viewport: { width: shot.width, height: shot.height },
        colorScheme: "light",
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${port}/docs-screens.html?screen=${shot.screen}`);
      await page
        .waitForFunction(`document.body.dataset.screenReady === "${shot.screen}"`, null, {
          timeout: 15_000,
        })
        .catch((error: Error) => {
          throw new Error(`${shot.screen} never rendered: ${errors.join("; ") || error.message}`);
        });
      await page.waitForLoadState("networkidle");
      for (const [label, times] of shot.taps ?? []) {
        const button = page.getByRole("button", { name: label }).first();
        for (let i = 0; i < times; i += 1) await button.click();
      }
      await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => {}))));
      const png = await page.screenshot({ type: "png" });
      await context.close();
      if (errors.length > 0) throw new Error(`${shot.screen}: ${errors.join("; ")}`);
      const webp = await toWebp(browser, png);
      writeFileSync(join(OUT, shotFileName(shot)), webp);
      console.log(`${shotFileName(shot)} ${Math.round(webp.length / 1024)} KB`);
    }
  } finally {
    await browser.close();
    await server.close();
    rmSync(outDir, { recursive: true, force: true });
  }
}

await main();
