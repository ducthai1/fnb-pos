import { markSentToKitchenPayloadSchema, printJobReportedPayloadSchema } from "@fnb/contracts";
import type { LocalCommand } from "@fnb/sync-client";
import { describe, expect, it } from "vitest";
import { PLACE, SALE_MENU, SOLD, paidSale } from "../../test-support/paid-sale-fixture";
import { MENU } from "../../test-support/till-fixtures";
import { slipHead } from "./sale-order";
import { printSaleSlips } from "./print-sale-slips";
import { type PrinterPort, previewOnlyPrinter, simulatedPrinterThatPrints } from "./printer-port";

async function print(printer: PrinterPort) {
  const recorded: LocalCommand[] = [];
  const slips = await printSaleSlips({
    menu: SALE_MENU,
    place: PLACE,
    sale: paidSale(),
    printer,
    record: async (command) => {
      recorded.push(command);
    },
    now: () => Date.UTC(2026, 9, 20, 3, 1),
  });
  return { slips, recorded };
}

describe("the call number on a slip", () => {
  it("carries the till's index on a branch with two tills, and not on a branch with one", () => {
    const sale = paidSale();
    const two = { ...SALE_MENU, callNumbering: { deviceIndex: 2, tillsInBranch: 2 } };
    expect(slipHead(two, sale, 0).callNumber).toBe(String(200 + (sale.order.deviceOrderNo % 100)));
    const one = { ...SALE_MENU, callNumbering: { deviceIndex: 1, tillsInBranch: 1 } };
    expect(slipHead(one, sale, 0).callNumber).toBe(String(((sale.order.deviceOrderNo - 1) % 100) + 1));
  });
});

describe("printing a paid counter sale", () => {
  it("shows the bar ticket, the cup labels and the bill, and records nothing for a preview", async () => {
    const { slips, recorded } = await print(previewOnlyPrinter);
    expect(slips.map((slip) => [slip.job.kind, slip.outcome.status])).toEqual([
      ["kitchen", "preview_only"],
      ["cup_label", "preview_only"],
      ["bill", "preview_only"],
    ]);
    // A slip only shown is never taken for one printed: the bar still owes the drinks.
    expect(recorded).toEqual([]);
    const [ticket, labels, bill] = slips.map((slip) => slip.job.preview);
    expect(ticket).toContain("2 x Trà sữa trân châu (L)");
    expect(ticket).toContain("+ Trân châu đen");
    expect(ticket).not.toContain("Bánh croissant");
    // One sticker per cup: two teas and a coffee; the cake prints none.
    expect(labels).toContain("3/3");
    expect(labels).not.toContain("/4");
    expect(bill).toContain("Tiền mặt");
    expect(bill).toContain("Tiền thừa");
    expect(slips.every((slip) => slip.job.chunks.length > 0)).toBe(true);
  });

  it("records the ticket as sent only after the printer took it, then reports every job", async () => {
    const { recorded } = await print(simulatedPrinterThatPrints);
    expect(recorded.map((command) => command.type)).toEqual([
      "order.mark_sent_to_kitchen",
      "print.job_reported",
      "print.job_reported",
      "print.job_reported",
    ]);
    const sent = recorded[0]!;
    expect(markSentToKitchenPayloadSchema.safeParse(sent.payload).success).toBe(true);
    expect(sent.payload).toMatchObject({
      orderId: SOLD.orderId,
      stations: [
        {
          stationId: MENU.bar,
          lines: [
            { lineId: SOLD.lines[0]?.lineId, kind: "new", quantity: "2", note: "Ít đá" },
            { lineId: SOLD.lines[1]?.lineId, kind: "new", quantity: "1", note: null },
          ],
        },
      ],
    });
    const lines = (sent.target.optimistic.lines as { id: string; sentQuantity: string }[]).filter(
      (line) => line.sentQuantity !== "0",
    );
    expect(lines.map((line) => line.id)).toEqual([SOLD.lines[0]?.lineId, SOLD.lines[1]?.lineId]);
    for (const report of recorded.slice(1)) {
      expect(printJobReportedPayloadSchema.safeParse(report.payload).success).toBe(true);
      expect(report.payload).toMatchObject({ status: "printed", orderId: SOLD.orderId });
    }
  });

  it("reports a failed print and leaves the ticket owed", async () => {
    const jammed: PrinterPort = {
      print: async () => ({ status: "failed", attempts: 3, errorCode: "PAPER_OUT" }),
    };
    const { recorded } = await print(jammed);
    expect(recorded.map((command) => command.type)).toEqual(Array(3).fill("print.job_reported"));
    expect(recorded[0]?.payload).toMatchObject({
      kind: "kitchen",
      status: "failed",
      errorCode: "PAPER_OUT",
      attempts: 3,
    });
  });

  it("reports a printer port that threw as a failed job, not as a crash of the sale", async () => {
    const broken: PrinterPort = { print: async () => Promise.reject(new Error("bridge gone")) };
    const { slips } = await print(broken);
    expect(slips.map((slip) => slip.outcome.status)).toEqual(["failed", "failed", "failed"]);
  });
});
