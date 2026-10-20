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
export function fakeCatalog(categories: Category[] = []) {
  const products = new Map<string, ProductDocument>();

  const putProduct = mock.fn(async (id: string, body: ProductBody): Promise<ApiResult<ProductDocument>> => {
    const stored = products.get(id);
    if (stored === undefined && body.version !== null) return refused(404, "API_CATALOG_PRODUCT_NOT_FOUND");
    if (stored !== undefined && stored.version !== body.version) return refused(409, "API_CATALOG_VERSION_CONFLICT");
    const saved: ProductDocument = {
      ...body,
      id,
      version: (stored?.version ?? 0) + 1,
      archivedAt: stored?.archivedAt ?? null,
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
    archiveProduct: mock.fn(async (id: string) => {
      const stored = products.get(id);
      if (stored === undefined) return refused(404, "API_CATALOG_PRODUCT_NOT_FOUND");
      products.set(id, { ...stored, version: stored.version + 1, archivedAt: "2026-10-20T03:00:00.000Z" });
      return ok(true as const);
    }),
    listCategories: async () => ok([...categories]),
    listStations: async () => ok([]),
  };

  /** Someone else saved the product meanwhile: its version moves on. */
  const touch = (id: string) => {
    const stored = products.get(id);
    if (stored !== undefined) products.set(id, { ...stored, version: stored.version + 1, name: `${stored.name} (sửa)` });
  };

  return { api, products, putProduct, touch };
}
