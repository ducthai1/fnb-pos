import type { Plugin } from "vite";
import { solidPng } from "../../../../api/test/integration/support/sample-image-bytes";
import { HOSTILE_PHOTOS } from "../pages/hostile-photos";

/**
 * Answers the screens page's photo requests as the API would (under /api, cached for good),
 * with real PNGs of the extreme shapes; the missing photo is a 404, as for a deleted file.
 */
export function servePhotos(): Plugin {
  const photos = new Map(
    [HOSTILE_PHOTOS.tall, HOSTILE_PHOTOS.wide].map((photo, seed) => [
      `/api${photo.url}`,
      solidPng(photo.width, photo.height, seed + 3),
    ]),
  );
  return {
    name: "serve-hostile-photos",
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith("/api/media/")) return next();
        const bytes = photos.get(request.url);
        if (bytes === undefined) {
          response.statusCode = 404;
          return response.end();
        }
        response.setHeader("content-type", "image/png");
        response.setHeader("cache-control", "public, max-age=31536000, immutable");
        response.end(bytes);
      });
    },
  };
}
