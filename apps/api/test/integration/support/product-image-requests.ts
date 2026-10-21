import { randomUUID } from "node:crypto";
import { readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";

const API_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

/** A media directory of its own under apps/api/tmp (gitignored, on the real disk). */
export function scratchMediaDirectory(): { path: string; remove(): Promise<void> } {
  const path = join(API_ROOT, "tmp", `media-${randomUUID()}`);
  return { path, remove: () => rm(path, { recursive: true, force: true }) };
}

/** Every photo file a tenant's directory holds, by name. */
export async function storedPhotos(mediaDirectory: string, tenantId: string): Promise<string[]> {
  try {
    return (await readdir(join(mediaDirectory, "product-images", tenantId))).sort();
  } catch {
    return [];
  }
}

/** POST /media/product-images with `bytes` as the body, as the backoffice sends a photo. */
export async function uploadPhoto(
  app: FastifyInstance,
  cookie: string | null,
  bytes: Buffer,
  contentType = "image/webp",
) {
  const response = await app.inject({
    method: "POST",
    url: "/media/product-images",
    headers: { "content-type": contentType, ...(cookie === null ? {} : { cookie }) },
    payload: bytes,
  });
  return { status: response.statusCode, body: response.json() as Record<string, unknown> };
}
