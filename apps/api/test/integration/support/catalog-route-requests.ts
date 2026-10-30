import { newId } from "@fnb/db";
import Fastify from "fastify";
import type { ApiContext } from "../../../src/api-context";
import { registerCatalogRoutes } from "../../../src/routes/catalog/register-catalog-routes";
import { type CatalogShop, expectStatus } from "./catalog-shop";
import { pearlMilkTeaDocument } from "./pearl-milk-tea-document";

export interface CatalogRequest {
  method: "GET" | "PUT" | "POST" | "DELETE";
  url: string;
  payload?: object;
}

/** A write route, how to make a fresh request to it, and how to see whether it took effect. */
export interface CatalogWrite {
  /** As registered, e.g. "PUT /catalog/products/:id". */
  route: string;
  /** What a member allowed to edit the menu is answered. */
  status: number;
  prepare(shop: CatalogShop): Promise<{ request: CatalogRequest; effect: CatalogRequest }>;
}

/** A product saved by the shop's owner, for writes that act on an existing one. */
async function savedProduct(shop: CatalogShop) {
  const product = pearlMilkTeaDocument(shop);
  await expectStatus(shop.call("PUT", product.url, product.body), 201);
  return product;
}

const categories = (shop: CatalogShop): CatalogRequest => ({
  method: "GET",
  url: `/catalog/categories?brandId=${shop.brandId}`,
});

const stations = (shop: CatalogShop): CatalogRequest => ({
  method: "GET",
  url: `/catalog/stations?branchId=${shop.branchId}`,
});

/** Every catalog route that changes the menu. */
export const CATALOG_WRITES: readonly CatalogWrite[] = [
  {
    route: "PUT /catalog/products/:id",
    status: 201,
    prepare: async (shop) => {
      const product = pearlMilkTeaDocument(shop);
      const request = { method: "PUT", url: product.url, payload: product.body } as const;
      return { request, effect: { method: "GET", url: product.url } };
    },
  },
  {
    route: "POST /catalog/products/:id/archive",
    status: 200,
    prepare: async (shop) => {
      const product = await savedProduct(shop);
      const request = { method: "POST", url: `${product.url}/archive` } as const;
      return { request, effect: { method: "GET", url: product.url } };
    },
  },
  {
    route: "POST /catalog/products/:id/unarchive",
    status: 200,
    prepare: async (shop) => {
      const product = await savedProduct(shop);
      await expectStatus(shop.call("POST", `${product.url}/archive`), 200);
      const stored = (await expectStatus(shop.call("GET", product.url), 200)).json() as { version: number };
      const request = { method: "POST", url: `${product.url}/unarchive`, payload: { version: stored.version } } as const;
      return { request, effect: { method: "GET", url: product.url } };
    },
  },
  {
    route: "PUT /catalog/price-lists/:id",
    status: 201,
    prepare: async (shop) => {
      const url = `/catalog/price-lists/${newId()}`;
      const payload = { version: null, brandId: shop.brandId, name: "Giờ vàng", items: [] };
      return { request: { method: "PUT", url, payload }, effect: { method: "GET", url } };
    },
  },
  {
    route: "DELETE /catalog/price-lists/:id",
    status: 204,
    prepare: async (shop) => {
      const url = `/catalog/price-lists/${newId()}`;
      const payload = { version: null, brandId: shop.brandId, name: "Giờ vàng", items: [] };
      await expectStatus(shop.call("PUT", url, payload), 201);
      return {
        request: { method: "DELETE", url: `${url}?version=1` },
        effect: { method: "GET", url: `/catalog/price-lists?brandId=${shop.brandId}` },
      };
    },
  },
  {
    route: "PUT /catalog/availability",
    status: 200,
    prepare: async (shop) => {
      const product = await savedProduct(shop);
      const payload = { productId: product.ids.product, branchId: shop.branchId, available: false };
      return {
        request: { method: "PUT", url: "/catalog/availability", payload },
        effect: { method: "GET", url: `/catalog/availability?branchId=${shop.branchId}` },
      };
    },
  },
  {
    route: "PUT /catalog/categories/:id",
    status: 201,
    prepare: async (shop) => {
      const payload = { version: null, brandId: shop.brandId, name: "Cà phê" };
      const request = { method: "PUT", url: `/catalog/categories/${newId()}`, payload } as const;
      return { request, effect: categories(shop) };
    },
  },
  {
    route: "DELETE /catalog/categories/:id",
    status: 204,
    prepare: async (shop) => {
      const url = `/catalog/categories/${newId()}`;
      await expectStatus(
        shop.call("PUT", url, { version: null, brandId: shop.brandId, name: "Bánh" }),
        201,
      );
      return { request: { method: "DELETE", url: `${url}?version=1` }, effect: categories(shop) };
    },
  },
  {
    route: "PUT /catalog/stations/:id",
    status: 201,
    prepare: async (shop) => {
      const payload = { version: null, branchId: shop.branchId, name: "Bếp" };
      const request = { method: "PUT", url: `/catalog/stations/${newId()}`, payload } as const;
      return { request, effect: stations(shop) };
    },
  },
  {
    route: "POST /catalog/stations/:id/unarchive",
    status: 200,
    prepare: async (shop) => {
      // A station a retired product still names is archived, not deleted, when it is removed.
      const stationId = newId();
      const url = `/catalog/stations/${stationId}`;
      await expectStatus(
        shop.call("PUT", url, { version: null, branchId: shop.branchId, name: "Bếp cũ" }),
        201,
      );
      const product = pearlMilkTeaDocument({ ...shop, stationId });
      await expectStatus(shop.call("PUT", product.url, product.body), 201);
      await expectStatus(shop.call("POST", `${product.url}/archive`), 200);
      await expectStatus(shop.call("DELETE", `${url}?version=1`), 200);
      return {
        request: { method: "POST", url: `${url}/unarchive`, payload: { version: 2 } },
        effect: stations(shop),
      };
    },
  },
  {
    route: "DELETE /catalog/stations/:id",
    status: 200,
    prepare: async (shop) => {
      const url = `/catalog/stations/${newId()}`;
      await expectStatus(
        shop.call("PUT", url, { version: null, branchId: shop.branchId, name: "Bếp" }),
        201,
      );
      return { request: { method: "DELETE", url: `${url}?version=1` }, effect: stations(shop) };
    },
  },
];

/** The same request made unacceptable: an empty body, or a malformed id where there is no body. */
export function malformed(request: CatalogRequest): CatalogRequest {
  if (request.payload !== undefined) return { ...request, payload: {} };
  return { ...request, url: request.url.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/, "not-a-uuid") };
}

/**
 * "METHOD /path" of every route registerCatalogRoutes adds, read from a bare Fastify so the
 * list comes from the code, not from memory. Fastify's automatic HEAD twins are left out.
 */
export async function registeredCatalogRoutes(): Promise<string[]> {
  const probe = Fastify();
  const routes: string[] = [];
  probe.addHook("onRoute", (route) => {
    for (const method of [route.method].flat()) {
      if (method !== "HEAD") routes.push(`${method} ${route.url}`);
    }
  });
  const hook = async () => undefined;
  const context = { requireSession: hook, requirePermission: () => hook } as unknown as ApiContext;
  registerCatalogRoutes(probe, context);
  await probe.ready();
  await probe.close();
  return routes.sort();
}
