import {
  type ProductBody,
  type ProductDocument,
  readProductDocument,
} from "../catalog/product-document";
import { type ApiResult, type FetchLike, noContent, requestJson, resultOf } from "./api-result";
import { isRecord, listOf, nullableTextOf, textOf, wholeNumberOf } from "./read-json-fields";

export interface Category {
  readonly id: string;
  readonly brandId: string;
  readonly name: string;
  readonly sortOrder: number;
  readonly version: number;
}

export interface Station {
  readonly id: string;
  readonly branchId: string;
  readonly name: string;
  readonly version: number;
}

/** A row of the product list of a brand. */
export interface ProductSummary {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly categoryId: string | null;
  readonly basePrice: number | null;
  readonly pricingMode: string;
  /** What a weighed product's price is per ("kg", "100g"); null or absent on any other. */
  readonly measureUnit?: string | null;
  readonly version: number;
  readonly archivedAt: string | null;
  /** The photo's address under the API; null or absent without one. */
  readonly imageUrl?: string | null;
  /** Its live sizes, in order; empty for a product sold in one form. */
  readonly variants?: readonly { readonly id: string; readonly name: string }[];
}

/** A product switched off at a branch (all channels when channelKey is null). */
export interface SoldOut {
  readonly productId: string;
  readonly channelKey: string | null;
  readonly unavailableUntil: string | null;
}

const readCategory = (item: Record<string, unknown>): Category | null => {
  const [id, brandId, name] = [textOf(item, "id"), textOf(item, "brandId"), textOf(item, "name")];
  const sortOrder = wholeNumberOf(item, "sortOrder");
  const version = wholeNumberOf(item, "version");
  if (id === null || brandId === null || name === null) return null;
  return sortOrder === null || version === null ? null : { id, brandId, name, sortOrder, version };
};

const readStation = (item: Record<string, unknown>): Station | null => {
  const [id, branchId, name] = [textOf(item, "id"), textOf(item, "branchId"), textOf(item, "name")];
  const version = wholeNumberOf(item, "version");
  return id === null || branchId === null || name === null || version === null ? null : { id, branchId, name, version };
};

const readSummary = (item: Record<string, unknown>): ProductSummary | null => {
  const [id, name, kind, mode] = ["id", "name", "kind", "pricingMode"].map((key) => textOf(item, key));
  const categoryId = nullableTextOf(item, "categoryId");
  const archivedAt = nullableTextOf(item, "archivedAt");
  const version = wholeNumberOf(item, "version");
  const basePrice = item.basePrice === null ? null : wholeNumberOf(item, "basePrice");
  if (!id || !name || !kind || !mode || version === null) return null;
  if (categoryId === undefined || archivedAt === undefined) return null;
  if (basePrice === null && item.basePrice !== null) return null;
  const imageUrl = nullableTextOf(item, "imageUrl") ?? null;
  const measureUnit = nullableTextOf(item, "measureUnit") ?? null;
  const variants = Array.isArray(item.variants)
    ? item.variants.flatMap((variant: unknown) => {
        if (typeof variant !== "object" || variant === null) return [];
        const variantId = textOf(variant as Record<string, unknown>, "id");
        const variantName = textOf(variant as Record<string, unknown>, "name");
        return variantId && variantName ? [{ id: variantId, name: variantName }] : [];
      })
    : [];
  return {
    id,
    name,
    kind,
    categoryId,
    basePrice,
    pricingMode: mode,
    measureUnit,
    version,
    archivedAt,
    imageUrl,
    variants,
  };
};

const readSoldOut = (item: Record<string, unknown>): SoldOut | null => {
  const productId = textOf(item, "productId");
  const channelKey = nullableTextOf(item, "channelKey");
  const unavailableUntil = nullableTextOf(item, "unavailableUntil");
  if (productId === null || channelKey === undefined || unavailableUntil === undefined) return null;
  return { productId, channelKey, unavailableUntil };
};

export interface CatalogApi {
  listCategories(brandId: string): Promise<ApiResult<Category[]>>;
  putCategory(
    id: string,
    body: { version: number | null; brandId: string; name: string; sortOrder: number },
  ): Promise<ApiResult<Category>>;
  deleteCategory(id: string): Promise<ApiResult<true>>;
  listStations(branchId: string): Promise<ApiResult<Station[]>>;
  putStation(id: string, body: { version: number | null; branchId: string; name: string }): Promise<ApiResult<Station>>;
  deleteStation(id: string): Promise<ApiResult<true>>;
  listProducts(brandId: string): Promise<ApiResult<ProductSummary[]>>;
  getProduct(id: string): Promise<ApiResult<ProductDocument>>;
  putProduct(id: string, body: ProductBody): Promise<ApiResult<ProductDocument>>;
  archiveProduct(id: string): Promise<ApiResult<true>>;
  /** `POST /catalog/products/:id/unarchive` `{ version }`: the product sells again; answers its new version. */
  resumeProduct(id: string, version: number): Promise<ApiResult<{ readonly version: number }>>;
  listSoldOut(branchId: string): Promise<ApiResult<SoldOut[]>>;
  setAvailable(input: { productId: string; branchId: string; available: boolean }): Promise<ApiResult<true>>;
}

export function httpCatalogApi(base: string, fetchImpl: FetchLike): CatalogApi {
  const url = (path: string) => `${base}/catalog${path}`;
  const query = (key: string, value: string) => `?${key}=${encodeURIComponent(value)}`;
  const get = async <T>(path: string, read: (body: unknown) => T | null) =>
    resultOf(await requestJson(fetchImpl, url(path), { method: "GET" }), read);
  const list = <T>(read: (item: Record<string, unknown>) => T | null) => (body: unknown) =>
    listOf(body, read);
  return {
    listCategories: (brandId) => get(`/categories${query("brandId", brandId)}`, list(readCategory)),
    async putCategory(id, body) {
      const answer = await requestJson(fetchImpl, url(`/categories/${id}`), { method: "PUT", body });
      return resultOf(answer, (reply) => (isRecord(reply) ? readCategory(reply) : null));
    },
    async deleteCategory(id) {
      return resultOf(await requestJson(fetchImpl, url(`/categories/${id}`), { method: "DELETE" }), noContent);
    },
    listStations: (branchId) => get(`/stations${query("branchId", branchId)}`, list(readStation)),
    async putStation(id, body) {
      const answer = await requestJson(fetchImpl, url(`/stations/${id}`), { method: "PUT", body });
      return resultOf(answer, (reply) => (isRecord(reply) ? readStation(reply) : null));
    },
    async deleteStation(id) {
      return resultOf(await requestJson(fetchImpl, url(`/stations/${id}`), { method: "DELETE" }), noContent);
    },
    listProducts: (brandId) => get(`/products${query("brandId", brandId)}`, list(readSummary)),
    getProduct: (id) => get(`/products/${id}`, readProductDocument),
    async putProduct(id, body) {
      const answer = await requestJson(fetchImpl, url(`/products/${id}`), { method: "PUT", body });
      return resultOf(answer, readProductDocument);
    },
    async resumeProduct(id, version) {
      const answer = await requestJson(fetchImpl, url(`/products/${id}/unarchive`), { method: "POST", body: { version } });
      return resultOf(answer, (reply) => {
        const next = isRecord(reply) && reply.archivedAt === null ? wholeNumberOf(reply, "version") : null;
        return next === null ? null : { version: next };
      });
    },
    async archiveProduct(id) {
      return resultOf(await requestJson(fetchImpl, url(`/products/${id}/archive`), { method: "POST" }), noContent);
    },
    listSoldOut: (branchId) => get(`/availability${query("branchId", branchId)}`, list(readSoldOut)),
    async setAvailable({ productId, branchId, available }) {
      const answer = await requestJson(fetchImpl, url("/availability"), {
        method: "PUT",
        body: { productId, branchId, channelKey: null, available, unavailableUntil: null },
      });
      return resultOf(answer, noContent);
    },
  };
}
