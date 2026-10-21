/** Stable codes in the bodies of product photo uploads that are refused. */
export const MEDIA_API_ERROR_CODES = {
  /** The bytes are not a JPEG, PNG or WebP, whatever the name or content type said. */
  unsupportedType: "API_MEDIA_UNSUPPORTED_TYPE",
  /** More bytes than a product photo may have; the backoffice shrinks photos before sending. */
  tooLarge: "API_MEDIA_TOO_LARGE",
  /** Narrower, shorter, wider or taller than a product photo may be. */
  dimensionsNotAllowed: "API_MEDIA_DIMENSIONS_NOT_ALLOWED",
  /** This server keeps no photos (no media directory configured). */
  notConfigured: "API_MEDIA_NOT_CONFIGURED",
  /** A product names a photo this tenant never uploaded. */
  imageNotFound: "API_CATALOG_IMAGE_NOT_FOUND",
} as const;
