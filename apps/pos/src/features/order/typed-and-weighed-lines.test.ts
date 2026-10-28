import { saveDraftPayloadSchema } from "@fnb/contracts";
import { quantity, vnd } from "@fnb/domain";
import { describe, expect, it } from "vitest";
import { PLACE } from "../../test-support/paid-sale-fixture";
import { tid } from "../../test-support/till-fixtures";
import {
  BEANS,
  BIRTHDAY_CAKE,
  typedAndWeighedBootstrap,
} from "../../test-support/typed-and-weighed-menu";
import { NO_MENU_COPIES, buildTillMenu } from "../menu/till-menu";
import { billLinesOf } from "../printing/bill-slip";
import { kitchenSlips } from "../printing/kitchen-slips";
import { ORDER_VERSION_STALE, redoneCart } from "../table-order/redo-stale-draft";
import { readStoredTableOrder } from "../table-order/stored-table-order";
import { cartView } from "./cart-view";
import type { CounterOrder } from "./counter-order";
import { openingFromStored } from "./order-opening";
import { tillOrderSnapshot } from "./order-snapshot-for-till";
import { priceCounterOrder } from "./price-counter-order";
import { draftPayload } from "./save-draft-command";

const AT = Date.UTC(2026, 9, 20, 3, 0);
const PROFILE = { pricesIncludeTax: true, serviceCharge: null };
const MENU = buildTillMenu(typedAndWeighedBootstrap(), NO_MENU_COPIES, new Set());

const beansLine = { lineId: tid(0x901), productId: BEANS.id, grams: 351 };
const cakeLine = {
  lineId: tid(0x902),
  productId: BIRTHDAY_CAKE.id,
  enteredPrice: vnd(180_000),
  priceApprovalId: tid(0xa901),
};

/** A table's order of 351 g of beans and two cakes at a typed 180.000 đ. */
const ORDER: CounterOrder = {
  orderId: tid(0x900),
  deviceOrderNo: 7,
  serviceType: "dine_in",
  tableTag: null,
  table: { id: tid(0x710), name: "5" },
  lines: [
    { ...beansLine, variantId: null, modifiers: [], quantity: 1, note: null },
    { ...cakeLine, variantId: null, modifiers: [], quantity: 2, note: "Chữ: Mừng sinh nhật" },
  ],
};

const priced = () => priceCounterOrder(MENU, ORDER, PROFILE, AT);

describe("lines whose price is typed or whose weight is weighed, on the till", () => {
  it("prices the weight in the product's unit and the cake at the price typed", () => {
    const { lines, totals } = priced();
    expect(lines.map(({ quantity: units, unitPrice, priceSource }) => [units, unitPrice, priceSource]))
      .toEqual([
        [quantity("3.51"), 32_000n, "base"],
        [quantity(2), 180_000n, "manual"],
      ]);
    // 351 g at 32.000 đ per 100 g, and 2 × 180.000 đ.
    expect(totals.amountDue).toBe(112_320n + 360_000n);
  });

  it("sends the weight in the product's unit, and the typed price with its approval", () => {
    const payload = draftPayload(ORDER, priced());
    expect(saveDraftPayloadSchema.safeParse(payload).success).toBe(true);
    expect(payload.lines.map(({ quantity: units, enteredPrice, priceApprovalId }) => ({
      units,
      enteredPrice,
      priceApprovalId,
    }))).toEqual([
      { units: "3.51", enteredPrice: undefined, priceApprovalId: undefined },
      { units: "2", enteredPrice: 180_000, priceApprovalId: cakeLine.priceApprovalId },
    ]);
    expect(payload.lines[0]).not.toHaveProperty("enteredPrice");
  });

  it("cannot price a weighed line that was never weighed", () => {
    const { lineId, productId } = beansLine;
    const line = { lineId, productId, variantId: null, modifiers: [], quantity: 1, note: null };
    const view = cartView(MENU, { ...ORDER, lines: [line] }, PROFILE, AT);
    expect(view.kind).toBe("unpriceable");
  });

  it("reads the price and the grams back from the server's copy and saves them the same", () => {
    const row = tillOrderSnapshot(PLACE, ORDER, priced(), {
      status: "draft",
      version: 3,
      businessDate: "2026-10-20",
      chargeProfile: PROFILE,
      payments: [],
      sent: [],
    });
    const opening = openingFromStored(MENU, readStoredTableOrder(row)!);
    expect(opening.order.lines.map(({ grams, enteredPrice, quantity: units }) => ({
      grams,
      enteredPrice,
      units,
    }))).toEqual([
      { grams: 351, enteredPrice: undefined, units: 1 },
      { grams: undefined, enteredPrice: vnd(180_000), units: 2 },
    ]);
    const again = draftPayload(opening.order, priceCounterOrder(MENU, opening.order, PROFILE, AT));
    expect(again.lines.map((line) => line.quantity)).toEqual(["3.51", "2"]);
  });

  it("redoes a draft another till got in before, with its weight, price and approval", () => {
    const empty = { ...ORDER, lines: [] };
    const latest = tillOrderSnapshot(PLACE, empty, priceCounterOrder(MENU, empty, PROFILE, AT), {
      status: "draft",
      version: 5,
      businessDate: "2026-10-20",
      chargeProfile: PROFILE,
      payments: [],
      sent: [],
    });
    const refused = {
      code: ORDER_VERSION_STALE,
      command: { type: "order.save_draft", payload: draftPayload(ORDER, priced()) },
      serverSnapshot: null,
    } as unknown as Parameters<typeof redoneCart>[2][number];
    const cart = redoneCart(MENU, readStoredTableOrder(latest)!, [refused]);
    expect(cart?.map(({ grams, enteredPrice, priceApprovalId, quantity: units }) => ({
      grams,
      enteredPrice,
      priceApprovalId,
      units,
    }))).toEqual([
      { grams: 351, enteredPrice: undefined, priceApprovalId: undefined, units: 1 },
      {
        grams: undefined,
        enteredPrice: vnd(180_000),
        priceApprovalId: cakeLine.priceApprovalId,
        units: 2,
      },
    ]);
  });

  it("prints the grams on the bar ticket and the bill, the units of everything else", () => {
    const sale = { order: ORDER, priced: priced(), businessDate: "2026-10-20", version: 3 };
    const [ticket] = kitchenSlips(MENU, sale, AT);
    const preview = (ticket?.job.preview ?? "").replace(/\u00a0/g, " ");
    expect(preview).toContain("351 g x Cà phê hạt Robusta");
    expect(preview).toContain("2 x Bánh kem theo yêu cầu");
    expect(billLinesOf(MENU, sale.priced).map((line) => line.weighed)).toEqual([
      { grams: 351, per: "100g" },
      null,
    ]);
  });
});
