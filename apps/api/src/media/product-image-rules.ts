import { type ImageFacts, readImageFacts } from "./image-format";
import { MEDIA_API_ERROR_CODES } from "./media-api-error-codes";

/**
 * How big a product photo may be. The backoffice shrinks every photo to 800px on its long
 * side before sending (a WebP of that size is ~50–150 KB), so these leave room for a photo
 * sent another way without letting a tile download megabytes, or a header that declares a
 * huge canvas make a till's browser decode one.
 */
export const PRODUCT_IMAGE_LIMITS = {
  maxBytes: 1_048_576,
  minSide: 16,
  maxSide: 2_048,
} as const;

/** `<sha256 of the bytes>.<extension of their format>`, the only names a photo file has. */
export const IMAGE_KEY_PATTERN = /^[0-9a-f]{64}\.(?:jpg|png|webp)$/;

export type ProductImageCheck =
  | { readonly ok: true; readonly facts: ImageFacts }
  | { readonly ok: false; readonly status: number; readonly code: string };

/** Whether `bytes` may be stored as a product photo, judged from the bytes alone. */
export function checkProductImage(bytes: Uint8Array): ProductImageCheck {
  if (bytes.length > PRODUCT_IMAGE_LIMITS.maxBytes) {
    return { ok: false, status: 413, code: MEDIA_API_ERROR_CODES.tooLarge };
  }
  const facts = readImageFacts(bytes);
  if (facts === null) {
    return { ok: false, status: 415, code: MEDIA_API_ERROR_CODES.unsupportedType };
  }
  const sides = [facts.width, facts.height];
  const { minSide, maxSide } = PRODUCT_IMAGE_LIMITS;
  if (sides.some((side) => side < minSide || side > maxSide)) {
    return { ok: false, status: 422, code: MEDIA_API_ERROR_CODES.dimensionsNotAllowed };
  }
  return { ok: true, facts };
}
