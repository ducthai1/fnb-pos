import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PrinterPort } from "../features/printing/printer-port";
import { vi as text } from "../messages/vi";
import { managerApproves, pushedOf, tablesWithManager, tap } from "../test-support/approval-cafe";
import { FLOOR, addCoffees, openTable, tillOnTheFloor } from "../test-support/table-cafe-server";

const T = text.adjust;
const COFFEE = "Cà phê sữa";
const ORDER_NO = 2;
const jammedPrinter: PrinterPort = {
  print: async () => ({ status: "failed", attempts: 1, errorCode: "PRINTER_JAMMED" }),
};
const slipPreview = (kind: string) =>
  [...document.querySelectorAll(`[data-slip-kind="${kind}"] pre`)].map((pre) => pre.textContent);

/** Sends the round and waits for the slips screen to show how the ticket came out. */
async function sendRound() {
  tap(/^Gửi bếp/);
  await screen.findByRole("heading", { name: text.tables.slips.kitchenTitle });
  await waitFor(() => expect(document.querySelector("[data-print-status]")).not.toBeNull());
}

describe("sending to the kitchen from a till that has no printer", () => {
  it("counts the ticket shown on screen as sent, so the items lock", async () => {
    const server = tablesWithManager();
    await tillOnTheFloor(server);
    await openTable(FLOOR.t1, "1");
    addCoffees(2);
    await sendRound();
    expect(document.querySelector("[data-print-status]")?.getAttribute("data-print-status")).toBe(
      "preview_only",
    );
    await waitFor(() => expect(pushedOf(server, "order.mark_sent_to_kitchen")).toHaveLength(1));
    tap(text.tables.slips.backToOrder);
    expect(screen.getByRole("button", { name: text.tables.order.nothingToSend })).toBeTruthy();
  });

  it("asks a manager to cancel an item the kitchen was shown, and prints the cancel ticket", async () => {
    const server = tablesWithManager();
    await tillOnTheFloor(server);
    await openTable(FLOOR.t1, "1");
    addCoffees(2);
    await sendRound();
    tap(text.tables.slips.backToOrder);
    tap(T.tools.lineMenu(COFFEE));
    tap(T.tools.void(COFFEE));
    await screen.findByRole("heading", { name: T.void.title });
    expect(screen.getByText(T.void.sent(2))).toBeTruthy();
    tap(text.reasons.made_wrong);
    tap(T.void.confirm(1));
    expect(await screen.findByText(text.approval.actions.voidAfterSent(1, COFFEE))).toBeTruthy();
    await managerApproves();
    await screen.findByRole("heading", { name: T.void.cancelTicketTitle });
    expect(slipPreview("kitchen")[0]).toContain("HỦY");
    expect(pushedOf(server, "order.void_line")[0]?.payload).toMatchObject({
      quantity: "1",
      approvalId: server.state.approvals[0]?.approvalId,
    });
  });

  it("refuses to cancel an order while the kitchen still has its items", async () => {
    const server = tablesWithManager();
    await tillOnTheFloor(server);
    await openTable(FLOOR.t1, "1");
    addCoffees(1);
    await sendRound();
    tap(text.tables.slips.backToOrder);
    tap(T.tools.cancelOrder);
    await screen.findByRole("heading", { name: T.cancel.title(ORDER_NO) });
    tap(text.reasons.customer_left);
    tap(T.cancel.confirm);
    expect(await screen.findByText(text.errors.SYNC_ORDER_HAS_SENT_ITEMS)).toBeTruthy();
    expect(pushedOf(server, "order.cancel")).toEqual([]);
  });

  it("asks a manager to close an order once all the items the kitchen had were cancelled", async () => {
    const server = tablesWithManager();
    await tillOnTheFloor(server);
    await openTable(FLOOR.t1, "1");
    addCoffees(1);
    await sendRound();
    tap(text.tables.slips.backToOrder);
    tap(T.tools.lineMenu(COFFEE));
    tap(T.tools.void(COFFEE));
    await screen.findByRole("heading", { name: T.void.title });
    tap(text.reasons.made_wrong);
    tap(T.void.confirm(1));
    await managerApproves();
    await screen.findByRole("heading", { name: T.void.cancelTicketTitle });
    await waitFor(() => expect(pushedOf(server, "order.mark_sent_to_kitchen")).toHaveLength(2));
    await waitFor(() => expect(server.state.calls.pulls).toBeGreaterThan(8));
    tap(text.tables.slips.backToOrder);
    tap(T.tools.cancelOrder);
    await screen.findByRole("heading", { name: T.cancel.title(ORDER_NO) });
    tap(text.reasons.customer_left);
    tap(T.cancel.confirm);
    await screen.findByRole("heading", { name: text.approval.title });
    expect(document.querySelector("[data-approval-for]")?.textContent).toBe(
      text.approval.actions.closeUnpaid(ORDER_NO),
    );
    expect(pushedOf(server, "order.cancel")).toEqual([]);
  });
});

describe("sending to the kitchen through a jammed printer", () => {
  it("leaves the items unsent and owed again on the next send", async () => {
    const server = tablesWithManager();
    await tillOnTheFloor(server, jammedPrinter);
    await openTable(FLOOR.t1, "1");
    addCoffees(1);
    await sendRound();
    expect(document.querySelector("[data-print-status]")?.getAttribute("data-print-status")).toBe(
      "failed",
    );
    tap(text.tables.slips.backToOrder);
    expect(screen.getByRole("button", { name: text.tables.order.sendToKitchen(1) })).toBeTruthy();
    await waitFor(() => expect(server.state.calls.pulls).toBeGreaterThan(4));
    expect(pushedOf(server, "order.mark_sent_to_kitchen")).toEqual([]);
  });
});

describe("a table whose order has nothing left on it", () => {
  it("is given back with one tap and no reason to pick, freeing the table", async () => {
    const server = tablesWithManager();
    await tillOnTheFloor(server);
    await openTable(FLOOR.t1, "1");
    addCoffees(1);
    await waitFor(() => expect(pushedOf(server, "order.save_draft").length).toBeGreaterThan(0));
    expect(screen.queryByRole("button", { name: text.tables.order.release })).toBeNull();
    tap(T.tools.lineMenu(COFFEE));
    tap(text.sale.remove(COFFEE));
    await waitFor(() => expect(pushedOf(server, "order.save_draft").length).toBeGreaterThan(1));
    tap(text.tables.order.release);
    await screen.findByRole("heading", { name: T.release.title("1") });
    tap(T.release.confirm);
    await waitFor(() => expect(pushedOf(server, "order.cancel")).toHaveLength(1));
    expect(pushedOf(server, "order.cancel")[0]?.payload).toMatchObject({
      reasonCode: "table_emptied",
    });
    expect(await screen.findByText(T.release.done("1"))).toBeTruthy();
  });
});
