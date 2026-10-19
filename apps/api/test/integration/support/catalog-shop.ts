import { newId } from "@fnb/db";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import type pg from "pg";
import { signedInMember } from "./backoffice-accounts";
import { type TenantGraph, seedTenantGraph } from "./tenant-graph";

type Method = "GET" | "PUT" | "POST" | "DELETE";

export interface CatalogShop {
  tenant: TenantGraph;
  brandId: string;
  branchId: string;
  /** A category and a station created through the API, for products to use. */
  categoryId: string;
  stationId: string;
  call(method: Method, url: string, payload?: unknown): Promise<LightMyRequestResponse>;
}

/** A tenant with a signed-in manager, one category ("Trà sữa") and one station ("Bar"). */
export async function catalogShop(app: FastifyInstance, pool: pg.Pool): Promise<CatalogShop> {
  const tenant = await seedTenantGraph(pool);
  const { cookie } = await signedInMember(app, pool, tenant.tenantId);
  const call = (method: Method, url: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      headers: { cookie },
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
  const categoryId = newId();
  const stationId = newId();
  await expectStatus(
    call("PUT", `/catalog/categories/${categoryId}`, {
      version: null,
      brandId: tenant.ids.brand,
      name: "Trà sữa",
      sortOrder: 1,
    }),
    201,
  );
  await expectStatus(
    call("PUT", `/catalog/stations/${stationId}`, {
      version: null,
      branchId: tenant.ids.branch,
      name: "Bar",
    }),
    201,
  );
  return {
    tenant,
    brandId: tenant.ids.brand,
    branchId: tenant.ids.branch,
    categoryId,
    stationId,
    call,
  };
}

/** The response, after failing loudly if its status is not the expected one. */
export async function expectStatus(
  pending: Promise<LightMyRequestResponse>,
  status: number,
): Promise<LightMyRequestResponse> {
  const response = await pending;
  if (response.statusCode !== status) {
    throw new Error(`expected ${status}, got ${response.statusCode}: ${response.body}`);
  }
  return response;
}
