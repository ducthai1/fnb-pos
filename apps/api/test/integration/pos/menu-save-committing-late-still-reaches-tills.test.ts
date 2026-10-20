import { productDocumentSchema } from "@fnb/contracts";
import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { checkProductDocument } from "../../../src/catalog/product-document-to-domain";
import { writeProductDocument } from "../../../src/catalog/write-product-document";
import { changesOf, feedAfter } from "../support/menu-feed-probes";
import { type MilkTeaTillShop, milkTeaTillShop } from "../support/milk-tea-till-shop";
import { line, pull, push, saveDraft, tillsClock } from "../support/sync-commands";
import { untilSettledOrWaitingOnLock } from "../support/sync-feed-probes";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let m: MilkTeaTillShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: tillsClock() });
  m = await milkTeaTillShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

async function versionOf(url: string): Promise<number> {
  const response = await app.inject({
    method: "GET",
    url,
    headers: { cookie: m.s.shop.managerCookie },
  });
  return (response.json() as { version: number }).version;
}

describe("a menu save still committing while a till pulls", () => {
  it("reaches the till although an order numbered after it committed first", async () => {
    const start = (await feedAfter(app, m.s.tillA.deviceToken)).cursor;
    const input = productDocumentSchema.parse({
      ...m.tea.body,
      version: await versionOf(m.tea.url),
      basePrice: 41_000,
    });
    const checked = checkProductDocument(m.tea.ids.product, input);
    const writer = { tenantId: m.s.shop.tenantId, appUserId: newId(), now: new Date() };
    let release!: () => void;
    let written!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const inside = new Promise<void>((resolve) => (written = resolve));
    // The save has drawn its numbers and stays uncommitted until released.
    const saving = withTenant(pool, writer.tenantId, async (client) => {
      await writeProductDocument(client, writer, input, checked);
      written();
      await held;
    });
    await inside;
    // An order of another till: it touches no row the save holds.
    const draft = saveDraft(m.s.tillB, [line(m.s.menu.coffee.id)]);
    const pushing = push(app, m.s.tillB, [draft]);
    await untilSettledOrWaitingOnLock(pool, pushing);
    const during = await pull(app, m.s.tillA, start);
    release();
    await Promise.all([saving, pushing]);
    const after = await feedAfter(app, m.s.tillA.deviceToken, during.nextCursor);
    const seen = [...during.changes, ...after.changes].map((change) => change.entity);
    expect(seen).toEqual(["catalog_product", "order"]);
  });
});

describe("a modifier group two drinks share", () => {
  const productsSentAfter = async (cursor: string) => {
    const { changes } = await feedAfter(app, m.s.tillA.deviceToken, cursor);
    return changesOf(changes, "catalog_product").map((change) => change.entityId);
  };

  it("sends the other drink again when a save changed the group, and only then", async () => {
    const sugar = m.tea.body.modifierGroups.find((group) => group.id === m.tea.ids.sugar);
    if (sugar === undefined) throw new Error("the tea has no sugar group");
    const greenTea = newId();
    await m.manage("PUT", `/catalog/products/${greenTea}`, {
      version: null,
      brandId: m.s.brandId,
      kind: "prepared_drink",
      name: "Trà xanh",
      basePrice: 25_000,
      pricingMode: "fixed",
      taxRateBp: 800,
      modifierGroups: [sugar],
    });
    const start = (await feedAfter(app, m.s.tillA.deviceToken)).cursor;
    await m.manage("PUT", m.tea.url, {
      ...m.tea.body,
      version: await versionOf(m.tea.url),
      basePrice: 36_000,
    });
    expect(await productsSentAfter(start)).toEqual([m.tea.ids.product]);
    const priced = (await feedAfter(app, m.s.tillA.deviceToken)).cursor;
    const renamed = {
      ...sugar,
      options: sugar.options.map((option, index) =>
        index === 0 ? { ...option, name: "Không đường" } : option,
      ),
    };
    await m.manage("PUT", m.tea.url, {
      ...m.tea.body,
      version: await versionOf(m.tea.url),
      basePrice: 36_000,
      modifierGroups: m.tea.body.modifierGroups.map((group) =>
        group.id === sugar.id ? renamed : group,
      ),
    });
    expect((await productsSentAfter(priced)).sort()).toEqual([m.tea.ids.product, greenTea].sort());
  });
});

describe("a product taken off the menu", () => {
  it("is sent as gone to the brand's tills once, not again when archived twice", async () => {
    const start = {
      q1: (await feedAfter(app, m.s.tillA.deviceToken)).cursor,
      q3: (await feedAfter(app, m.s.otherBranchTill.deviceToken)).cursor,
    };
    const archive = `${m.tea.url}/archive`;
    await m.manage("POST", archive);
    await m.manage("POST", archive);
    for (const [token, cursor] of [
      [m.s.tillA.deviceToken, start.q1],
      [m.s.otherBranchTill.deviceToken, start.q3],
    ] as const) {
      const sent = changesOf((await feedAfter(app, token, cursor)).changes, "catalog_product");
      expect(sent.map((change) => [change.entityId, change.snapshot])).toEqual([
        [m.tea.ids.product, null],
      ]);
    }
  });
});
