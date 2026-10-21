import type { FastifyError, FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import { IMAGE_CONTENT_TYPES, type ImageExtension } from "../../media/image-format";
import { MEDIA_API_ERROR_CODES } from "../../media/media-api-error-codes";
import { PRODUCT_IMAGE_LIMITS, checkProductImage } from "../../media/product-image-rules";
import { productImageUrl } from "../../media/product-image-store";

const FOREVER = "public, max-age=31536000, immutable";

/**
 * Product photos. Uploading needs edit_menu, checked before a byte of the body is read; the
 * body is the photo itself, whatever content type the client names, judged by its bytes.
 *
 * Serving needs no session: a till's <img> cannot send its device token, and a photo of a
 * drink is not a secret. Its address carries the tenant and the SHA-256 of its bytes, so it
 * is found only by someone shown it, one tenant's directory never answers for another's
 * photo, and a file never changes under its name: cached for a year, never asked again.
 */
export function registerProductImageRoutes(app: FastifyInstance, context: ApiContext): void {
  const store = context.productImages;

  app.register(async (scope) => {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser(
      "*",
      { parseAs: "buffer", bodyLimit: PRODUCT_IMAGE_LIMITS.maxBytes },
      (_request, body, done) => done(null, body),
    );
    scope.setErrorHandler((error: FastifyError, _request, reply) => {
      if (error.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
        return reply.code(413).send({ code: MEDIA_API_ERROR_CODES.tooLarge });
      }
      throw error;
    });

    scope.post(
      "/media/product-images",
      { onRequest: [context.requireSession, context.requirePermission("edit_menu")] },
      async (request, reply) => {
        if (store === null) {
          return reply.code(503).send({ code: MEDIA_API_ERROR_CODES.notConfigured });
        }
        const body = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
        const check = checkProductImage(body);
        if (!check.ok) return reply.code(check.status).send({ code: check.code });
        const { tenantId } = backofficeAuth(request);
        const { key, created } = await store.save(tenantId, body, check.facts.extension);
        return reply.code(created ? 201 : 200).send({
          imageKey: key,
          imageUrl: productImageUrl(tenantId, key),
          width: check.facts.width,
          height: check.facts.height,
        });
      },
    );
  });

  app.get<{ Params: { tenantId: string; file: string } }>(
    "/media/product-images/:tenantId/:file",
    async (request, reply) => {
      const { tenantId, file } = request.params;
      const bytes = store === null ? null : await store.read(tenantId, file);
      if (bytes === null) return reply.code(404).send({ code: "API_MEDIA_NOT_FOUND" });
      const [hash, extension] = file.split(".") as [string, ImageExtension];
      const etag = `"${hash}"`;
      reply
        .header("cache-control", FOREVER)
        .header("etag", etag)
        .header("x-content-type-options", "nosniff");
      if (request.headers["if-none-match"] === etag) return reply.code(304).send();
      return reply.type(IMAGE_CONTENT_TYPES[extension]).send(bytes);
    },
  );
}
