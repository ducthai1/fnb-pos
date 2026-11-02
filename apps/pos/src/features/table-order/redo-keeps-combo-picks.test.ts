import type { RejectedCommand } from "@fnb/sync-client";
import { describe, expect, it } from "vitest";
import { COMBO, comboTillMenu } from "../../test-support/combo-menu";
import { PLACE } from "../../test-support/paid-sale-fixture";
import { MENU, tid } from "../../test-support/till-fixtures";
import type { CartLine, CounterOrder } from "../order/counter-order";
import { tillOrderSnapshot } from "../order/order-snapshot-for-till";
import { priceCounterOrder } from "../order/price-counter-order";
import { draftPayload } from "../order/save-draft-command";
import { readStoredOrder } from "../order/stored-order";
import {
  ORDER_VERSION_STALE,
  itemsMissedBy,
  redoDraftCommand,
  redoneCart,
} from "./redo-stale-draft";

const AT = Date.UTC(2026, 9, 20, 3, 0);
const PROFILE = { pricesIncludeTax: true, serviceCharge: null };
const menu = comboTillMenu();

const order = (lines: readonly CartLine[]): CounterOrder => ({
  orderId: tid(0x900),
  deviceOrderNo: 7,
  serviceType: "dine_in",
  tableTag: null,
  table: { id: tid(0x710), name: "5" },
  lines,
});
const coffee: CartLine = {
  lineId: tid(0x901),
  productId: MENU.coffee,
  variantId: null,
  modifiers: [],
  quantity: 1,
  note: null,
};
const teaL = {
  slotId: COMBO.drinkSlot,
  productId: MENU.milkTea,
  variantId: MENU.sizeL,
  modifiers: [{ groupId: MENU.sugar, optionId: MENU.sugarHalf, quantity: 1 }],
};
const croissant = {
  slotId: COMBO.bakerySlot,
  productId: MENU.cake,
  variantId: null,
  modifiers: [],
};
const breakfast: CartLine = {
  lineId: tid(0x902),
  productId: COMBO.id,
  variantId: null,
  modifiers: [],
  comboPicks: [teaL, croissant],
  quantity: 2,
  note: "Ít đá",
};

/** The order as the server holds it: another till's coffee only. */
const serverCopy = () => {
  const placed = order([coffee]);
  const stored = readStoredOrder(
    tillOrderSnapshot(PLACE, placed, priceCounterOrder(menu, placed, PROFILE, AT), {
      status: "draft",
      version: 5,
      businessDate: "2026-10-20",
      chargeProfile: PROFILE,
      payments: [],
      sent: [],
    }),
  );
  if (stored === null) throw new Error("the server copy does not read back");
  return stored;
};

/** This till's save of the breakfast combo, refused because the other till got in first. */
const refusedCombo = () =>
  ({
    entity: "order",
    entityId: tid(0x900),
    code: ORDER_VERSION_STALE,
    serverSnapshot: null,
    command: {
      commandId: tid(0xc01),
      type: "order.save_draft",
      payload: draftPayload(
        order([breakfast]),
        priceCounterOrder(menu, order([breakfast]), PROFILE, AT),
      ),
    },
  }) as unknown as RejectedCommand;

describe("a combo whose save was refused as stale", () => {
  it("is saved again with the drink and the cakes the cashier picked", () => {
    const cart = redoneCart(menu, serverCopy(), [refusedCombo()]);
    const redone = cart?.find((line) => line.lineId === breakfast.lineId);
    expect(redone?.comboPicks).toEqual([teaL, croissant]);
    expect(redone?.quantity).toBe(2);

    const command = redoDraftCommand(PLACE, menu, serverCopy(), cart ?? [], AT);
    const sent = (command.payload as { lines: { lineId: string; comboPicks?: unknown }[] }).lines;
    expect(sent.find((line) => line.lineId === breakfast.lineId)?.comboPicks).toEqual([
      teaL,
      croissant,
    ]);
  });

  it("is named as missing from a bill paid elsewhere", () => {
    const missed = itemsMissedBy(menu, serverCopy(), refusedCombo());
    expect(missed.map((line) => line.lineId)).toEqual([breakfast.lineId]);
  });
});
