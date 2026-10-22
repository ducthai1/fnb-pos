import type { PosBootstrap } from "@fnb/contracts";
import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import { isDomainError, validateModifierSelection } from "@fnb/domain";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { type MilkTeaTillShop, bootstrapOf, milkTeaTillShop } from "../support/milk-tea-till-shop";
import {
  SERVER_STARTS_AT,
  line,
  pullAll,
  pushOne,
  saveDraft,
  tillsClock,
} from "../support/sync-commands";
import { createStaff } from "../support/staffed-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let m: MilkTeaTillShop;
let q1: PosBootstrap;
let leaverId: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: tillsClock() });
  m = await milkTeaTillShop(app, pool);
  const leaver = await createStaff(app, m.s.shop, { pin: "4826", displayName: "Hùng" });
  leaverId = leaver.json().staffId;
  await withTenant(pool, m.s.shop.tenantId, (client) =>
    client.query("UPDATE staff SET active = false WHERE id = $1", [leaverId]),
  );
  q1 = await bootstrapOf(app, m.s.tillA.deviceToken);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const teaOf = (boot: PosBootstrap) =>
  boot.menu.products.find((product) => product.id === m.tea.ids.product);

describe("what a till starts with", () => {
  it("tells the till where it is and who may sign in on it, without a staff session", () => {
    expect(q1.device).toEqual({
      id: m.s.tillA.deviceId,
      name: "Quầy Q1",
      branchId: m.s.shop.branchId,
    });
    expect(q1.branch).toEqual({
      id: m.s.shop.branchId,
      brandId: m.s.brandId,
      name: "Q1",
      utcOffsetMinutes: 420,
      businessDayStartMinute: 240,
    });
    expect(q1.brand).toEqual({ id: m.s.brandId, name: "Phở Sáng" });
    const staff = new Map(q1.staff.map((member) => [member.id, member]));
    expect(staff.get(m.s.tillA.staffId)).toEqual({
      id: m.s.tillA.staffId,
      displayName: "Lan",
      active: true,
    });
    // Someone locked out of the tills is not on the PIN screen at all.
    expect(staff.has(leaverId)).toBe(false);
    expect(staff.has(m.s.otherBranchTill.staffId)).toBe(false);
  });

  it("sends the till's settings resolved down to the defaults", () => {
    expect(q1.config.id).toBe(m.s.tillA.deviceId);
    expect(q1.config.flags["pay_first_counter"]).toBe(true);
    expect(q1.config.flags["tables"]).toBe(false);
    expect(q1.config.settings).toEqual({
      void_after_sent_needs_approval: true,
      payment_account: null,
      einvoice_profile: null,
      payment_wallets: [],
    });
    expect(q1.config.chargeProfile).toEqual({ pricesIncludeTax: true, serviceCharge: null });
  });
});

describe("the menu a till starts with", () => {
  it("holds the milk tea as the domain prices it, its shared groups written out", () => {
    const { ids, body } = m.tea;
    expect(teaOf(q1)).toEqual({
      id: ids.product,
      version: Number(q1.cursor),
      brandId: m.s.brandId,
      categoryId: m.categoryId,
      stationId: m.stationId,
      kind: "prepared_drink",
      name: "Trà sữa trân châu",
      basePrice: 35_000n,
      pricingMode: "fixed",
      taxRate: 800,
      trackStock: false,
      earnsPoints: true,
      printCupLabel: true,
      variants: [
        { id: ids.sizeM, name: "M", price: null },
        { id: ids.sizeL, name: "L", price: 45_000n },
      ],
      modifierGroups: body.modifierGroups.map((group) => ({
        ...group,
        options: group.options.map((option) => ({
          ...option,
          priceDelta: BigInt(option.priceDelta),
        })),
      })),
      combo: null,
    });
  });

  it("carries the per-size topping limit the domain enforces at the till", () => {
    const tea = teaOf(q1);
    if (tea === undefined) throw new Error("milk tea missing from the bootstrap");
    const [sugar, ice] = m.tea.body.modifierGroups.map((group) => group.options[0]?.id ?? "");
    const choices = [
      { groupId: m.tea.ids.sugar, optionId: sugar ?? "", quantity: 1 },
      { groupId: m.tea.ids.ice, optionId: ice ?? "", quantity: 1 },
      { groupId: m.tea.ids.topping, optionId: m.tea.ids.pearl, quantity: 4 },
    ];
    const onL = validateModifierSelection(tea, m.tea.ids.sizeL, choices);
    expect(onL.map((pick) => pick.priceDelta)).toEqual([0n, 0n, 20_000n]);
    let refusal: unknown;
    try {
      validateModifierSelection(tea, m.tea.ids.sizeM, choices);
    } catch (error) {
      refusal = error;
    }
    expect(isDomainError(refusal)).toBe(true);
  });

  it("holds the brand's categories and only the branch's own stations", () => {
    expect(q1.menu.categories).toContainEqual({
      id: m.categoryId,
      version: Number(q1.cursor),
      brandId: m.s.brandId,
      name: "Trà sữa",
      sortOrder: 1,
    });
    expect(q1.menu.stations.map((station) => station.id)).toEqual([m.stationId]);
  });

  it("holds the price items that can apply at the branch, not another branch's", async () => {
    const itemsAt = (boot: PosBootstrap) =>
      boot.menu.priceLists.find((list) => list.id === m.priceListId)?.items.map((item) => item.id);
    expect(itemsAt(q1)).toEqual([m.everyBranchItemId]);
    const q3 = await bootstrapOf(app, m.s.otherBranchTill.deviceToken);
    expect(new Set(itemsAt(q3))).toEqual(new Set([m.everyBranchItemId, m.otherBranchItemId]));
  });

  it("holds what is sold out at the branch now, not what ended or ran out elsewhere", async () => {
    const until = new Date(SERVER_STARTS_AT.getTime() + 3_600_000).toISOString();
    await m.manage("PUT", "/catalog/availability", {
      productId: m.tea.ids.product,
      branchId: m.s.shop.branchId,
      channelKey: "grab",
      available: false,
      unavailableUntil: until,
    });
    await withTenant(pool, m.s.shop.tenantId, (client) =>
      client.query(
        "INSERT INTO product_availability (id, tenant_id, product_id, branch_id, channel_key, " +
          "unavailable_until) VALUES ($1, $2, $3, $4, 'shopee', $5)",
        [
          newId(),
          m.s.shop.tenantId,
          m.tea.ids.product,
          m.s.shop.branchId,
          new Date(SERVER_STARTS_AT.getTime() - 3_600_000),
        ],
      ),
    );
    const now = await bootstrapOf(app, m.s.tillA.deviceToken);
    expect(now.menu.availability).toEqual([
      {
        productId: m.tea.ids.product,
        version: Number(now.cursor),
        entries: [{ channelKey: "grab", unavailableUntil: Date.parse(until) }],
      },
    ]);
    expect((await bootstrapOf(app, m.s.otherBranchTill.deviceToken)).menu.availability).toEqual([]);
  });

  it("leaves a product taken off the menu out", async () => {
    await m.manage("POST", `/catalog/products/${m.s.menu.peachTea.id}/archive`);
    const after = await bootstrapOf(app, m.s.tillA.deviceToken);
    const ids = after.menu.products.map((product) => product.id);
    expect(ids).toContain(m.s.menu.coffee.id);
    expect(ids).not.toContain(m.s.menu.peachTea.id);
  });
});

describe("where a till pulls from after starting", () => {
  it("hands out the feed's latest position and versions every copy by it", async () => {
    expect(
      (await pushOne(app, m.s.tillA, saveDraft(m.s.tillA, [line(m.s.menu.coffee.id)]))).status,
    ).toBe("accepted");
    const boot = await bootstrapOf(app, m.s.tillA.deviceToken);
    expect(boot.cursor).toBe((await pullAll(app, m.s.tillA)).cursor);
    expect(boot.cursor).not.toBe("0");
    const copies = [boot.config, ...Object.values(boot.menu).flat()];
    expect(new Set(copies.map((copy) => copy.version))).toEqual(new Set([Number(boot.cursor)]));
  });
});
