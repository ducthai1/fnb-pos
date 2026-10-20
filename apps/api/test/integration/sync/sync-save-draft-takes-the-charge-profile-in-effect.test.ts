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

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: tillsClock() });
  s = await syncShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const CAFE = { pricesIncludeTax: true, serviceCharge: null };
/** Prices before VAT and a 5% service charge on takeaway: one 29.000đ coffee comes to 32.886đ. */
const RESTAURANT = {
  pricesIncludeTax: false,
  serviceCharge: { rate: 500, appliesTo: ["takeaway"], base: "after_discount", taxRate: 800 },
};

async function setProfile(scopeKind: "branch" | "device", scopeId: string, value: unknown) {
  await withTenant(pool, s.shop.tenantId, async (client) => {
    await client.query(
      "DELETE FROM config_value WHERE scope_kind = $1 AND scope_id = $2 AND key = 'charge_profile'",
      [scopeKind, scopeId],
    );
    if (value === undefined) return;
    await client.query(
      "INSERT INTO config_value (id, tenant_id, scope_kind, scope_id, key, value) " +
        "VALUES ($1, $2, $3, $4, 'charge_profile', $5::jsonb)",
      [newId(), s.shop.tenantId, scopeKind, scopeId, JSON.stringify(value)],
    );
  });
}

const coffeeDraft = (till = s.tillA) => saveDraft(till, [line(s.menu.coffee.id)]);

describe("order.save_draft and the charge profile", () => {
  it("opens an order with VAT-inclusive prices and no service charge when nobody set one", async () => {
    const result = await pushOne(app, s.tillA, coffeeDraft());
    expect(result.snapshot?.chargeProfile).toEqual(CAFE);
  });

  it("opens an order with the branch's profile and totals it with that profile", async () => {
    await setProfile("branch", s.shop.branchId, RESTAURANT);
    const draft = coffeeDraft();
    expect((await pushOne(app, s.tillA, draft)).snapshot?.chargeProfile).toEqual(RESTAURANT);
    const atCafePrice = await pushOne(app, s.tillA, pay(s.tillA, orderIdOf(draft), 29_000));
    expect(atCafePrice).toMatchObject({ status: "rejected", code: "DOMAIN_ORDER_TOTAL_MISMATCH" });
    const atItsOwn = await pushOne(app, s.tillA, pay(s.tillA, orderIdOf(draft), 32_886));
    expect(atItsOwn.status).toBe("accepted");
    await setProfile("branch", s.shop.branchId, undefined);
  });

  it("lets one till's own profile win over its branch's, for that till only", async () => {
    await setProfile("branch", s.shop.branchId, RESTAURANT);
    await setProfile("device", s.tillB.deviceId, CAFE);
    const onA = await pushOne(app, s.tillA, coffeeDraft(s.tillA));
    const onB = await pushOne(app, s.tillB, coffeeDraft(s.tillB));
    expect([onA.snapshot?.chargeProfile, onB.snapshot?.chargeProfile]).toEqual([RESTAURANT, CAFE]);
    await setProfile("device", s.tillB.deviceId, undefined);
    await setProfile("branch", s.shop.branchId, undefined);
  });

  it("keeps the profile an order was opened with when the setting changes later", async () => {
    const draft = coffeeDraft();
    await pushOne(app, s.tillA, draft);
    await setProfile("branch", s.shop.branchId, RESTAURANT);
    const again = saveDraft(s.tillA, [line(s.menu.coffee.id)], { orderId: orderIdOf(draft) });
    expect((await pushOne(app, s.tillA, again)).snapshot?.chargeProfile).toEqual(CAFE);
    expect((await pushOne(app, s.tillA, pay(s.tillA, orderIdOf(draft), 29_000))).status).toBe(
      "accepted",
    );
    await setProfile("branch", s.shop.branchId, undefined);
  });

  it.each([
    ["a profile without its tax mode", { serviceCharge: null }],
    [
      "a service charge rate above 100%",
      { ...RESTAURANT, serviceCharge: { ...RESTAURANT.serviceCharge, rate: 10_001 } },
    ],
    ["a profile that is not an object", "café"],
  ])("refuses to open an order while the branch holds %s", async (_case, value) => {
    await setProfile("branch", s.shop.branchId, value);
    const draft = coffeeDraft();
    expect(await pushOne(app, s.tillA, draft)).toEqual({
      commandId: draft.commandId,
      status: "rejected",
      code: "SYNC_SETTING_INVALID",
    });
    await setProfile("branch", s.shop.branchId, undefined);
  });
});
