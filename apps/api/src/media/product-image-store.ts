import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ImageExtension } from "./image-format";
import { IMAGE_KEY_PATTERN } from "./product-image-rules";

/** Where the API serves a stored photo, relative to the API's own base (`/api` behind Caddy). */
export const productImageUrl = (tenantId: string, key: string): string =>
  `/media/product-images/${tenantId}/${key}`;

/** Product photos on disk, one directory per tenant, each file named by its content. */
export interface ProductImageStore {
  /** Stores the bytes (already checked) under their hash; storing them again changes nothing. */
  save(
    tenantId: string,
    bytes: Uint8Array,
    extension: ImageExtension,
  ): Promise<{ key: string; created: boolean }>;
  /** Whether this tenant's directory holds the file. */
  has(tenantId: string, key: string): Promise<boolean>;
  /** The file's bytes, or null when this tenant has no file by that name. */
  read(tenantId: string, key: string): Promise<Buffer | null>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Photos under `<root>/product-images/<tenant id>/`. The tenant always comes from the
 * caller's session, and both path parts are checked against fixed patterns before they
 * touch the file system, so no request can name a path outside its own tenant's directory.
 * A file is written beside its final name and renamed into place: a reader never sees half
 * a photo, and two uploads of the same photo end with the same file.
 */
export function diskProductImageStore(root: string): ProductImageStore {
  const directoryOf = (tenantId: string) => {
    if (!UUID.test(tenantId)) throw new Error("not a tenant id");
    return join(root, "product-images", tenantId);
  };
  const pathOf = (tenantId: string, key: string): string | null =>
    IMAGE_KEY_PATTERN.test(key) && UUID.test(tenantId) ? join(directoryOf(tenantId), key) : null;
  const exists = async (path: string) => {
    try {
      return (await stat(path)).isFile();
    } catch {
      return false;
    }
  };

  return {
    async save(tenantId, bytes, extension) {
      const key = `${createHash("sha256").update(bytes).digest("hex")}.${extension}`;
      const directory = directoryOf(tenantId);
      const path = join(directory, key);
      if (await exists(path)) return { key, created: false };
      await mkdir(directory, { recursive: true, mode: 0o750 });
      const partial = join(directory, `.${randomUUID()}.partial`);
      try {
        await writeFile(partial, bytes, { flag: "wx", mode: 0o640 });
        await rename(partial, path);
      } catch (error) {
        await rm(partial, { force: true });
        throw error;
      }
      return { key, created: true };
    },
    async has(tenantId, key) {
      const path = pathOf(tenantId, key);
      return path !== null && (await exists(path));
    },
    async read(tenantId, key) {
      const path = pathOf(tenantId, key);
      if (path === null) return null;
      try {
        return await readFile(path);
      } catch {
        return null;
      }
    },
  };
}
