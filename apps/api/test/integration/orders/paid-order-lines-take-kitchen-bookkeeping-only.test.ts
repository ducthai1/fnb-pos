import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { orderMovedThrough } from "../support/closed-sales-orders";
import { postgresRefusal } from "../support/postgres-error-code";
import { type TenantGraph, seedTenantGraph } from "../support/tenant-graph";

const info = inject("testPostgres");
const RAISE_EXCEPTION = "P0001";

let app: pg.Pool;
let owner: pg.Pool;
let a: TenantGraph;

beforeAll(async () => {
  app = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  owner = new pg.Pool({ connectionString: testConnectionString(info, "owner") });
  a = await seedTenantGraph(app);
});

afterAll(async () => {
  await Promise.all([app.end(), owner.end()]);
});

// One transaction per statement: a refused statement aborts the transaction it ran in.
const update = (pool: pg.Pool, set: string, lineId: string) =>
  postgresRefusal(() =>
    withTenant(pool, a.tenantId, (client) =>
      client.query(`UPDATE sales_order_line SET ${set} WHERE id = $1`, [lineId]),
    ),
  );
const lineOf = (lineId: string) =>
  withTenant(app, a.tenantId, async (client) => {
    const { rows } = await client.query(
      "SELECT quantity::text, sent_quantity::text AS sent, sent_note AS note FROM sales_order_line " +
        "WHERE id = $1",
      [lineId],
    );
    return rows[0];
  });

const KITCHEN_SEND = "sent_quantity = 2, sent_note = 'ít đá', version = version + 1";

describe("the lines of a paid order", () => {
  it("take the kitchen's sent state growing, and nothing else changes", async () => {
    const { lineId } = await orderMovedThrough(app, a, ["paid"]);
    expect((await update(app, KITCHEN_SEND, lineId)).code).toBe("no-error");
    expect(await lineOf(lineId)).toEqual({ quantity: "2.000", sent: "2.000", note: "ít đá" });
  });

  it.each([
    ["the sent units shrinking", "sent_quantity = 0"],
    ["the units sold, even beside a kitchen send", `${KITCHEN_SEND}, quantity = 3`],
    ["the note sold", "note = 'nhiều đá'"],
  ])("refuse %s, the schema owner included", async (_label, set) => {
    const { lineId } = await orderMovedThrough(app, a, ["paid"]);
    await update(app, "sent_quantity = 1", lineId);
    for (const pool of [app, owner]) {
      const refusal = await update(pool, set, lineId);
      expect(refusal.code).toBe(RAISE_EXCEPTION);
      expect(refusal.message).toMatch(/^sales_order_line of a closed sales_order \(paid\)/);
    }
    expect(await lineOf(lineId)).toMatchObject({ quantity: "2.000", sent: "1.000" });
  });
});

describe.each(["posted", "cancelled"] as const)("the lines of a %s order", (status) => {
  it("refuse even the kitchen's sent state", async () => {
    const path = status === "posted" ? (["paid", "posted"] as const) : (["cancelled"] as const);
    const { lineId } = await orderMovedThrough(app, a, path);
    const refusal = await update(app, KITCHEN_SEND, lineId);
    expect(refusal.code).toBe(RAISE_EXCEPTION);
    expect(await lineOf(lineId)).toMatchObject({ sent: "0.000", note: null });
  });
});

const updateHeader = (set: string, orderId: string) =>
  postgresRefusal(() =>
    withTenant(app, a.tenantId, (client) =>
      client.query(`UPDATE sales_order SET ${set} WHERE id = $1`, [orderId]),
    ),
  );
const versionOf = (orderId: string) =>
  withTenant(app, a.tenantId, async (client) => {
    const { rows } = await client.query("SELECT version, status FROM sales_order WHERE id = $1", [
      orderId,
    ]);
    return rows[0];
  });

// A till keeps a server copy only when its version is newer, so the kitchen's bookkeeping
// on a paid order reaches the tills through the header's version alone.
describe("the header of a paid order", () => {
  it("takes its version moving alone, and stays paid", async () => {
    const { orderId } = await orderMovedThrough(app, a, ["paid"]);
    const before = await versionOf(orderId);
    expect((await updateHeader("version = version + 1, updated_at = now()", orderId)).code).toBe(
      "no-error",
    );
    expect(await versionOf(orderId)).toEqual({ version: before.version + 1, status: "paid" });
  });

  it("refuses its version moving beside anything else", async () => {
    const { orderId } = await orderMovedThrough(app, a, ["paid"]);
    const refusal = await updateHeader("version = version + 1, service_type = 'dine_in'", orderId);
    expect(refusal.code).toBe(RAISE_EXCEPTION);
  });

  it.each([
    ["posted", ["paid", "posted"]],
    ["cancelled", ["cancelled"]],
  ] as const)("is not like a %s one, which refuses even its version alone", async (_s, path) => {
    const { orderId } = await orderMovedThrough(app, a, path);
    expect((await updateHeader("version = version + 1", orderId)).code).toBe(RAISE_EXCEPTION);
  });
});
