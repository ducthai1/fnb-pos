import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { line, orderIdOf, pay, pushOne, saveDraft, tillsClock } from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
const archived = newId();

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: tillsClock() });
  s = await syncShop(app, pool);
  await withTenant(pool, s.shop.tenantId, (client) =>
    client.query(
      "INSERT INTO product (id, tenant_id, brand_id, kind, name, base_price, pricing_mode, archived_at) " +
        "VALUES ($1, $2, $3, 'prepared_drink', 'Bạc xỉu', 30000, 'fixed', now())",
      [archived, s.shop.tenantId, s.brandId],
    ),
  );
});

const orderRows = (orderId: string) =>
  withTenant(
    pool,
    s.shop.tenantId,
    async (client) =>
      (await client.query("SELECT count(*)::int AS n FROM sales_order WHERE id = $1", [orderId]))
        .rows[0].n,
  );

afterAll(async () => {
  await app.close();
  await pool.end();
});

const extraShot = (quantity = 1) => ({
  groupId: s.menu.coffee.extrasGroup,
  optionId: s.menu.coffee.extraShot,
  quantity,
});

describe("order.save_draft refuses", () => {
  it.each([
    [
      "a product this brand does not sell",
      () => [line("0199f000-0000-7000-8000-000000000000")],
      "SYNC_PRODUCT_NOT_FOUND",
    ],
    ["a product taken off the menu", () => [line(archived)], "SYNC_PRODUCT_NOT_FOUND"],
    [
      "a combo, whose slot choices it cannot carry yet",
      () => [line(s.menu.combo)],
      "SYNC_COMBO_NOT_SUPPORTED",
    ],
    [
      "more options than the group allows",
      () => [line(s.menu.coffee.id, { modifiers: [extraShot(3)] })],
      "DOMAIN_CATALOG_TOO_MANY_MODIFIER_SELECTIONS",
    ],
    [
      "a sized drink without its size",
      () => [line(s.menu.peachTea.id)],
      "DOMAIN_CATALOG_VARIANT_REQUIRED",
    ],
    [
      "a zero quantity",
      () => [line(s.menu.coffee.id, { quantity: "0" })],
      "DOMAIN_ORDER_NON_POSITIVE_QUANTITY",
    ],
  ])("%s and stores the order nowhere", async (_case, lines, code) => {
    const sent = saveDraft(s.tillA, lines());
    const result = await pushOne(app, s.tillA, sent);
    expect(result).toEqual({ commandId: sent.commandId, status: "rejected", code });
    expect(await orderRows(orderIdOf(sent))).toBe(0);
  });

  it("changing a paid order, and answers with the order as it was paid", async () => {
    const draft = saveDraft(s.tillA, [line(s.menu.coffee.id)]);
    await pushOne(app, s.tillA, draft);
    await pushOne(app, s.tillA, pay(s.tillA, orderIdOf(draft), 29_000));
    const edit = await pushOne(app, s.tillA, saveDraft(s.tillA, [], { orderId: orderIdOf(draft) }));
    expect(edit).toMatchObject({ status: "rejected", code: "DOMAIN_ORDER_ALREADY_PAID" });
    expect(edit.snapshot?.status).toBe("paid");
    expect(edit.snapshot?.lines).toHaveLength(1);
  });

  it("an order id another branch already uses, without showing that order", async () => {
    const theirs = saveDraft(s.otherBranchTill, [line(s.menu.coffee.id)]);
    expect((await pushOne(app, s.otherBranchTill, theirs)).status).toBe("accepted");
    const ours = saveDraft(s.tillA, [], { orderId: orderIdOf(theirs) });
    expect(await pushOne(app, s.tillA, ours)).toEqual({
      commandId: ours.commandId,
      status: "rejected",
      code: "SYNC_ORDER_ID_TAKEN",
    });
  });

  it("a line id that belongs to another order", async () => {
    const coffee = line(s.menu.coffee.id);
    await pushOne(app, s.tillA, saveDraft(s.tillA, [coffee]));
    const reused = await pushOne(app, s.tillA, saveDraft(s.tillA, [coffee]));
    expect(reused).toMatchObject({ status: "rejected", code: "SYNC_LINE_ID_TAKEN" });
  });

  it("a device order number the till already gave another order", async () => {
    const first = saveDraft(s.tillA, [line(s.menu.coffee.id)]);
    await pushOne(app, s.tillA, first);
    const number = (first.payload as { deviceOrderNo: number }).deviceOrderNo;
    const again = await pushOne(app, s.tillA, saveDraft(s.tillA, [], { deviceOrderNo: number }));
    expect(again).toMatchObject({ status: "rejected", code: "SYNC_DEVICE_ORDER_NO_TAKEN" });
  });
});
