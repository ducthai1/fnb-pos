import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { expectStatus } from "../support/catalog-shop";
import type { ManualClock } from "../support/manual-clock";
import {
  type LineIntent,
  line,
  orderIdOf,
  pushOne,
  pushOnTime,
  saveDraft,
  tillsClock,
} from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let clock: ManualClock;
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  clock = tillsClock();
  app = buildApp({ pool, clock });
  s = await syncShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

type Pick = NonNullable<LineIntent["comboPicks"]>[number];

const coffeeIn = (slotId: string, modifiers: Pick["modifiers"] = []): Pick => ({
  slotId,
  productId: s.menu.coffee.id,
  variantId: null,
  modifiers,
});
const peachTeaL = (): Pick => ({
  slotId: s.menu.combo.drinkSlot,
  productId: s.menu.peachTea.id,
  variantId: s.menu.peachTea.sizeL,
  modifiers: [],
});
const extraShot = { groupId: "", optionId: "", quantity: 1 };
const withShot = () => [
  { ...extraShot, groupId: s.menu.coffee.extrasGroup, optionId: s.menu.coffee.extraShot },
];

const combo = (comboPicks: Pick[], overrides: Partial<LineIntent> = {}) =>
  line(s.menu.combo.id, { comboPicks, ...overrides });

/** The snapshot's lines as a tree of what each costs, parents named by their own names. */
function tree(snapshot: { lines: readonly object[] } | undefined) {
  const lines = (snapshot?.lines ?? []) as {
    id: string;
    parentLineId: string | null;
    lineType: string;
    nameSnapshot: string;
    unitPrice: number;
    taxRate: number;
  }[];
  const nameOf = new Map(lines.map((entry) => [entry.id, entry.nameSnapshot]));
  return lines.map((entry) => ({
    lineType: entry.lineType,
    name: entry.nameSnapshot,
    under: entry.parentLineId === null ? null : nameOf.get(entry.parentLineId),
    unitPrice: entry.unitPrice,
    taxRate: entry.taxRate,
  }));
}

describe("order.save_draft sells a combo", () => {
  it("prices it from the catalog: the combo, each slot's upcharge and each pick's options", async () => {
    const picks = [{ ...peachTeaL(), upcharge: 0 }, coffeeIn(s.menu.combo.extraSlot, withShot())];
    const result = await pushOne(
      app,
      s.tillA,
      saveDraft(s.tillA, [combo(picks, { unitPrice: 1 })]),
    );
    expect(result.status).toBe("accepted");
    expect(tree(result.snapshot)).toEqual([
      { lineType: "item", name: "Combo sáng", under: null, unitPrice: 50_000, taxRate: 800 },
      {
        lineType: "combo_component",
        name: "Trà đào (L)",
        under: "Combo sáng",
        unitPrice: 10_000,
        taxRate: 800,
      },
      {
        lineType: "combo_component",
        name: "Cà phê sữa",
        under: "Combo sáng",
        unitPrice: 15_000,
        taxRate: 800,
      },
      {
        lineType: "modifier",
        name: "Thêm shot",
        under: "Cà phê sữa",
        unitPrice: 10_000,
        taxRate: 800,
      },
    ]);
  });

  it("keeps the ids of its picks and their options when the draft is saved again", async () => {
    const lines = [
      combo([coffeeIn(s.menu.combo.drinkSlot), coffeeIn(s.menu.combo.extraSlot, withShot())]),
    ];
    const first = saveDraft(s.tillA, lines);
    const before = await pushOne(app, s.tillA, first);
    const again = await pushOne(
      app,
      s.tillA,
      saveDraft(s.tillA, lines, { orderId: orderIdOf(first) }),
    );
    expect(again.status).toBe("accepted");
    const ids = (result: typeof before) =>
      (result.snapshot?.lines as { id: string }[] | undefined)?.map((entry) => entry.id);
    expect(ids(again)).toEqual(ids(before));
    expect(ids(again)).toHaveLength(4);
  });

  it.each([
    [
      "a pick the slot does not offer",
      () => [combo([{ ...peachTeaL(), slotId: s.menu.combo.extraSlot }])],
      "DOMAIN_CATALOG_COMBO_OPTION_NOT_IN_SLOT",
    ],
    [
      "more picks than the slot takes",
      () => [combo([peachTeaL(), peachTeaL()])],
      "DOMAIN_CATALOG_TOO_MANY_COMBO_SELECTIONS",
    ],
    [
      "a pick missing a size its product is sold by",
      () => [combo([{ ...peachTeaL(), variantId: null }])],
      "DOMAIN_CATALOG_COMBO_OPTION_NOT_IN_SLOT",
    ],
    [
      "an option the picked product does not have",
      () => [
        combo([
          coffeeIn(s.menu.combo.drinkSlot, [
            { ...extraShot, groupId: s.menu.coffee.extrasGroup, optionId: s.menu.peachTea.sizeM },
          ]),
        ]),
      ],
      "DOMAIN_CATALOG_UNKNOWN_MODIFIER_OPTION",
    ],
    [
      "a price typed for a combo, which sells at its catalog price",
      () => [combo([peachTeaL()], { enteredPrice: 1_000 })],
      "DOMAIN_PRICING_ENTERED_PRICE_NOT_ALLOWED",
    ],
    [
      "picks on a product that is no combo",
      () => [line(s.menu.coffee.id, { comboPicks: [peachTeaL()] })],
      "DOMAIN_CATALOG_NOT_A_COMBO",
    ],
  ])("refuses %s", async (_case, lines, code) => {
    const sent = saveDraft(s.tillA, lines());
    expect(await pushOne(app, s.tillA, sent)).toMatchObject({ status: "rejected", code });
  });

  it("refuses a combo whose pick is sold out, and sells it with another pick", async () => {
    await expectStatus(
      app.inject({
        method: "PUT",
        url: "/catalog/availability",
        headers: { cookie: s.shop.managerCookie },
        payload: { productId: s.menu.peachTea.id, branchId: s.shop.branchId, available: false },
      }),
      200,
    );
    const later = new Date(clock.now().getTime() + 60 * 60_000).toISOString();
    const soldOut = { ...saveDraft(s.tillA, [combo([peachTeaL()])]), createdAt: later };
    expect(await pushOnTime(app, s.tillA, clock, soldOut)).toMatchObject({
      status: "rejected",
      code: "SYNC_PRODUCT_SOLD_OUT",
    });
    const coffee = {
      ...saveDraft(s.tillA, [combo([coffeeIn(s.menu.combo.drinkSlot)])]),
      createdAt: later,
    };
    expect((await pushOnTime(app, s.tillA, clock, coffee)).status).toBe("accepted");
    // Swapping the sold-out drink into a combo already on the order is refused too.
    const swapped = {
      ...saveDraft(
        s.tillA,
        [{ ...(coffee.payload as { lines: LineIntent[] }).lines[0]!, comboPicks: [peachTeaL()] }],
        {
          orderId: orderIdOf(coffee),
        },
      ),
      createdAt: later,
    };
    expect(await pushOnTime(app, s.tillA, clock, swapped)).toMatchObject({
      status: "rejected",
      code: "SYNC_PRODUCT_SOLD_OUT",
    });
  });
});
