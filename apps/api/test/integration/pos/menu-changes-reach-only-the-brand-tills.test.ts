import { POS_FEED_ENTITY, POS_FEED_SNAPSHOT_SCHEMAS, type PosBootstrap } from "@fnb/contracts";
import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import {
  changesOf,
  feedAfter,
  type OtherBrandTill,
  otherBrandTill,
  withoutVersion,
} from "../support/menu-feed-probes";
import { type MilkTeaTillShop, bootstrapOf, milkTeaTillShop } from "../support/milk-tea-till-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let m: MilkTeaTillShop;
let q7: OtherBrandTill;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  m = await milkTeaTillShop(app, pool);
  q7 = await otherBrandTill(app, pool, m.s.shop);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

/** Where each till's feed stands now, so a test reads only what it caused. */
async function cursors() {
  return {
    q1: (await feedAfter(app, m.s.tillA.deviceToken)).cursor,
    q3: (await feedAfter(app, m.s.otherBranchTill.deviceToken)).cursor,
    q7: (await feedAfter(app, q7.deviceToken)).cursor,
  };
}

async function teaVersion(): Promise<number> {
  const response = await app.inject({
    method: "GET",
    url: m.tea.url,
    headers: { cookie: m.s.shop.managerCookie },
  });
  return (response.json() as { version: number }).version;
}

const copyIn = (boot: PosBootstrap, id: string) =>
  boot.menu.products.find((product) => product.id === id);

describe("a menu edited in the backoffice", () => {
  it("sends a drink's new price to every till of its brand, as the bootstrap would give it", async () => {
    const start = await cursors();
    const body = { ...m.tea.body, version: await teaVersion(), basePrice: 39_000 };
    await m.manage("PUT", m.tea.url, body);
    for (const [token, cursor] of [
      [m.s.tillA.deviceToken, start.q1],
      [m.s.otherBranchTill.deviceToken, start.q3],
    ] as const) {
      const sent = changesOf((await feedAfter(app, token, cursor)).changes, "catalog_product");
      expect(sent.map((change) => change.entityId)).toEqual([m.tea.ids.product]);
      expect((sent[0]?.snapshot as { basePrice: number }).basePrice).toBe(39_000);
      const copy = POS_FEED_SNAPSHOT_SCHEMAS.catalog_product.parse(sent[0]?.snapshot);
      const boot = await bootstrapOf(app, token);
      expect(withoutVersion(copy)).toEqual(withoutVersion(copyIn(boot, m.tea.ids.product)));
    }
  });

  it("keeps one brand's menu away from the tills of another brand of the tenant", async () => {
    const start = await cursors();
    const body = { ...m.tea.body, version: await teaVersion(), basePrice: 37_000 };
    await m.manage("PUT", m.tea.url, body);
    const bakery = newId();
    await m.manage("PUT", `/catalog/products/${bakery}`, {
      version: null,
      brandId: q7.brandId,
      kind: "prepared_item",
      name: "Bánh mì ốp la",
      basePrice: 25_000,
      pricingMode: "fixed",
      taxRateBp: 800,
    });
    const atQ7 = changesOf(
      (await feedAfter(app, q7.deviceToken, start.q7)).changes,
      "catalog_product",
    );
    const atQ1 = changesOf(
      (await feedAfter(app, m.s.tillA.deviceToken, start.q1)).changes,
      "catalog_product",
    );
    expect(atQ7.map((change) => change.entityId)).toEqual([bakery]);
    expect(atQ1.map((change) => change.entityId)).toEqual([m.tea.ids.product]);
  });

  it("tells a branch's tills when a drink sells out there and when it is back, and no one else", async () => {
    const start = await cursors();
    const sale = { productId: m.tea.ids.product, branchId: m.s.shop.branchId, channelKey: null };
    await m.manage("PUT", "/catalog/availability", { ...sale, available: false });
    await m.manage("PUT", "/catalog/availability", { ...sale, available: true });
    const atQ1 = changesOf(
      (await feedAfter(app, m.s.tillA.deviceToken, start.q1)).changes,
      POS_FEED_ENTITY.availability,
      m.tea.ids.product,
    );
    expect(atQ1.map((change) => withoutVersion(change.snapshot))).toEqual([
      { productId: m.tea.ids.product, entries: [{ channelKey: null, unavailableUntil: null }] },
      { productId: m.tea.ids.product, entries: [] },
    ]);
    const atQ3 = (await feedAfter(app, m.s.otherBranchTill.deviceToken, start.q3)).changes;
    expect(changesOf(atQ3, POS_FEED_ENTITY.availability)).toEqual([]);
  });

  it("gives each branch the price list as it applies there", async () => {
    const start = await cursors();
    const current = await app.inject({
      method: "GET",
      url: `/catalog/price-lists/${m.priceListId}`,
      headers: { cookie: m.s.shop.managerCookie },
    });
    const { version, brandId, items } = current.json() as Record<string, unknown>;
    const renamed = { version, brandId, items, name: "Giờ vàng mới" };
    await m.manage("PUT", `/catalog/price-lists/${m.priceListId}`, renamed);
    const itemsAt = async (token: string, cursor: string) => {
      const [change] = changesOf((await feedAfter(app, token, cursor)).changes, "price_list");
      const copy = POS_FEED_SNAPSHOT_SCHEMAS.price_list.parse(change?.snapshot);
      return (copy as { items: { id: string }[] }).items.map((item) => item.id).sort();
    };
    expect(await itemsAt(m.s.tillA.deviceToken, start.q1)).toEqual([m.everyBranchItemId]);
    expect(await itemsAt(m.s.otherBranchTill.deviceToken, start.q3)).toEqual(
      [m.everyBranchItemId, m.otherBranchItemId].sort(),
    );
    const atQ7 = (await feedAfter(app, q7.deviceToken, start.q7)).changes;
    expect(changesOf(atQ7, "price_list")).toEqual([]);
  });

  it("sends a station only to its own branch, and a removed category as gone", async () => {
    const start = await cursors();
    await m.manage("PUT", `/catalog/stations/${m.stationId}`, {
      version: 1,
      branchId: m.s.shop.branchId,
      name: "Quầy pha chế",
    });
    const spare = newId();
    const category = { version: null, brandId: m.s.brandId, name: "Món mùa", sortOrder: 9 };
    await m.manage("PUT", `/catalog/categories/${spare}`, category);
    await m.manage("DELETE", `/catalog/categories/${spare}`);
    const atQ1 = (await feedAfter(app, m.s.tillA.deviceToken, start.q1)).changes;
    const atQ3 = (await feedAfter(app, m.s.otherBranchTill.deviceToken, start.q3)).changes;
    expect(changesOf(atQ1, "catalog_station").map((change) => change.entityId)).toEqual([
      m.stationId,
    ]);
    expect(changesOf(atQ3, "catalog_station")).toEqual([]);
    for (const changes of [atQ1, atQ3]) {
      const sent = changesOf(changes, "catalog_category", spare);
      expect(sent.map((change) => change.snapshot === null)).toEqual([false, true]);
    }
  });
});
