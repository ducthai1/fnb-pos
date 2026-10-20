import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { simulatedPrinterThatPrints } from "../features/printing/printer-port";
import { vi as text } from "../messages/vi";
import {
  amountDue,
  managerApproves,
  pushedOf,
  tablesWithManager,
  tap,
} from "../test-support/approval-cafe";
import { FLOOR, addCoffees, openTable, tillOnTheFloor } from "../test-support/table-cafe-server";

const T = text.adjust;
const COFFEE = "Cà phê sữa";
const slipPreview = (kind: string) =>
  [...document.querySelectorAll(`[data-slip-kind="${kind}"] pre`)].map((pre) => pre.textContent);
type Ticket = { stations: { lines: { lineId: string; kind: string; quantity: string }[] }[] };
const ticketLines = (server: ReturnType<typeof tablesWithManager>) =>
  pushedOf(server, "order.mark_sent_to_kitchen").map((command) =>
    (command.payload as Ticket).stations.flatMap((station) => station.lines),
  );

/** Two coffees at table 1, sent to the bar, back on the order. */
async function coffeesAtTheBar(server: ReturnType<typeof tablesWithManager>) {
  await tillOnTheFloor(server, simulatedPrinterThatPrints);
  await openTable(FLOOR.t1, "1");
  addCoffees(2);
  tap(/^Gửi bếp/);
  await waitFor(() => expect(ticketLines(server)).toHaveLength(1));
  tap(text.tables.slips.backToOrder);
  await waitFor(() => expect(amountDue()).toBe("58000"));
}

async function voidOne(reason: string) {
  tap(T.tools.void(COFFEE));
  await screen.findByRole("heading", { name: T.void.title });
  expect(screen.getByText(T.void.sent(2))).toBeTruthy();
  tap(reason);
  tap(T.void.confirm(1));
}

/** The cancel line the server made for the coffee, under its own id. */
function serverCancelLine(server: ReturnType<typeof tablesWithManager>) {
  const orderId = String(pushedOf(server, "order.void_line")[0]?.payload.orderId);
  const lines = (server.rows.get(orderId)?.lines ?? []) as {
    id: string;
    reversesLineId: unknown;
  }[];
  return lines.find((line) => line.reversesLineId !== null);
}

describe("cancelling an item the kitchen already has", () => {
  it("asks a manager, prints the bar's cancel ticket and records it under the server's line", async () => {
    const server = tablesWithManager();
    await coffeesAtTheBar(server);
    await voidOne(text.reasons.made_wrong);
    expect(await screen.findByText(text.approval.actions.voidAfterSent(1, COFFEE))).toBeTruthy();
    await managerApproves();
    await screen.findByRole("heading", { name: T.void.cancelTicketTitle });
    await waitFor(() => expect(ticketLines(server)).toHaveLength(2));
    expect(slipPreview("kitchen")[0]).toContain("HỦY");
    expect(pushedOf(server, "order.void_line")[0]?.payload).toMatchObject({
      quantity: "1",
      reasonCode: "made_wrong",
      approvalId: server.state.approvals[0]?.approvalId,
    });
    expect(server.state.calls.approvals[0]?.action).toEqual({ key: "void_after_sent" });
    const cancel = serverCancelLine(server);
    expect(ticketLines(server)[1]).toEqual([
      { lineId: cancel?.id, kind: "cancel", quantity: "1", note: null },
    ]);
    tap(text.tables.slips.backToOrder);
    expect(amountDue()).toBe("29000");
    // The ticket is recorded: nothing is owed to the bar any more.
    expect(screen.getByRole("button", { name: text.tables.order.nothingToSend })).toBeTruthy();
  });

  it("asks nobody where the branch lets anyone cancel what the kitchen has", async () => {
    const server = tablesWithManager({ void_after_sent_needs_approval: false });
    await coffeesAtTheBar(server);
    await voidOne(text.reasons.customer_changed_mind);
    await screen.findByRole("heading", { name: T.void.cancelTicketTitle });
    await waitFor(() => expect(ticketLines(server)).toHaveLength(2));
    expect(server.state.calls.approvals).toEqual([]);
    expect(pushedOf(server, "order.void_line")[0]?.payload).not.toHaveProperty("approvalId");
  });

  it("offline, prints the ticket from the till's copy and records it once the server knows", async () => {
    const server = tablesWithManager({ void_after_sent_needs_approval: false });
    await coffeesAtTheBar(server);
    server.state.online = false;
    await voidOne(text.reasons.customer_changed_mind);
    expect(
      await screen.findByText(T.void.cancelTicketOffline, {}, { timeout: 8_000 }),
    ).toBeTruthy();
    expect(slipPreview("kitchen")[0]).toContain("HỦY");
    tap(text.tables.slips.backToOrder);
    // Shown at once while the void waits; nothing recorded under the till's own id.
    expect(amountDue()).toBe("29000");
    expect(ticketLines(server)).toHaveLength(1);
    server.state.online = true;
    await waitFor(() => expect(pushedOf(server, "order.void_line")).toHaveLength(1), {
      timeout: 5_000,
    });
    await waitFor(() => expect(serverCancelLine(server)).toBeDefined());
    tap(/^Gửi bếp/);
    await waitFor(() => expect(ticketLines(server)).toHaveLength(2));
    expect(ticketLines(server)[1]).toEqual([
      { lineId: serverCancelLine(server)?.id, kind: "cancel", quantity: "1", note: null },
    ]);
  }, 20_000);
});
