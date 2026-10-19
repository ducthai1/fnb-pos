import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { CHECK_VIOLATION, FOREIGN_KEY_VIOLATION, insertAttempt } from "../support/insert-attempt";
import { type TenantGraph, seedTenantGraph } from "../support/tenant-graph";

// The price list item CHECKs repeat validatePriceListItem, so an item the domain would
// refuse to price with cannot be stored either.
const info = inject("testPostgres");

let app: pg.Pool;
let a: TenantGraph;
let b: TenantGraph;

beforeAll(async () => {
  app = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  a = await seedTenantGraph(app);
  b = await seedTenantGraph(app);
});

afterAll(async () => {
  await app.end();
});

const tenPercentOff = { effect_kind: "percent_off", percent_off_bp: 1000, rounding: "half-up" };
const item = (cells: Record<string, unknown>) =>
  insertAttempt(app, a.tenantId, "price_list_item", {
    price_list_id: a.ids.price_list,
    scope_kind: "global",
    ...tenPercentOff,
    ...cells,
  });

describe("a price list item", () => {
  it.each([
    {},
    { scope_kind: "category", scope_id: "category" },
    {
      scope_kind: "variant",
      scope_id: "variant",
      effect_kind: "fixed_price",
      percent_off_bp: null,
      rounding: null,
      fixed_price: 0,
    },
    { days_of_week: [0, 6], start_minute: 1320, end_minute: 120 },
    { start_minute: 0, end_minute: 1440, valid_from: new Date(1), valid_to: new Date(2) },
    { percent_off_bp: 10000, rounding: "half-even" },
  ])("accepts %o", async (cells) => {
    expect(await item(withScopes(cells))).toBe("no-error");
  });

  it.each([
    { scope_kind: "global", scope_id: "product" },
    { scope_kind: "product", scope_id: null },
    { scope_kind: "brand", scope_id: "product" },
    { effect_kind: "fixed_price", fixed_price: 20_000, percent_off_bp: null, rounding: null },
    {
      scope_kind: "product",
      scope_id: "product",
      effect_kind: "fixed_price",
      percent_off_bp: null,
      rounding: null,
    },
    {
      scope_kind: "product",
      scope_id: "product",
      effect_kind: "fixed_price",
      fixed_price: -1,
      percent_off_bp: null,
      rounding: null,
    },
    { scope_kind: "product", scope_id: "product", effect_kind: "fixed_price", fixed_price: 1 },
    { percent_off_bp: 10001 },
    { percent_off_bp: null },
    { rounding: null },
    { rounding: "nearest" },
    { days_of_week: [] },
    { days_of_week: [1, 7] },
    { start_minute: 600, end_minute: 600 },
    { start_minute: 600, end_minute: null },
    { start_minute: 1440, end_minute: 60 },
    { valid_from: new Date(2), valid_to: new Date(2) },
    { channel_key: "" },
  ])("rejects %o", async (cells) => {
    expect(await item(withScopes(cells))).toBe(CHECK_VIOLATION);
  });

  it.each(["variant", "product", "category"] as const)(
    "refuses a %s scope of another tenant, even knowing its id",
    async (kind) => {
      const own = {
        variant: a.ids.product_variant,
        product: a.ids.product,
        category: a.ids.category,
      };
      const other = {
        variant: b.ids.product_variant,
        product: b.ids.product,
        category: b.ids.category,
      };
      expect(await item({ scope_kind: kind, scope_id: own[kind] })).toBe("no-error");
      expect(await item({ scope_kind: kind, scope_id: other[kind] })).toBe(FOREIGN_KEY_VIOLATION);
    },
  );

  it("refuses a branch of another tenant", async () => {
    expect(await item({ branch_id: a.ids.branch })).toBe("no-error");
    expect(await item({ branch_id: b.ids.branch })).toBe(FOREIGN_KEY_VIOLATION);
  });
});

function withScopes(cells: Record<string, unknown>): Record<string, unknown> {
  const ids: Record<string, string> = {
    variant: a.ids.product_variant,
    product: a.ids.product,
    category: a.ids.category,
  };
  const scopeId = cells.scope_id;
  return typeof scopeId === "string" ? { ...cells, scope_id: ids[scopeId] } : cells;
}
