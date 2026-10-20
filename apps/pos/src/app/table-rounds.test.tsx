import { formatVnd, vnd } from "@fnb/domain";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { simulatedPrinterThatPrints } from "../features/printing/printer-port";
import { vi as text } from "../messages/vi";
import {
  FLOOR,
  addCoffees,
  addMilkTea,
  openTable,
  pushedOf,
  tableCafeServer,
  tap,
  tileStatus,
  tillOnTheFloor,
} from "../test-support/table-cafe-server";

const T = text.tables.order;
const money = (amount: number) => formatVnd(vnd(amount));
const cart = () => within(screen.getByRole("region", { name: text.sale.cartLabel }));
const slipPreview = (kind: string) =>
  [...document.querySelectorAll(`[data-slip-kind="${kind}"] pre`)].map((pre) => pre.textContent);
const ticketLines = (server: ReturnType<typeof tableCafeServer>) =>
  pushedOf(server, "order.mark_sent_to_kitchen").map((command) =>
    (command.payload as { stations: { lines: { quantity: string }[] }[] }).stations.flatMap(
      (station) => station.lines.map((line) => line.quantity),
    ),
  );

async function sendRound() {
  tap(/^Gửi bếp/);
  await screen.findByRole("heading", { name: text.tables.slips.kitchenTitle });
  await waitFor(() => expect(document.querySelector("[data-print-status]")).not.toBeNull());
}

describe("an order at a table, round after round", () => {
  it("sends each round's new items only, and marks what the kitchen has apart from the rest", async () => {
    const server = tableCafeServer();
    await tillOnTheFloor(server, simulatedPrinterThatPrints);
    await openTable(FLOOR.t1, "1");
    addCoffees(2);
    expect(cart().getByText(T.unsent)).toBeTruthy();
    await sendRound();
    expect(slipPreview("kitchen")).toEqual([expect.stringContaining("2 x Cà phê sữa")]);
    await waitFor(() => expect(ticketLines(server)).toEqual([["2"]]));
    tap(text.tables.slips.backToOrder);
    // The coffees went out: shown as sent, with nothing left to change them by.
    expect(cart().getByText(T.sent)).toBeTruthy();
    expect(screen.queryByRole("button", { name: text.sale.remove("Cà phê sữa") })).toBeNull();
    addMilkTea();
    expect(screen.getByRole("button", { name: T.sendToKitchen(1) })).toBeTruthy();
    await sendRound();
    const second = slipPreview("kitchen")[0] ?? "";
    expect(second).toContain("1 x Trà sữa trân châu (L)");
    expect(second).not.toContain("Cà phê sữa");
    await waitFor(() => expect(ticketLines(server)).toEqual([["2"], ["1"]]));
    // The second save carried the first round back unchanged.
    const lastDraft = pushedOf(server, "order.save_draft").at(-1)?.payload as { lines: unknown[] };
    expect(lastDraft.lines).toEqual([
      expect.objectContaining({ quantity: "2" }),
      expect.objectContaining({ quantity: "1" }),
    ]);
  });

  it("only shows a ticket on a till without a printer, so the round stays owed", async () => {
    const server = tableCafeServer();
    await tillOnTheFloor(server);
    await openTable(FLOOR.t1, "1");
    addCoffees(1);
    await sendRound();
    expect(document.querySelector("[data-print-status]")?.getAttribute("data-print-status")).toBe(
      "preview_only",
    );
    tap(text.tables.slips.backToOrder);
    expect(screen.getByRole("button", { name: T.sendToKitchen(1) })).toBeTruthy();
    await waitFor(() => expect(server.state.calls.pulls).toBeGreaterThan(4));
    expect(pushedOf(server, "order.mark_sent_to_kitchen")).toEqual([]);
  });

  it("asks before leaving with items the kitchen was not sent, and not once all went out", async () => {
    const server = tableCafeServer();
    await tillOnTheFloor(server, simulatedPrinterThatPrints);
    await openTable(FLOOR.t1, "1");
    addCoffees(1);
    tap(T.backToFloor);
    const asked = screen.getByRole("alertdialog", { name: T.leaveTitle });
    expect(asked.textContent).toContain(T.leaveHint(1));
    tap(T.stay);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await sendRound();
    tap(text.tables.slips.backToOrder);
    tap(T.backToFloor);
    await screen.findByRole("heading", { name: text.tables.floor.title });
  });

  it("prints the pre-bill and waits to pay, then says so when the order changes after it", async () => {
    const server = tableCafeServer();
    await tillOnTheFloor(server, simulatedPrinterThatPrints);
    await openTable(FLOOR.t1, "1");
    addCoffees(2);
    await sendRound();
    tap(text.tables.slips.backToOrder);
    tap(T.preBill);
    await screen.findByRole("heading", { name: text.tables.slips.preBillTitle });
    await waitFor(() => expect(slipPreview("pre_bill")).toHaveLength(1));
    const preBill = slipPreview("pre_bill")[0] ?? "";
    expect(preBill).toContain(text.tables.slips.preBillHeading);
    expect(preBill).toContain(money(58_000));
    await waitFor(() => expect(pushedOf(server, "order.mark_pre_bill_printed")).toHaveLength(1));
    tap(text.tables.slips.backToOrder);
    expect(screen.getByText(T.preBillCurrent)).toBeTruthy();
    tap(T.backToFloor);
    await waitFor(() => expect(tileStatus(FLOOR.t1)).toBe("awaiting_payment"));
    await openTable(FLOOR.t1, "1");
    addMilkTea();
    expect(screen.getByText(T.changedAfterPreBill)).toBeTruthy();
    tap(T.backToFloor);
    tap(T.leaveAnyway);
    await waitFor(() => expect(tileStatus(FLOOR.t1)).toBe("changed_after_pre_bill"));
  });

  it("records no pre-bill the printer jammed on", async () => {
    const server = tableCafeServer();
    const jammed = {
      print: async () => ({ status: "failed" as const, attempts: 3, errorCode: "PAPER_OUT" }),
    };
    await tillOnTheFloor(server, jammed);
    await openTable(FLOOR.t1, "1");
    addCoffees(1);
    tap(T.preBill);
    await screen.findByText(text.checkout.done.printFailed("PAPER_OUT"));
    await waitFor(() => expect(pushedOf(server, "print.job_reported")).toHaveLength(1));
    expect(pushedOf(server, "order.mark_pre_bill_printed")).toEqual([]);
    tap(text.tables.slips.backToOrder);
    expect(screen.queryByText(T.preBillCurrent)).toBeNull();
  });

  it("takes the money at the table without sending the bar its round again, then frees the table", async () => {
    const server = tableCafeServer();
    await tillOnTheFloor(server, simulatedPrinterThatPrints);
    await openTable(FLOOR.t1, "1");
    addCoffees(2);
    await sendRound();
    tap(text.tables.slips.backToOrder);
    tap(T.pay);
    await screen.findByRole("heading", { name: text.checkout.payment.title });
    tap(text.checkout.payment.quickCash(money(100_000)));
    tap(text.checkout.payment.finish);
    await screen.findByRole("heading", { name: text.checkout.done.title });
    await waitFor(() => expect(slipPreview("bill")).toHaveLength(1));
    // Only the bill: the bar made the coffees rounds ago, and the cups were labelled then.
    expect(slipPreview("kitchen")).toEqual([]);
    expect(slipPreview("cup_label")).toEqual([]);
    expect(pushedOf(server, "order.pay").at(-1)?.payload).toMatchObject({
      payments: [{ method: "cash", amount: 58_000 }],
      expectedAmountDue: 58_000,
    });
    tap(T.backToFloor);
    await waitFor(() => expect(tileStatus(FLOOR.t1)).toBe("free"));
    expect(ticketLines(server)).toEqual([["2"]]);
  });
});
