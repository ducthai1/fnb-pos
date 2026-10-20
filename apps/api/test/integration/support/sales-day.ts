import { newId } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { expect } from "vitest";
import type { SyncCommandEnvelope } from "../../../src/sync/sync-wire-types";
import { expectStatus } from "./catalog-shop";
import { saveSetting } from "./einvoice-profiles";
import { createIntent, freshCode, intentIdOf, payByQr, recordTransfer } from "./payment-commands";
import { signInAs } from "./sync-approvals";
import { command, line, orderIdOf, pay, pushOne, saveDraft } from "./sync-commands";
import { cancel, discount, markSent, refund, voidUnits } from "./sync-order-commands";
import type { SyncShop } from "./sync-shop";

/** 10:00, 11:15, 12:30 and 12:45 in Vietnam on the test day. */
export const PAID_AT = {
  o1: "2026-10-20T03:00:00.000Z",
  o2: "2026-10-20T04:15:00.000Z",
  o3: "2026-10-20T05:30:00.000Z",
  o4: "2026-10-20T05:45:00.000Z",
};

/** When the day's commands reach the server: 13:00, after the day's last payment. */
export const SALES_DAY_SYNCED_AT = new Date("2026-10-20T06:00:00.000Z");

/** 03:30 on the 20th, before the branch's day starts at 04:00: the night of the 19th. */
const NIGHT_BEFORE = "2026-10-19T20:30:00.000Z";

const at = (sent: SyncCommandEnvelope, createdAt: string) => ({ ...sent, createdAt });

/**
 * One full day at Q1, every command through the sync API, by a manager on till B (who may
 * discount and refund alone). Prices include VAT; dine-in carries 5% service charge on the
 * bill after discount, taxed at 8%.
 *
 * O1 takeaway, cash: 2 cà phê sữa (29.000).                      58.000
 * O2 takeaway, QR: cà phê sữa + thêm shot (10.000).               39.000
 * O3 dine-in, cash: trà đào L (45.000, 8%) + 2 bia (25.000, 10%),
 *    10.000 off the order, then 5% service charge on 85.000.      89.250
 * O4 takeaway, cash: 3 trà đào M (35.000) sent to the bar, one voided after: 70.000
 * O5 refund of one coffee of O1, cash back.                      −29.000
 * Not in the day: a cancelled draft, a draft left open, a sale of another branch, a sale
 * booked to the day before.
 */
export async function salesDay(app: FastifyInstance, pool: pg.Pool, s: SyncShop) {
  const till = s.tillB;
  await signInAs(app, s, till, "manager");
  const beerId = newId();
  await expectStatus(
    app.inject({
      method: "PUT",
      url: `/catalog/products/${beerId}`,
      headers: { cookie: s.shop.managerCookie },
      payload: {
        version: null,
        brandId: s.brandId,
        pricingMode: "fixed",
        taxRateBp: 1000,
        kind: "retail_item",
        name: "Bia Sài Gòn",
        basePrice: 25_000,
      },
    }),
    201,
  );
  const setting = (key: string, value: unknown) =>
    saveSetting(
      pool,
      s.shop.tenantId,
      { scopeKind: "branch", scopeId: s.shop.branchId },
      key,
      value,
    );
  await setting("charge_profile", {
    pricesIncludeTax: true,
    serviceCharge: { rate: 500, appliesTo: ["dine_in"], base: "after_discount", taxRate: 800 },
  });
  // The manager cancels a tea the bar already has without a second person.
  await setting("void_after_sent_needs_approval", false);
  const accepted = async (sent: SyncCommandEnvelope) =>
    expect((await pushOne(app, till, sent)).status).toBe("accepted");

  const coffees = line(s.menu.coffee.id, { quantity: "2" });
  const o1 = saveDraft(till, [coffees]);
  await accepted(o1);
  await accepted(at(pay(till, orderIdOf(o1), 58_000), PAID_AT.o1));

  const shot = {
    groupId: s.menu.coffee.extrasGroup,
    optionId: s.menu.coffee.extraShot,
    quantity: 1,
  };
  const o2 = saveDraft(till, [line(s.menu.coffee.id, { modifiers: [shot] })]);
  await accepted(o2);
  const code = freshCode();
  // Arrived just before the QR reached the server, by the server's clock, which is what the
  // QR's look-back for money that came first is measured on.
  await recordTransfer(pool, s.shop.tenantId, {
    branchId: s.shop.branchId,
    amount: 39_000,
    content: `CK ${code}`,
    receivedAt: new Date(SALES_DAY_SYNCED_AT.getTime() - 60_000),
  });
  const qr = createIntent(till, orderIdOf(o2), 39_000, { contentCode: code });
  await accepted(qr);
  await accepted(at(payByQr(till, orderIdOf(o2), intentIdOf(qr), 39_000), PAID_AT.o2));

  const o3Id = newId();
  await accepted(
    command(till, "order.save_draft", {
      orderId: o3Id,
      deviceOrderNo: till.nextOrderNo++,
      serviceType: "dine_in",
      channelKey: null,
      lines: [
        line(s.menu.peachTea.id, { variantId: s.menu.peachTea.sizeL }),
        line(beerId, { quantity: "2" }),
      ],
    }),
  );
  await accepted(
    discount(till, o3Id, { scope: "order", discount: { kind: "fixed", amount: 10_000 } }, 2),
  );
  await accepted(at(pay(till, o3Id, 89_250), PAID_AT.o3));

  const teas = line(s.menu.peachTea.id, { variantId: s.menu.peachTea.sizeM, quantity: "3" });
  const o4 = saveDraft(till, [teas]);
  await accepted(o4);
  await markSent(pool, s.shop.tenantId, teas.lineId, "3");
  await accepted(voidUnits(till, orderIdOf(o4), teas.lineId, "1"));
  await accepted(at(pay(till, orderIdOf(o4), 70_000), PAID_AT.o4));

  await accepted(
    refund(
      till,
      orderIdOf(o1),
      [{ lineId: coffees.lineId, quantity: "1", restock: false }],
      -29_000,
    ),
  );

  const dropped = saveDraft(till, [line(s.menu.coffee.id)]);
  await accepted(dropped);
  await accepted(cancel(till, orderIdOf(dropped)));
  await accepted(saveDraft(till, [line(s.menu.coffee.id)]));
  const elsewhere = saveDraft(s.otherBranchTill, [line(s.menu.coffee.id)]);
  expect((await pushOne(app, s.otherBranchTill, elsewhere)).status).toBe("accepted");
  await pushOne(app, s.otherBranchTill, pay(s.otherBranchTill, orderIdOf(elsewhere), 29_000));
  const yesterday = at(saveDraft(till, [line(s.menu.coffee.id)]), NIGHT_BEFORE);
  await accepted(yesterday);
  await accepted(at(pay(till, orderIdOf(yesterday), 29_000), NIGHT_BEFORE));

  return { beerId, o3Id, teaLineId: teas.lineId };
}
