import { quantity, vnd } from "@fnb/domain";
import { describe, expect, it } from "vitest";
import { PLACE, SALE_MENU, SOLD } from "../../test-support/paid-sale-fixture";
import { MENU, tid } from "../../test-support/till-fixtures";
import { tillOrderSnapshot } from "../order/order-snapshot-for-till";
import { priceCounterOrder } from "../order/price-counter-order";
import { readStoredTableOrder } from "./stored-table-order";
import { openingFromStored } from "./table-order-opening";

const AT = Date.UTC(2026, 9, 20, 3, 0);
const PROFILE = { pricesIncludeTax: true, serviceCharge: null };
const AT_TABLE = { ...SOLD, serviceType: "dine_in" as const, table: { id: tid(0x710), name: "5" } };
const TEA = SOLD.lines[0]!.lineId;

/** The order as the server stores it after the bar was sent the two teas. */
function storedRow() {
  const priced = priceCounterOrder(SALE_MENU, AT_TABLE, PROFILE, AT);
  const sent = [{ lineId: TEA, sentQuantity: quantity(2), sentNote: "Ít đá" }];
  const row = tillOrderSnapshot(PLACE, AT_TABLE, priced, {
    status: "draft",
    version: 4,
    businessDate: "2026-10-20",
    chargeProfile: PROFILE,
    payments: [],
    sent,
    preBillPrinted: true,
  });
  return { row, priced };
}

describe("opening the order seated at a table from the till's copy", () => {
  it("gives back each item as the cart line that saves it again, choices and all", () => {
    const stored = readStoredTableOrder(storedRow().row);
    expect(stored).not.toBeNull();
    const opening = openingFromStored(SALE_MENU, stored!);
    // It stays the order of the till that opened it, under that till's number.
    expect(opening.order).toEqual({ ...AT_TABLE, tableTag: null, openedOn: PLACE.deviceId });
    expect(opening.recorded).toMatchObject({ version: 4, preBillPrinted: true });
  });

  it("keeps the items the kitchen has as stored, and prices the order as the server did", () => {
    const { row, priced } = storedRow();
    const opening = openingFromStored(SALE_MENU, readStoredTableOrder(row)!);
    expect([...opening.kept.keys()]).toEqual([TEA]);
    // The tea and its two options: what the server keeps, whatever the menu says now.
    expect(opening.kept.get(TEA)?.map((line) => line.lineType)).toEqual([
      "item",
      "modifier",
      "modifier",
    ]);
    expect(opening.priced?.totals.amountDue).toBe(priced.totals.amountDue);
    // A kept tea stays at its price when the menu reprices it; the rest is priced anew.
    const repriced = priceCounterOrder(
      { ...SALE_MENU, productsById: new Map(SALE_MENU.productsById) },
      opening.order,
      PROFILE,
      AT,
      new Map([[TEA, opening.kept.get(TEA)!.map((line) => ({ ...line, unitPrice: vnd(1) }))]]),
    );
    expect(repriced.lines.find((line) => line.id === TEA)?.unitPrice).toBe(1n);
    expect(repriced.lines.find((line) => line.productId === MENU.coffee)?.unitPrice).toBe(29_000n);
  });

  it("refuses a row that is not a readable order instead of guessing", () => {
    const { row } = storedRow();
    expect(readStoredTableOrder({ ...row, lines: [{ id: tid(1) }] })).toBeNull();
    expect(readStoredTableOrder({ ...row, status: "merged" })).toBeNull();
    expect(readStoredTableOrder({ ...row, chargeProfile: null })).toBeNull();
  });
});
