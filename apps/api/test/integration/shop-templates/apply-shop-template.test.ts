import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import { ROLE_TEMPLATES } from "@fnb/domain";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { signedInMember } from "../support/backoffice-accounts";
import { type CatalogShop, catalogShop, expectStatus } from "../support/catalog-shop";
import { createRole } from "../support/roles";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
const cookies = { menuOnly: "", settingsOnly: "", shiftManager: "" };

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

/** A shop of its own: specs change the same branch, so each starts from a fresh tenant. */
async function freshShop(): Promise<CatalogShop> {
  return catalogShop(app, pool);
}

const names = async (shop: CatalogShop, path: string): Promise<string[]> =>
  ((await expectStatus(shop.call("GET", path), 200)).json() as { name: string }[]).map((row) => row.name);
const categoriesOf = (shop: CatalogShop) => names(shop, `/catalog/categories?brandId=${shop.brandId}`);
const stationsOf = (shop: CatalogShop) => names(shop, `/catalog/stations?branchId=${shop.branchId}`);
const apply = (shop: CatalogShop, templateId: string) =>
  shop.call("POST", `/shop-templates/${templateId}/apply`, { branchId: shop.branchId });
const plan = (shop: CatalogShop, templateId: string) =>
  shop.call("GET", `/shop-templates/${templateId}/plan?branchId=${shop.branchId}`);
const flagOf = async (shop: CatalogShop, flag: string) => {
  const view = (await expectStatus(shop.call("GET", `/settings?scope=branch&scopeId=${shop.branchId}`), 200)).json() as {
    entries: { key: string; value: unknown; source: string }[];
  };
  const entry = view.entries.find((each) => each.key === flag);
  return { value: entry?.value, source: entry?.source };
};
const changeCount = (shop: CatalogShop, entity: string) =>
  withTenant(pool, shop.tenant.tenantId, async (client) => {
    const rows = await client.query("SELECT count(*)::int AS n FROM change_log WHERE entity = $1", [entity]);
    return rows.rows[0].n as number;
  });

describe("GET /shop-templates", () => {
  it("lists the five templates with what each holds", async () => {
    const shop = await freshShop();
    const body = (await expectStatus(shop.call("GET", "/shop-templates"), 200)).json() as { templates: { id: string; categories: string[]; stations: string[] }[] };
    expect(body.templates.map((t) => t.id)).toEqual(["cafe", "milk_tea", "restaurant", "bar", "bakery"]);
    expect(body.templates.every((t) => t.categories.length > 0 && t.stations.length > 0)).toBe(true);
  });
});

describe("applying a template to a branch", () => {
  it("adds the categories, stations and switches it is missing and tells the tills", async () => {
    const shop = await freshShop();
    const [categoriesBefore, stationsBefore] = [await categoriesOf(shop), await stationsOf(shop)];
    const [feedCategories, feedStations, feedConfigs] = [await changeCount(shop, "catalog_category"), await changeCount(shop, "catalog_station"), await changeCount(shop, "device_config")];
    const response = await expectStatus(apply(shop, "restaurant"), 200);
    expect(response.json()).toMatchObject({ templateId: "restaurant", branchId: shop.branchId, kept: [] });
    const categories = await categoriesOf(shop);
    const stations = await stationsOf(shop);
    expect(categories).toEqual(expect.arrayContaining([...categoriesBefore, "Khai vị", "Món chính", "Món nước", "Cơm", "Tráng miệng", "Đồ uống"]));
    expect(stations).toEqual(expect.arrayContaining([...stationsBefore, "Bếp nóng", "Bếp lạnh", "Bar nước"]));
    expect(await flagOf(shop, "tables")).toEqual({ value: true, source: "branch" });
    expect(await flagOf(shop, "pay_first_counter")).toEqual({ value: false, source: "branch" });
    expect(await flagOf(shop, "course_firing")).toEqual({ value: true, source: "branch" });
    expect(await changeCount(shop, "catalog_category")).toBe(feedCategories + 6);
    expect(await changeCount(shop, "catalog_station")).toBe(feedStations + 3);
    expect(await changeCount(shop, "device_config")).toBeGreaterThan(feedConfigs);
  });

  it("puts the new categories after the ones already on the menu", async () => {
    const shop = await freshShop();
    await expectStatus(apply(shop, "bar"), 200);
    const rows = (await expectStatus(shop.call("GET", `/catalog/categories?brandId=${shop.brandId}`), 200)).json() as { name: string; sortOrder: number }[];
    const own = rows.find((row) => row.name === "Trà sữa")!;
    const added = rows.filter((row) => ["Bia", "Cocktail", "Rượu mạnh", "Nước giải khát", "Đồ nhắm"].includes(row.name));
    expect(added.map((row) => row.name)).toEqual(["Bia", "Cocktail", "Rượu mạnh", "Nước giải khát", "Đồ nhắm"]);
    expect(added.every((row) => row.sortOrder > own.sortOrder)).toBe(true);
  });

  it("twice is once: the second apply adds nothing and the menu does not grow", async () => {
    const shop = await freshShop();
    await expectStatus(apply(shop, "cafe"), 200);
    const [categories, stations] = [await categoriesOf(shop), await stationsOf(shop)];
    const feed = await changeCount(shop, "catalog_category");
    const second = await expectStatus(apply(shop, "cafe"), 200);
    expect(second.json()).toMatchObject({ changes: [], kept: [] });
    expect(await categoriesOf(shop)).toEqual(categories);
    expect(await stationsOf(shop)).toEqual(stations);
    expect(await changeCount(shop, "catalog_category")).toBe(feed);
  });

  it("two applies at the same moment still add each name once", async () => {
    const shop = await freshShop();
    const answers = await Promise.all([apply(shop, "bakery"), apply(shop, "bakery"), apply(shop, "bakery")]);
    expect(answers.map((a) => a.statusCode)).toEqual([200, 200, 200]);
    const categories = await categoriesOf(shop);
    for (const name of ["Bánh mì", "Bánh ngọt", "Bánh kem"]) expect(categories.filter((c) => c === name)).toHaveLength(1);
    expect((await stationsOf(shop)).filter((s) => s === "Quầy bánh")).toHaveLength(1);
  });

  it("never renames or duplicates what the owner typed, in whatever spelling", async () => {
    const shop = await freshShop();
    await expectStatus(shop.call("PUT", `/catalog/categories/${newId()}`, { version: null, brandId: shop.brandId, name: "  khai VI ", sortOrder: 1 }), 201);
    await expectStatus(shop.call("PUT", `/catalog/stations/${newId()}`, { version: null, branchId: shop.branchId, name: "bep nong" }), 201);
    await expectStatus(apply(shop, "restaurant"), 200);
    const categories = await categoriesOf(shop);
    expect(categories).toContain("khai VI");
    expect(categories).not.toContain("Khai vị");
    expect(await stationsOf(shop)).toContain("bep nong");
    expect(await stationsOf(shop)).not.toContain("Bếp nóng");
  });

  it("leaves a switch the owner chose, and one that would break a rule between switches", async () => {
    const shop = await freshShop();
    await expectStatus(shop.call("PUT", `/settings/branch/${shop.branchId}/tables`, { value: false }), 200);
    const response = (await expectStatus(apply(shop, "restaurant"), 200)).json() as { kept: { flag: string; reason: string }[] };
    expect(response.kept).toEqual(expect.arrayContaining([{ flag: "tables", wanted: true, current: false, reason: "chosen_by_shop" }, { flag: "course_firing", wanted: true, current: false, reason: "breaks_a_rule" }]));
    expect(await flagOf(shop, "tables")).toEqual({ value: false, source: "branch" });
    expect((await flagOf(shop, "course_firing")).value).toBe(false);
    expect(await flagOf(shop, "pay_first_counter")).toEqual({ value: false, source: "branch" });
  });

  it("leaves a switch the brand chose for every branch", async () => {
    const shop = await freshShop();
    await expectStatus(shop.call("PUT", `/settings/brand/${shop.brandId}/pay_first_counter`, { value: false }), 200);
    const response = (await expectStatus(apply(shop, "cafe"), 200)).json() as { kept: { flag: string; reason: string }[] };
    expect(response.kept).toContainEqual({ flag: "pay_first_counter", wanted: true, current: false, reason: "chosen_by_shop" });
    expect(await flagOf(shop, "pay_first_counter")).toEqual({ value: false, source: "brand" });
  });
});

describe("previewing a template", () => {
  it("says what applying would add, writes nothing, and matches what apply then adds", async () => {
    const shop = await freshShop();
    const before = await categoriesOf(shop);
    const previewed = (await expectStatus(plan(shop, "milk_tea"), 200)).json();
    expect(await categoriesOf(shop)).toEqual(before);
    expect((previewed as { changes: { kind: string }[] }).changes.length).toBeGreaterThan(0);
    expect((await expectStatus(apply(shop, "milk_tea"), 200)).json()).toEqual(previewed);
    expect((await expectStatus(plan(shop, "milk_tea"), 200)).json()).toMatchObject({ changes: [] });
  });
});

describe("refusals", () => {
  it("answers an unknown template, a malformed id and another tenant's branch with nothing written", async () => {
    const shop = await freshShop();
    const other = await freshShop();
    const before = await categoriesOf(other);
    const answers = [
      await shop.call("POST", "/shop-templates/nope/apply", { branchId: shop.branchId }),
      await shop.call("GET", "/shop-templates/nope/plan?branchId=" + shop.branchId),
      await shop.call("POST", "/shop-templates/cafe/apply", { branchId: "not-a-uuid" }),
      await shop.call("POST", "/shop-templates/cafe/apply", {}),
      await shop.call("POST", "/shop-templates/cafe/apply", { branchId: shop.branchId, extra: 1 }),
      await shop.call("GET", "/shop-templates/cafe/plan?branchId=not-a-uuid"),
      await shop.call("POST", "/shop-templates/cafe/apply", { branchId: other.branchId }),
      await shop.call("GET", `/shop-templates/cafe/plan?branchId=${other.branchId}`),
      await shop.call("POST", "/shop-templates/cafe/apply", { branchId: newId() }),
    ];
    expect(answers.map((a) => [a.statusCode, a.json().code])).toEqual([
      [404, "API_SHOP_TEMPLATE_NOT_FOUND"],
      [404, "API_SHOP_TEMPLATE_NOT_FOUND"],
      [400, "API_INVALID_REQUEST"],
      [400, "API_INVALID_REQUEST"],
      [400, "API_INVALID_REQUEST"],
      [400, "API_INVALID_REQUEST"],
      [404, "API_CATALOG_BRANCH_NOT_FOUND"],
      [404, "API_CATALOG_BRANCH_NOT_FOUND"],
      [404, "API_CATALOG_BRANCH_NOT_FOUND"],
    ]);
    expect(await categoriesOf(other)).toEqual(before);
  });

  it("needs both edit_menu and manage_settings, and a session", async () => {
    const shop = await freshShop();
    const tenantId = shop.tenant.tenantId;
    const member = async (grants: Parameters<typeof createRole>[2]) => (await signedInMember(app, pool, tenantId, { roleId: await createRole(pool, tenantId, grants) })).cookie;
    cookies.menuOnly = await member([{ key: "edit_menu" }]);
    cookies.settingsOnly = await member([{ key: "manage_settings" }]);
    cookies.shiftManager = await member(ROLE_TEMPLATES.manager.grants);
    const both = await member([{ key: "edit_menu" }, { key: "manage_settings" }]);
    const send = (method: "GET" | "POST", url: string, cookie: string | null, payload?: object) =>
      app.inject({ method, url, headers: cookie === null ? {} : { cookie }, ...(payload === undefined ? {} : { payload }) });
    const before = await categoriesOf(shop);
    const body = { branchId: shop.branchId };
    for (const who of [cookies.menuOnly, cookies.settingsOnly, cookies.shiftManager]) {
      const refused = [await send("POST", "/shop-templates/cafe/apply", who, body), await send("GET", `/shop-templates/cafe/plan?branchId=${shop.branchId}`, who), await send("GET", "/shop-templates", who)];
      expect(refused.map((r) => [r.statusCode, r.json().code])).toEqual(Array(3).fill([403, "API_PERMISSION_DENIED"]));
      // Refused before the request is read: a malformed body says nothing either.
      expect((await send("POST", "/shop-templates/cafe/apply", who, {})).statusCode).toBe(403);
    }
    expect(await categoriesOf(shop)).toEqual(before);
    expect((await send("POST", "/shop-templates/cafe/apply", null, body)).statusCode).toBe(401);
    expect((await send("POST", "/shop-templates/cafe/apply", both, body)).statusCode).toBe(200);
  });
});
