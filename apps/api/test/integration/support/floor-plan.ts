import { newId, withTenant } from "@fnb/db";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import type pg from "pg";
import { expectStatus } from "./catalog-shop";

type Method = "GET" | "PUT" | "DELETE";

/** A backoffice call as the member behind `cookie`. */
export function floorCall(app: FastifyInstance, cookie: string) {
  return (method: Method, url: string, payload?: object): Promise<LightMyRequestResponse> =>
    app.inject({
      method,
      url,
      headers: { cookie },
      ...(payload === undefined ? {} : { payload }),
    });
}

/** Status and body of a response, the body parsed when there is one. */
export async function answer(pending: Promise<LightMyRequestResponse>) {
  const response = await pending;
  return { status: response.statusCode, body: response.body === "" ? null : response.json() };
}

export const areaBody = (branchId: string, name = "Tầng 1", sortOrder = 0) => ({
  version: null as number | null,
  branchId,
  name,
  sortOrder,
});

export const tableBody = (areaId: string, name = "B01") => ({
  version: null as number | null,
  areaId,
  name,
  x: 40,
  y: 40,
  width: 80,
  height: 80,
  shape: "rectangle",
  seats: 4,
  sortOrder: 0,
});

/** An area of `branchId` created through the API, with one table per name in it. */
export async function areaWithTables(
  app: FastifyInstance,
  cookie: string,
  branchId: string,
  tableNames: readonly string[],
  areaName = "Tầng 1",
) {
  const call = floorCall(app, cookie);
  const areaId = newId();
  await expectStatus(call("PUT", `/floor/areas/${areaId}`, areaBody(branchId, areaName)), 201);
  const tableIds: string[] = [];
  for (const name of tableNames) {
    const tableId = newId();
    await expectStatus(call("PUT", `/floor/tables/${tableId}`, tableBody(areaId, name)), 201);
    tableIds.push(tableId);
  }
  return { areaId, tableIds };
}

/**
 * An order seated at a table, written straight into the database as the app role, for
 * tests about the floor plan rather than about how a till opens a table.
 */
export async function orderSeatedAt(
  pool: pg.Pool,
  shop: { tenantId: string; branchId: string; deviceId: string },
  tableId: string,
  status: "draft" | "cancelled",
): Promise<string> {
  const orderId = newId();
  await withTenant(pool, shop.tenantId, async (client) => {
    await client.query(
      "INSERT INTO sales_order (id, tenant_id, branch_id, device_id, status, service_type, " +
        "business_date, device_order_no, charge_profile, table_id, table_name_snapshot) " +
        "VALUES ($1, $2, $3, $4, 'draft', 'dine_in', '2026-10-20', " +
        // Far above the numbers a test till gives its own orders, so they never collide.
        "(SELECT coalesce(max(device_order_no), 0) + 1000000 FROM sales_order), " +
        `'{"pricesIncludeTax": true, "serviceCharge": null}', $5, 'B01')`,
      [orderId, shop.tenantId, shop.branchId, shop.deviceId, tableId],
    );
    if (status !== "draft") {
      await client.query("UPDATE sales_order SET status = $2 WHERE id = $1", [orderId, status]);
    }
  });
  return orderId;
}
