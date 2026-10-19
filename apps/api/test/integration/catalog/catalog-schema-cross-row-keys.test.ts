import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { FOREIGN_KEY_VIOLATION, UNIQUE_VIOLATION, insertAttempt } from "../support/insert-attempt";
import { type TenantGraph, seedTenantGraph } from "../support/tenant-graph";

// Keys the generic cross-tenant test does not reach: a second parent column, or a parent
// that must belong to the same brand or product as the row, not just the same tenant.
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

const insert = (table: string, cells: Record<string, unknown>) =>
  insertAttempt(app, a.tenantId, table, cells);
const aProduct = { kind: "retail_item", name: "x", pricing_mode: "fixed" };

describe("a product", () => {
  it("takes a category and station of its own tenant and brand", async () => {
    const own = { brand_id: a.ids.brand, category_id: a.ids.category, station_id: a.ids.station };
    expect(await insert("product", { ...aProduct, ...own })).toBe("no-error");
  });

  it("refuses a category of another brand, even within its tenant", async () => {
    const otherBrand = newId();
    expect(await insert("brand", { id: otherBrand, name: "Trà Chiều" })).toBe("no-error");
    const cells = { ...aProduct, brand_id: otherBrand, category_id: a.ids.category };
    expect(await insert("product", cells)).toBe(FOREIGN_KEY_VIOLATION);
  });

  it.each(["category_id", "station_id"] as const)(
    "refuses a %s of another tenant",
    async (column) => {
      const parent = column === "category_id" ? b.ids.category : b.ids.station;
      const cells = { ...aProduct, brand_id: a.ids.brand, [column]: parent };
      expect(await insert("product", cells)).toBe(FOREIGN_KEY_VIOLATION);
    },
  );
});

describe("a combo slot option", () => {
  const option = (cells: Record<string, unknown>) =>
    insert("combo_slot_option", { combo_slot_id: a.ids.combo_slot, ...cells });

  it("refuses a variant that belongs to another product than the one it names", async () => {
    const otherProduct = newId();
    expect(await insert("product", { ...aProduct, id: otherProduct, brand_id: a.ids.brand })).toBe(
      "no-error",
    );
    expect(await option({ product_id: otherProduct, variant_id: a.ids.product_variant })).toBe(
      FOREIGN_KEY_VIOLATION,
    );
  });

  it("refuses the same product without variants twice in one slot", async () => {
    const product = newId();
    expect(await insert("product", { ...aProduct, id: product, brand_id: a.ids.brand })).toBe(
      "no-error",
    );
    expect(await option({ product_id: product })).toBe("no-error");
    expect(await option({ product_id: product, upcharge: 5_000 })).toBe(UNIQUE_VIOLATION);
  });
});

describe("a manual 86", () => {
  it("is stored once per product, branch and channel, all channels included", async () => {
    const product = newId();
    expect(await insert("product", { ...aProduct, id: product, brand_id: a.ids.brand })).toBe(
      "no-error",
    );
    const off = (channel_key: string | null) =>
      insert("product_availability", { product_id: product, branch_id: a.ids.branch, channel_key });
    expect([await off(null), await off("grab"), await off(null), await off("grab")]).toEqual([
      "no-error",
      "no-error",
      UNIQUE_VIOLATION,
      UNIQUE_VIOLATION,
    ]);
  });

  it("refuses a branch of another tenant", async () => {
    const cells = { product_id: a.ids.product, branch_id: b.ids.branch, channel_key: "shopee" };
    expect(await insert("product_availability", cells)).toBe(FOREIGN_KEY_VIOLATION);
  });
});
