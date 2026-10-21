import { type ProductImageUpload, productImageUploadSchema } from "@fnb/contracts";
import { type ApiResult, type FetchLike, requestJson, resultOf } from "./api-result";

export interface ProductImageApi {
  /** Sends a photo (already shrunk) as the request body; the answer names the stored file. */
  uploadProductImage(photo: Blob): Promise<ApiResult<ProductImageUpload>>;
}

export function httpProductImageApi(base: string, fetchImpl: FetchLike): ProductImageApi {
  return {
    async uploadProductImage(photo) {
      const answer = await requestJson(fetchImpl, `${base}/media/product-images`, {
        method: "POST",
        bytes: photo,
      });
      return resultOf(answer, (body) => {
        const parsed = productImageUploadSchema.safeParse(body);
        return parsed.success ? parsed.data : null;
      });
    },
  };
}

/** Where the browser loads a photo the API names (`/media/…`, relative to the API). */
export const photoAddress = (imageUrl: string, base = "/api"): string => `${base}${imageUrl}`;
