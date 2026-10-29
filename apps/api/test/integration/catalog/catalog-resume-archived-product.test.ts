import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { type CatalogShop, catalogShop, expectStatus } from "../support/catalog-shop";
import { pearlMilkTeaDocument } from "../support/pearl-milk-tea-document";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let shop: CatalogShop;
let other: CatalogShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  shop = await catalogShop(app, pool);
  other = await catalogShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

/** An archived product of the shop, and the version it has now. */
async function archivedProduct() {
  const tea = pearlMilkTeaDocument(shop);
  await expectStatus(shop.call("PUT", tea.url, tea.body), 201);
  await expectStatus(shop.call("POST", `${tea.url}/archive`), 200);
  const stored = (await expectStatus(shop.call("GET", tea.url), 200)).json() as { version: number; archivedAt: string | null };
  return { tea, version: stored.version, archivedAt: stored.archivedAt };
}

const tillCopies = (id: string) =>
  withTenant(pool, shop.tenant.tenantId, async (client) => {
    const rows = await client.query("SELECT snapshot FROM change_log WHERE entity = 'catalog_product' AND entity_id = $1 ORDER BY change_seq", [id]);
    return rows.rows.map((row) => row.snapshot as { name: string } | null);
  });

describe("POST /catalog/products/:id/unarchive", () => {
  it("puts the product back on the menu under the version the caller saw, and tells the tills", async () => {
    const { tea, version, archivedAt } = await archivedProduct();
    expect(archivedAt).not.toBeNull();
    const answer = await expectStatus(shop.call("POST", `${tea.url}/unarchive`, { version }), 200);
    expect(answer.json()).toEqual({ id: tea.ids.product, version: version + 1, archivedAt: null });
    const stored = (await expectStatus(shop.call("GET", tea.url), 200)).json() as { archivedAt: string | null; version: number; name: string };
    expect(stored).toMatchObject({ archivedAt: null, version: version + 1 });
    const copies = await tillCopies(tea.ids.product);
    expect(copies.at(-2)).toBeNull();
    expect(copies.at(-1)).toMatchObject({ name: stored.name });
    const listed = (await expectStatus(shop.call("GET", `/catalog/products?brandId=${shop.brandId}`), 200)).json() as { id: string; archivedAt: string | null }[];
    expect(listed.find((row) => row.id === tea.ids.product)?.archivedAt).toBeNull();
  });

  it("can be undone by archiving again, and the product keeps its sizes and options", async () => {
    const { tea, version } = await archivedProduct();
    await expectStatus(shop.call("POST", `${tea.url}/unarchive`, { version }), 200);
    const before = (await expectStatus(shop.call("GET", tea.url), 200)).json() as { variants: unknown[]; modifierGroups: unknown[] };
    expect(before.variants.length).toBeGreaterThan(0);
    expect(before.modifierGroups.length).toBeGreaterThan(0);
    await expectStatus(shop.call("POST", `${tea.url}/archive`), 200);
    const after = (await expectStatus(shop.call("GET", tea.url), 200)).json() as { archivedAt: string | null };
    expect(after.archivedAt).not.toBeNull();
  });

  it("refuses a stale version and changes nothing", async () => {
    const { tea, version } = await archivedProduct();
    const stale = await shop.call("POST", `${tea.url}/unarchive`, { version: version - 1 });
    expect([stale.statusCode, stale.json()]).toEqual([409, { code: "API_CATALOG_VERSION_CONFLICT" }]);
    const stored = (await expectStatus(shop.call("GET", tea.url), 200)).json() as { archivedAt: string | null; version: number };
    expect(stored).toMatchObject({ version });
    expect(stored.archivedAt).not.toBeNull();
  });

  it("is a no-op on a product already selling: same version, no word to the tills", async () => {
    const { tea, version } = await archivedProduct();
    await expectStatus(shop.call("POST", `${tea.url}/unarchive`, { version }), 200);
    const copies = (await tillCopies(tea.ids.product)).length;
    const again = await expectStatus(shop.call("POST", `${tea.url}/unarchive`, { version: version + 1 }), 200);
    expect(again.json()).toEqual({ id: tea.ids.product, version: version + 1, archivedAt: null });
    expect((await tillCopies(tea.ids.product)).length).toBe(copies);
  });

  it("answers 404 for an unknown product and for another tenant's, which stays archived", async () => {
    const { tea, version } = await archivedProduct();
    const unknown = await shop.call("POST", `/catalog/products/${newId()}/unarchive`, { version: 1 });
    const theirs = await other.call("POST", `${tea.url}/unarchive`, { version });
    expect([unknown.statusCode, unknown.json(), theirs.statusCode, theirs.json()]).toEqual([
      404, { code: "API_CATALOG_PRODUCT_NOT_FOUND" }, 404, { code: "API_CATALOG_PRODUCT_NOT_FOUND" },
    ]);
    expect(((await shop.call("GET", tea.url)).json() as { archivedAt: string | null }).archivedAt).not.toBeNull();
  });

  it.each([
    ["no body", undefined],
    ["an empty body", {}],
    ["version 0", { version: 0 }],
    ["a text version", { version: "2" }],
    ["a null version", { version: null }],
    ["an extra key", { version: 1, archivedAt: null }],
  ])("refuses %s with 400", async (_label, payload) => {
    const { tea } = await archivedProduct();
    const response = await shop.call("POST", `${tea.url}/unarchive`, payload);
    expect([response.statusCode, response.json()]).toEqual([400, { code: "API_INVALID_REQUEST" }]);
  });

  it("refuses a malformed id", async () => {
    const response = await shop.call("POST", "/catalog/products/not-a-uuid/unarchive", { version: 1 });
    expect(response.statusCode).toBe(400);
  });

  it("is not what saving an archived product does: a save leaves it archived", async () => {
    const { tea, version } = await archivedProduct();
    await expectStatus(shop.call("PUT", tea.url, { ...tea.body, version, name: "Đổi tên" }), 200);
    const stored = (await shop.call("GET", tea.url)).json() as { archivedAt: string | null };
    expect(stored.archivedAt).not.toBeNull();
  });
});
