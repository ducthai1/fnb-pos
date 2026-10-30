import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { CHECK_VIOLATION, INSUFFICIENT_PRIVILEGE, insertAttempt } from "../support/insert-attempt";
import { postgresErrorCode } from "../support/postgres-error-code";
import { type TenantGraph, UNDELETABLE_TABLES, seedTenantGraph } from "../support/tenant-graph";

// The database repeats the domain's cheap configuration rules, so a row written around the
// API (a script, a future sync path) still cannot hold a menu the POS would choke on.
const info = inject("testPostgres");

let app: pg.Pool;
let a: TenantGraph;

beforeAll(async () => {
  app = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  a = await seedTenantGraph(app);
});

afterAll(async () => {
  await app.end();
});

const insert = (table: string, cells: Record<string, unknown>) =>
  insertAttempt(app, a.tenantId, table, cells);
const asA = <T>(work: (client: pg.PoolClient) => Promise<T>) => withTenant(app, a.tenantId, work);

describe.each(UNDELETABLE_TABLES)("a %s row", (table) => {
  it("can be archived by the app role but never deleted or truncated", async () => {
    const archived = await asA((client) =>
      client.query(`UPDATE ${table} SET archived_at = now() WHERE id = $1`, [a.ids[table]]),
    );
    const deleted = await asA((client) =>
      postgresErrorCode(() => client.query(`DELETE FROM ${table} WHERE id = $1`, [a.ids[table]])),
    );
    const truncated = await postgresErrorCode(() => app.query(`TRUNCATE ${table}`));
    const remaining = await asA((client) =>
      client.query(`SELECT archived_at IS NOT NULL AS archived FROM ${table} WHERE id = $1`, [
        a.ids[table],
      ]),
    );
    expect({ archived: archived.rowCount, deleted, truncated, rows: remaining.rows }).toEqual({
      archived: 1,
      deleted: INSUFFICIENT_PRIVILEGE,
      truncated: INSUFFICIENT_PRIVILEGE,
      rows: [{ archived: true }],
    });
  });
});

describe("the rows that only arrange a product", () => {
  it("can be deleted by the app role, so a product can be rearranged", async () => {
    const deleted = await asA((client) =>
      client.query("DELETE FROM combo_slot_option WHERE id = $1", [a.ids.combo_slot_option]),
    );
    expect(deleted.rowCount).toBe(1);
  });
});

const group = (min_select: number, max_select: number) => ({ name: "x", min_select, max_select });

describe("CHECK constraints mirror the domain's configuration rules", () => {
  it.each([
    ["modifier_group", group(0, 1)],
    ["modifier_group", group(3, 3)],
    ["modifier_option", { modifier_group_id: "group", name: "x", price_delta: 0, max_quantity: 1 }],
    ["product_variant", { product_id: "product", name: "x", price: 0 }],
    [
      "modifier_group_variant_rule",
      { modifier_group_id: "group", variant_id: "fresh", min_select: 2 },
    ],
    ["combo_slot", { product_id: "product", ...group(0, 2) }],
  ])("accept a well-formed %s row %o", async (table, cells) => {
    expect(await insert(table, await withParents(cells))).toBe("no-error");
  });

  it.each([
    ["modifier_group", group(-1, 1)],
    ["modifier_group", group(0, 0)],
    ["modifier_group", group(3, 2)],
    ["modifier_option", { modifier_group_id: "group", name: "x", price_delta: -1 }],
    ["modifier_option", { modifier_group_id: "group", name: "x", max_quantity: 0 }],
    ["product", { brand_id: "brand", kind: "drink", name: "x", pricing_mode: "fixed", code: "X" }],
    ["product", { brand_id: "brand", kind: "combo", name: "x", pricing_mode: "free", code: "X" }],
    [
      "product",
      { brand_id: "brand", kind: "combo", name: "x", pricing_mode: "fixed", base_price: -1, code: "X" },
    ],
    [
      "product",
      { brand_id: "brand", kind: "combo", name: "x", pricing_mode: "fixed", tax_rate_bp: 10001, code: "X" },
    ],
    ["product_variant", { product_id: "product", name: "x", price: -1 }],
    [
      "modifier_group_variant_rule",
      { modifier_group_id: "group", variant_id: "fresh", min_select: 3, max_select: 2 },
    ],
    [
      "modifier_group_variant_rule",
      { modifier_group_id: "group", variant_id: "fresh", max_select: 0 },
    ],
    ["combo_slot", { product_id: "product", ...group(2, 1) }],
    ["combo_slot_option", { combo_slot_id: "slot", product_id: "product", upcharge: -1 }],
    ["product_availability", { product_id: "product", branch_id: "branch", channel_key: "" }],
  ])("reject the %s row %o", async (table, cells) => {
    expect(await insert(table, await withParents(cells))).toBe(CHECK_VIOLATION);
  });
});

/** Swaps the placeholders above for real rows of tenant A; "fresh" is a new variant. */
async function withParents(cells: Record<string, unknown>): Promise<Record<string, unknown>> {
  const parents: Record<string, string> = {
    brand: a.ids.brand,
    branch: a.ids.branch,
    group: a.ids.modifier_group,
    product: a.ids.product,
    slot: a.ids.combo_slot,
  };
  const resolved: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(cells)) {
    if (value === "fresh") resolved[column] = await freshVariant();
    else resolved[column] = typeof value === "string" && value in parents ? parents[value] : value;
  }
  return resolved;
}

async function freshVariant(): Promise<string> {
  const id = newId();
  expect(await insert("product_variant", { id, product_id: a.ids.product, name: "x" })).toBe(
    "no-error",
  );
  return id;
}
