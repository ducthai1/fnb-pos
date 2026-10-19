import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { line, pushOne, saveDraft } from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  s = await syncShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const extraShot = (quantity = 1) => ({
  groupId: s.menu.coffee.extrasGroup,
  optionId: s.menu.coffee.extraShot,
  quantity,
});

const priced = (snapshot: { lines: readonly object[] } | undefined) =>
  snapshot?.lines.map((entry) => {
    const { nameSnapshot, unitPrice, quantity, priceSource, lineType, taxRate } = entry as Record<
      string,
      unknown
    >;
    return { lineType, nameSnapshot, unitPrice, quantity, priceSource, taxRate };
  });

describe("order.save_draft", () => {
  it("prices every line from the catalog and ignores the price the till sent", async () => {
    const result = await pushOne(
      app,
      s.tillA,
      saveDraft(s.tillA, [
        line(s.menu.coffee.id, { quantity: "2", modifiers: [extraShot()], unitPrice: 1 }),
        line(s.menu.peachTea.id, { variantId: s.menu.peachTea.sizeL, unitPrice: 1 }),
      ]),
    );
    expect(result.status).toBe("accepted");
    expect(priced(result.snapshot)).toEqual([
      {
        lineType: "item",
        nameSnapshot: "Cà phê sữa",
        unitPrice: 29_000,
        quantity: "2",
        priceSource: "base",
        taxRate: 800,
      },
      {
        lineType: "modifier",
        nameSnapshot: "Thêm shot",
        unitPrice: 10_000,
        quantity: "1",
        priceSource: "base",
        taxRate: 800,
      },
      {
        lineType: "item",
        nameSnapshot: "Trà đào (L)",
        unitPrice: 45_000,
        quantity: "1",
        priceSource: "base",
        taxRate: 800,
      },
    ]);
    expect(result.snapshot).toMatchObject({
      status: "draft",
      version: 1,
      branchId: s.shop.branchId,
    });
  });

  it("applies the channel's price list", async () => {
    const result = await pushOne(
      app,
      s.tillA,
      saveDraft(s.tillA, [line(s.menu.coffee.id)], { channelKey: "grab" }),
    );
    expect(priced(result.snapshot)?.[0]).toMatchObject({
      unitPrice: 32_000,
      priceSource: "price_list",
    });
  });

  it("replaces the lines of a draft saved again, keeping the id of an option still chosen", async () => {
    const coffee = line(s.menu.coffee.id, { modifiers: [extraShot()] });
    const first = await pushOne(app, s.tillA, saveDraft(s.tillA, [coffee]));
    const orderId = first.snapshot?.id ?? "";
    const withCream = {
      ...coffee,
      modifiers: [extraShot(), { ...extraShot(), optionId: s.menu.coffee.saltedCream }],
    };
    const second = await pushOne(
      app,
      s.tillB,
      saveDraft(
        s.tillB,
        [withCream, line(s.menu.peachTea.id, { variantId: s.menu.peachTea.sizeM })],
        { orderId },
      ),
    );
    const shotLine = (snapshot: typeof first.snapshot) =>
      snapshot?.lines.find((entry) => entry.nameSnapshot === "Thêm shot")?.id;
    expect(second.status).toBe("accepted");
    expect(second.snapshot?.version).toBe(2);
    expect(second.snapshot?.deviceId).toBe(s.tillA.deviceId);
    expect(second.snapshot?.lines.map((entry) => entry.nameSnapshot)).toEqual([
      "Cà phê sữa",
      "Thêm shot",
      "Kem muối",
      "Trà đào (M)",
    ]);
    expect(shotLine(second.snapshot)).toBe(shotLine(first.snapshot));
  });
});
