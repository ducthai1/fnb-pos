import { basisPoints, quantity, vnd } from "@fnb/domain";
import { describe, expect, it } from "vitest";
import { tid } from "../../test-support/till-fixtures";
import type { StoredTableOrder } from "../table-order/stored-table-order";
import type { FloorOccupancy } from "./floor-occupancy";
import { floorTablesView } from "./floor-tables-view";
import { seatedFor } from "./seated-time";
import { vi } from "../../messages/vi";

const T1 = tid(101);
const T2 = tid(102);
const OPENED = "2026-10-20T03:00:00.000Z";
const occupancy = (orderAtT1: string | null): FloorOccupancy => ({
  areas: [{ id: tid(1), name: "Tầng 1" }],
  tables: [
    {
      id: T1,
      areaId: tid(1),
      name: "1",
      seats: 4,
      status: orderAtT1 === null ? "free" : "occupied",
      orderId: orderAtT1,
      openedAt: orderAtT1 === null ? null : OPENED,
    },
    { id: T2, areaId: tid(1), name: "2", seats: 2, status: "free", orderId: null, openedAt: null },
  ],
});

/** A draft with one 29.000 coffee, prices including VAT. */
const order = (fields: Partial<StoredTableOrder> = {}): StoredTableOrder => ({
  orderId: tid(500),
  deviceId: tid(0xd1),
  deviceOrderNo: 7,
  status: "draft",
  serviceType: "dine_in",
  tableTag: null,
  businessDate: "2026-10-20",
  version: 2,
  tableId: T1,
  tableName: "1",
  preBillPrinted: false,
  preBillPrintedVersion: null,
  openedAt: null,
  reasonCode: null,
  refundOfOrderId: null,
  refundAmounts: null,
  payments: [],
  chargeProfile: { pricesIncludeTax: true, serviceCharge: null },
  lines: [
    {
      id: tid(501),
      parentLineId: null,
      lineType: "item",
      productId: tid(9),
      variantId: null,
      modifierOptionId: null,
      nameSnapshot: "Cà phê",
      unitPrice: vnd(29_000),
      quantity: quantity(1),
      taxRate: basisPoints(800),
      note: null,
      priceSource: "base",
      reversesLineId: null,
    },
  ],
  sent: [],
  ...fields,
});
const NONE: ReadonlySet<string> = new Set();
const status = (views: ReturnType<typeof floorTablesView>) => views.map((view) => view.status);

describe("the floor as the till shows it", () => {
  it("shows the server's statuses where the till holds no order", () => {
    expect(status(floorTablesView(occupancy(tid(600)), [], NONE))).toEqual(["occupied", "free"]);
    expect(floorTablesView(occupancy(tid(600)), [], NONE)[0]?.amountDue).toBeNull();
  });

  it("seats an order the till holds at once, with the domain's amount, before the server knows", () => {
    const [t1] = floorTablesView(occupancy(null), [order()], NONE);
    expect(t1).toMatchObject({ status: "occupied", orderId: tid(500), openedAt: null });
    expect(t1?.amountDue).toBe(29_000n);
  });

  it("frees a table the server still names when the till holds that order paid or moved", () => {
    const paid = floorTablesView(occupancy(tid(500)), [order({ status: "paid" })], NONE);
    expect(status(paid)).toEqual(["free", "free"]);
    const moved = floorTablesView(occupancy(tid(500)), [order({ tableId: T2 })], NONE);
    expect(status(moved)).toEqual(["free", "occupied"]);
    // The server's opening time belongs to the order it named, kept across the move.
    expect(floorTablesView(occupancy(tid(500)), [order()], NONE)[0]?.openedAt).toBe(OPENED);
  });

  it("waits to pay on a current pre-bill, and says when the order changed after one", () => {
    expect(
      status(floorTablesView(occupancy(null), [order({ preBillPrinted: true })], NONE))[0],
    ).toBe("awaiting_payment");
    const seen = new Set([tid(500)]);
    expect(status(floorTablesView(occupancy(null), [order()], seen))[0]).toBe(
      "changed_after_pre_bill",
    );
    expect(status(floorTablesView(occupancy(null), [order()], NONE))[0]).toBe("occupied");
  });

  it("says the order changed after its pre-bill on a till that never saw the pre-bill", () => {
    const changed = order({ version: 3, preBillPrintedVersion: 2 });
    expect(status(floorTablesView(occupancy(null), [changed], NONE))[0]).toBe(
      "changed_after_pre_bill",
    );
    // The server's version wins over what this till once saw: printed again, it is current.
    const current = order({ version: 3, preBillPrintedVersion: 3, preBillPrinted: true });
    const seen = new Set([tid(500)]);
    expect(status(floorTablesView(occupancy(null), [current], seen))[0]).toBe("awaiting_payment");
    const never = order({ version: 3, preBillPrintedVersion: null });
    expect(status(floorTablesView(occupancy(null), [never], NONE))[0]).toBe("occupied");
  });

  it("times the guests from when the order the till holds was opened", () => {
    const [t1] = floorTablesView(occupancy(null), [order({ openedAt: OPENED })], NONE);
    expect(t1?.openedAt).toBe(OPENED);
  });
});

describe("how long guests have sat", () => {
  const F = vi.tables.floor;
  const at = Date.parse(OPENED);
  it("counts minutes, then hours and minutes, from when the order was opened", () => {
    expect(seatedFor(OPENED, at + 25 * 60_000 + 59_000)).toBe(F.seatedFor(F.minutes(25)));
    expect(seatedFor(OPENED, at + 65 * 60_000)).toBe(F.seatedFor(F.hours(1, 5)));
    expect(seatedFor(OPENED, at + 120 * 60_000)).toBe(F.seatedFor(F.hours(2, 0)));
  });

  it("never shows a negative time, and calls an order not answered yet just opened", () => {
    expect(seatedFor(OPENED, at - 5 * 60_000)).toBe(F.seatedFor(F.minutes(0)));
    expect(seatedFor(null, at)).toBe(F.justOpened);
    expect(seatedFor("not a time", at)).toBe(F.justOpened);
  });
});
