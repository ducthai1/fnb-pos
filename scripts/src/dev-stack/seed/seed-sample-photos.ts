import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import type { BackofficeCall } from "./backoffice-caller";

const IMAGES = join(dirname(fileURLToPath(import.meta.url)), "images");

/** Each sample product's photo in images/ (CC0, see images/CREDITS.md). */
export const SAMPLE_PHOTOS: Readonly<Record<string, string>> = {
  "Cà phê đen đá": "ca-phe-den-da.webp",
  "Cà phê sữa đá": "ca-phe-sua-da.webp",
  "Bạc xỉu": "bac-xiu.webp",
  "Cà phê muối": "ca-phe-muoi.webp",
  Americano: "americano.webp",
  Latte: "latte.webp",
  Cappuccino: "cappuccino.webp",
  "Cold brew cam sả": "cold-brew-cam-sa.webp",
  "Trà sữa trân châu": "tra-sua-tran-chau.webp",
  "Trà sữa matcha": "tra-sua-matcha.webp",
  "Trà sữa ô long": "tra-sua-o-long.webp",
  "Hồng trà sữa": "hong-tra-sua.webp",
  "Sữa tươi trân châu đường đen": "sua-tuoi-tran-chau-duong-den.webp",
  "Trà đào cam sả": "tra-dao-cam-sa.webp",
  "Trà vải": "tra-vai.webp",
};

const SET_BY_THE_SERVER = new Set(["id", "archivedAt", "imageUrl"]);

interface StoredProduct {
  imageKey: string | null;
  [field: string]: unknown;
}

/**
 * Gives each sample product its photo the way the backoffice does: the file uploaded to
 * POST /media/product-images, then the product saved whole with the photo's name. Running
 * again uploads the same bytes to the same name and saves nothing, since every product
 * already names its photo. A server without a media directory gets no photos (0 returned).
 */
export async function seedSamplePhotos(
  app: FastifyInstance,
  cookie: string,
  call: BackofficeCall,
  products: ReadonlyMap<string, string>,
): Promise<number> {
  let given = 0;
  for (const [name, file] of Object.entries(SAMPLE_PHOTOS)) {
    const id = products.get(name);
    if (id === undefined) continue;
    const uploaded = await app.inject({
      method: "POST",
      url: "/media/product-images",
      headers: { cookie, "content-type": "image/webp" },
      payload: await readFile(join(IMAGES, file)),
    });
    if (uploaded.statusCode === 503) return 0;
    if (uploaded.statusCode !== 200 && uploaded.statusCode !== 201) {
      throw new Error(`uploading ${file} answered ${uploaded.statusCode}: ${uploaded.body}`);
    }
    const { imageKey } = uploaded.json() as { imageKey: string };
    const stored = await call<StoredProduct>("GET", `/catalog/products/${id}`);
    given += 1;
    if (stored.imageKey === imageKey) continue;
    // The document as read, minus what only the server sets, is what it takes back.
    const body = Object.fromEntries(
      Object.entries(stored).filter(([field]) => !SET_BY_THE_SERVER.has(field)),
    );
    await call("PUT", `/catalog/products/${id}`, { ...body, imageKey });
  }
  return given;
}
