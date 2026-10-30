import { vi as mock } from "vitest";
import type { ApiResult } from "../lib/api/api-result";
import type { CatalogApi, Category } from "../lib/api/catalog-api";
import type { ProductBody, ProductDocument } from "../lib/catalog/product-document";
import { ok, refused } from "./fake-backoffice-api";

/**
 * The catalog routes as the editor relies on them: a product saved whole, its version
 * checked and bumped on every save (a stale one is a 409), archived without being deleted.
 * Calls are recorded, so a test can say what was sent.
 */
export const FAKE_TENANT = "0190a000-0000-7000-8000-0000000000e1";

export function fakeCatalog(categories: Category[] = []) {
  const products = new Map<string, ProductDocument>();

  const putProduct = mock.fn(async (id: string, body: ProductBody): Promise<ApiResult<ProductDocument>> => {
    const stored = products.get(id);
    if (stored === undefined && body.version !== null) return refused(404, "API_CATALOG_PRODUCT_NOT_FOUND");
    if (stored !== undefined && stored.version !== body.version) return refused(409, "API_CATALOG_VERSION_CONFLICT");
    const { imageKey, ...rest } = body;
    // Left out, the stored photo stays; null takes it off; a name is a photo uploaded before.
    const photo = imageKey === undefined ? (stored?.imageKey ?? null) : imageKey;
    const saved: ProductDocument = {
      ...rest,
      code: rest.code ?? stored?.code ?? `SP${String(products.size + 1).padStart(5, "0")}`,
      id,
      version: (stored?.version ?? 0) + 1,
      archivedAt: stored?.archivedAt ?? null,
      imageKey: photo,
      imageUrl: photo === null ? null : `/media/product-images/${FAKE_TENANT}/${photo}`,
    };
    products.set(id, saved);
    return ok(saved);
  });

  const api: Partial<CatalogApi> = {
    putProduct,
    getProduct: async (id) => {
      const stored = products.get(id);
      return stored === undefined ? refused(404, "API_CATALOG_PRODUCT_NOT_FOUND") : ok(stored);
    },
    resumeProduct: mock.fn(async (id: string, version: number) => {
      const stored = products.get(id);
      if (stored === undefined) return refused(404, "API_CATALOG_PRODUCT_NOT_FOUND");
      if (stored.version !== version) return refused(409, "API_CATALOG_VERSION_CONFLICT");
      const next = stored.archivedAt === null ? stored.version : stored.version + 1;
      products.set(id, { ...stored, version: next, archivedAt: null });
      return ok({ version: next });
    }),
    archiveProduct: mock.fn(async (id: string) => {
      const stored = products.get(id);
      if (stored === undefined) return refused(404, "API_CATALOG_PRODUCT_NOT_FOUND");
      products.set(id, { ...stored, version: stored.version + 1, archivedAt: "2026-10-20T03:00:00.000Z" });
      return ok(true as const);
    }),
    listCategories: async () => ok([...categories]),
    listStations: async () => ok([]),
    // Every product saved so far, as the list route sums them up (sizes included).
    listProducts: async () =>
      ok(
        [...products.values()].map((product) => ({
          id: product.id,
          name: product.name,
          kind: product.kind,
          categoryId: product.categoryId,
          basePrice: product.basePrice,
          pricingMode: product.pricingMode,
          measureUnit: product.measureUnit,
          version: product.version,
          archivedAt: product.archivedAt,
          imageUrl: product.imageUrl,
          variants: product.variants.map((variant) => ({ id: variant.id, name: variant.name })),
        })),
      ),
  };

  /** Someone else saved the product meanwhile: its version moves on. */
  const touch = (id: string) => {
    const stored = products.get(id);
    if (stored !== undefined) products.set(id, { ...stored, version: stored.version + 1, name: `${stored.name} (sửa)` });
  };

  return { api, products, putProduct, touch };
}
