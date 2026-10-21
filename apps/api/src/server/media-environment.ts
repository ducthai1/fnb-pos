import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/** Development keeps photos in the repository's own tmp/ (ignored by git). */
export const DEVELOPMENT_MEDIA_DIRECTORY = fileURLToPath(
  new URL("../../../../tmp/media", import.meta.url),
);

export const mediaEnvironment = {
  FNB_MEDIA_DIR: z
    .string()
    .refine((path) => isAbsolute(path), "must be an absolute directory path")
    .optional(),
};

/**
 * Where product photos are kept. Production names it (the infra guide uses
 * /var/lib/fnb/media, outside every release directory so an update keeps the photos);
 * development falls back to the repository's tmp/media.
 */
export function mediaDirectoryOf(values: { FNB_MEDIA_DIR?: string | undefined }): string {
  return values.FNB_MEDIA_DIR ?? DEVELOPMENT_MEDIA_DIRECTORY;
}
