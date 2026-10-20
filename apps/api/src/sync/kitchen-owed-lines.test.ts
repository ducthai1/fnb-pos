import type { SentTicketLine } from "@fnb/contracts";
import { type OrderLine, basisPoints, quantity, vnd } from "@fnb/domain";
import { describe, expect, it } from "vitest";
import { owedLineOf, owedTicketLines, sentStateAfter } from "./kitchen-owed-lines";
import { KITCHEN_SYNC_ERROR_CODES } from "./kitchen-sync-error-codes";
import type { StoredOrder } from "./stored-order";

const LINE_ID = "0190a000-0000-7000-8000-000000000001";

function coffee(units: number, note: string | null): OrderLine {
  return {
    id: LINE_ID,
    parentLineId: null,
    lineType: "item",
    productId: "coffee",
    variantId: null,
    modifierOptionId: null,
    nameSnapshot: "Cà phê sữa",
    unitPrice: vnd(29_000),
    quantity: quantity(units),
    taxRate: basisPoints(800),
    note,
    priceSource: "base",
    reversesLineId: null,
  };
}

/** One coffee line, with what the stations were already shown of it. */
function storedWith(line: OrderLine, sentUnits: bigint, sentNote: string | null): StoredOrder {
  return {
    order: {
      id: "0190a000-0000-7000-8000-0000000000aa",
      status: "draft",
      serviceType: "takeaway",
      channelKey: null,
      businessDate: "2026-10-20",
      lines: [line],
      refundOfOrderId: null,
      refundAmounts: null,
      version: 1,
    },
    branchId: "branch",
    deviceId: "device",
    deviceOrderNo: 1,
    officialNo: null,
    callNumber: null,
    tableId: null,
    tableName: null,
    tableTag: null,
    preBillPrinted: false,
    reasonCode: null,
    chargeProfile: { pricesIncludeTax: true, serviceCharge: null },
    payments: [],
    sentQuantityByLineId: new Map([[line.id, quantity(sentUnits)]]),
    sentNoteByLineId: new Map([[line.id, sentUnits === 0n ? null : sentNote]]),
    restockByLineId: new Map(),
    einvoice: null,
  };
}

const reportedNew = (units: number, note: string | null): SentTicketLine => ({
  lineId: LINE_ID,
  kind: "new",
  quantity: quantity(units),
  note,
});

const owedNewUnits = (stored: StoredOrder) =>
  owedTicketLines(stored).get(`${LINE_ID}:new`)?.quantity ?? quantity(0);

const refusalOf = (run: () => unknown) => {
  try {
    run();
    return "taken";
  } catch (error) {
    return (error as { code?: string }).code;
  }
};

// Every small case, not a sample: up to 4 units sold, any part already sent, any report.
const CASES = [1, 2, 3, 4].flatMap((sold) =>
  Array.from({ length: sold + 1 }, (_, sent) =>
    [1, 2, 3, 4, 5].map((reported) => ({ sold, sent, reported })),
  ).flat(),
);

describe("what a reported kitchen ticket may record", () => {
  it.each(CASES)(
    "with $sold sold and $sent sent, a report of $reported new is taken only within what is owed",
    ({ sold, sent, reported }) => {
      const stored = storedWith(coffee(sold, "ít đá"), BigInt(sent), "ít đá");
      const owed = owedTicketLines(stored);
      const outcome = refusalOf(() => owedLineOf(owed, reportedNew(reported, "ít đá")));
      if (reported > sold - sent) {
        expect(outcome).toBe(KITCHEN_SYNC_ERROR_CODES.notOwed);
        return;
      }
      expect(outcome).toBe("taken");
      const [after] = sentStateAfter(stored, [reportedNew(reported, "ít đá")]);
      expect(after?.sentQuantity).toBe(quantity(sent + reported));
      // Recorded and diffed again, the order owes exactly the units nobody printed yet.
      const next = storedWith(coffee(sold, "ít đá"), BigInt(sent + reported), "ít đá");
      expect(owedNewUnits(next)).toBe(quantity(sold - sent - reported));
    },
  );

  it("keeps the note the stations already have when a ticket did not carry its change", () => {
    const stored = storedWith(coffee(3, "không đường"), 1n, "ít đá");
    expect(sentStateAfter(stored, [reportedNew(2, "không đường")])).toEqual([
      { lineId: LINE_ID, sentQuantity: quantity(3), sentNote: "ít đá" },
    ]);
  });

  it("takes the printed note for the first units a line sends", () => {
    const stored = storedWith(coffee(2, "không đường"), 0n, null);
    expect(sentStateAfter(stored, [reportedNew(2, "ít đá")])).toEqual([
      { lineId: LINE_ID, sentQuantity: quantity(2), sentNote: "ít đá" },
    ]);
  });
});
