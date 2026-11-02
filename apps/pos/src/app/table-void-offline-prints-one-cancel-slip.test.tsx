import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PrintJob, PrinterPort } from "../features/printing/printer-port";
import { vi as text } from "../messages/vi";
import { pushedOf, tablesWithManager, tap } from "../test-support/approval-cafe";
import { FLOOR, addCoffees, openTable, tillOnTheFloor } from "../test-support/table-cafe-server";

const T = text.adjust;
const COFFEE = "Cà phê sữa";

/** A printer that takes every job and keeps it, to count the cancel slips the bar got. */
function countingPrinter() {
  const jobs: PrintJob[] = [];
  const printer: PrinterPort = {
    print: async (job) => {
      jobs.push(job);
      return { status: "printed", attempts: 1 };
    },
  };
  const cancelSlips = () => jobs.filter((job) => job.preview.includes("HỦY")).length;
  return { printer, cancelSlips };
}

type Ticket = { stations: { lines: { lineId: string; kind: string; quantity: string }[] }[] };
const recordedTickets = (server: ReturnType<typeof tablesWithManager>) =>
  pushedOf(server, "order.mark_sent_to_kitchen").map((command) =>
    (command.payload as Ticket).stations.flatMap((station) => station.lines),
  );

async function coffeesAtTheBar(server: ReturnType<typeof tablesWithManager>, printer: PrinterPort, cups = 2) {
  await tillOnTheFloor(server, printer);
  await openTable(FLOOR.t1, "1");
  addCoffees(cups);
  tap(/^Gửi bếp/);
  await waitFor(() => expect(recordedTickets(server)).toHaveLength(1));
  tap(text.tables.slips.backToOrder);
}

async function voidOneOffline(sentCups: number) {
  tap(T.tools.lineMenu(COFFEE));
  tap(T.tools.void(COFFEE));
  await screen.findByRole("heading", { name: T.void.title });
  expect(screen.getByText(T.void.sent(sentCups))).toBeTruthy();
  tap(text.reasons.customer_changed_mind);
  tap(T.void.confirm(1));
}

/** Back online until the server has every void and its cancel lines reached the till. */
async function reconnect(server: ReturnType<typeof tablesWithManager>, voids: number) {
  server.state.online = true;
  await waitFor(() => expect(pushedOf(server, "order.void_line")).toHaveLength(voids), {
    timeout: 6_000,
  });
}

/** What the bar is still owed once the till knows the server's copy: nothing, or "Gửi bếp". */
async function nothingOwedToTheBar() {
  await waitFor(
    () => expect(screen.getByRole("button", { name: text.tables.order.nothingToSend })).toBeTruthy(),
    { timeout: 6_000 },
  );
}

describe("a cancel slip printed while offline", () => {
  it("is printed once: reconnecting does not owe the bar the same cancel under the server's id", async () => {
    const server = tablesWithManager({ void_after_sent_needs_approval: false });
    const { printer, cancelSlips } = countingPrinter();
    await coffeesAtTheBar(server, printer);
    server.state.online = false;
    await voidOneOffline(2);
    await screen.findByText(T.void.cancelTicketOffline, {}, { timeout: 8_000 });
    expect(cancelSlips()).toBe(1);
    tap(text.tables.slips.backToOrder);
    await reconnect(server, 1);
    await nothingOwedToTheBar();
    expect(cancelSlips()).toBe(1);
    // The ticket the bar has is recorded under the line the server made, once.
    const cancels = recordedTickets(server).flat().filter((line) => line.kind === "cancel");
    expect(cancels).toHaveLength(1);
  }, 25_000);

  it("prints one slip per void when two are made offline, and none again after reconnecting", async () => {
    const server = tablesWithManager({ void_after_sent_needs_approval: false });
    const { printer, cancelSlips } = countingPrinter();
    await coffeesAtTheBar(server, printer, 3);
    server.state.online = false;
    await voidOneOffline(3);
    await screen.findByText(T.void.cancelTicketOffline, {}, { timeout: 8_000 });
    tap(text.tables.slips.backToOrder);
    await voidOneOffline(2);
    await screen.findByText(T.void.cancelTicketOffline, {}, { timeout: 8_000 });
    tap(text.tables.slips.backToOrder);
    expect(cancelSlips()).toBe(2);
    await reconnect(server, 2);
    await nothingOwedToTheBar();
    expect(cancelSlips()).toBe(2);
    expect(recordedTickets(server).flat().filter((line) => line.kind === "cancel")).toHaveLength(2);
  }, 30_000);

  it("void offline, reconnect, void again online: two slips, each recorded once", async () => {
    const server = tablesWithManager({ void_after_sent_needs_approval: false });
    const { printer, cancelSlips } = countingPrinter();
    await coffeesAtTheBar(server, printer, 3);
    server.state.online = false;
    await voidOneOffline(3);
    await screen.findByText(T.void.cancelTicketOffline, {}, { timeout: 8_000 });
    tap(text.tables.slips.backToOrder);
    await reconnect(server, 1);
    await nothingOwedToTheBar();
    await voidOneOffline(2);
    await screen.findByRole("heading", { name: T.void.cancelTicketTitle });
    await waitFor(() =>
      expect(recordedTickets(server).flat().filter((line) => line.kind === "cancel")).toHaveLength(2),
    );
    tap(text.tables.slips.backToOrder);
    await nothingOwedToTheBar();
    expect(cancelSlips()).toBe(2);
  }, 30_000);
});
