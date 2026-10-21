import { z } from "zod";

/*
 * A product photo is a file named by the SHA-256 of its bytes plus the extension of the
 * format they are (jpg, png or webp), served at an address under the API that holds the
 * tenant's id and that name. Nobody can guess the address of a photo they have not seen,
 * and a new photo always has a new address, so tills may keep one forever.
 */

/** The name of a stored photo, as an upload answers it and a product document names it. */
export const productImageKeySchema = z
  .string()
  .regex(/^[0-9a-f]{64}\.(?:jpg|png|webp)$/, "is not the name of a stored photo");

/**
 * Where a photo is served, relative to the base the client already calls the API at (`/api`
 * behind the proxy): `/media/product-images/<tenant id>/<name>`.
 */
export const productImageUrlSchema = z
  .string()
  .regex(
    /^\/media\/product-images\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{64}\.(?:jpg|png|webp)$/,
    "is not the address of a stored photo",
  );

/** What POST /media/product-images answers for a photo it stored (or already had). */
export const productImageUploadSchema = z
  .object({
    imageKey: productImageKeySchema,
    imageUrl: productImageUrlSchema,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();

export type ProductImageUpload = z.infer<typeof productImageUploadSchema>;
