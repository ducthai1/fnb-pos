import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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
import { HOSTILE_MENU_NAMES } from "../test-support/hostile-menu";
import { FLOOR, openTable, tillOnTheFloor } from "../test-support/table-cafe-server";
import { BEANS, weighedCafeWithTables } from "../test-support/typed-and-weighed-menu";

const T = text.adjust;
const TEA = "Trà sữa trân châu";
type Ticket = { stations: { lines: { lineId: string; kind: string; quantity: string }[] }[] };
const ticketLines = (server: ReturnType<typeof tablesWithManager>) =>
  pushedOf(server, "order.mark_sent_to_kitchen").map((command) =>
    (command.payload as Ticket).stations.flatMap((station) => station.lines),
  );
const pressed = (name: string) =>
  screen.getByRole("button", { name }).getAttribute("aria-pressed") === "true";
const noteBox = () => screen.getByRole("textbox", { name: text.sale.note }) as HTMLTextAreaElement;

/** An L milk tea, 50% sugar, with a long note over several lines: sent to the bar, back on the order. */
async function teaAtTheBar(server: ReturnType<typeof tablesWithManager>) {
  await tillOnTheFloor(server, simulatedPrinterThatPrints);
  await openTable(FLOOR.t1, "1");
  tap(/^Trà sữa trân châu/);
  tap("L");
  tap("50% đường");
  fireEvent.change(noteBox(), { target: { value: HOSTILE_MENU_NAMES.note } });
  tap(/^Thêm vào đơn/);
  await waitFor(() => expect(amountDue()).toBe("45000"));
  tap(/^Gửi bếp/);
  await waitFor(() => expect(ticketLines(server)).toHaveLength(1));
  tap(text.tables.slips.backToOrder);
}

async function openChange() {
  tap(/^Thao tác món Trà sữa/);
  tap(/^Đổi tùy chọn món Trà sữa/);
  await screen.findByRole("heading", { name: T.change.pickerTitle(TEA) });
}

describe("changing the options of an item the kitchen already has", () => {
  it("opens on the old choices, cancels the old item with approval and calls the new one", async () => {
    const server = tablesWithManager();
    await teaAtTheBar(server);
    await openChange();
    // The picker starts from what was ordered, note and all.
    expect(pressed("L")).toBe(true);
    expect(pressed("50% đường")).toBe(true);
    expect(noteBox().value).toBe(HOSTILE_MENU_NAMES.note);
    tap("M");
    tap("100% đường");
    tap(/^Hủy món cũ, gọi lại/);
    expect(await screen.findByText(/Hủy 1 .*Trà sữa/)).toBeTruthy();
    await managerApproves();
    await screen.findByRole("heading", { name: T.change.slipsTitle });
    await waitFor(() => expect(ticketLines(server)).toHaveLength(3));
    // Two tickets after the first call: the cancel of the old cup, then the new cup.
    const [, cancelTicket, callTicket] = ticketLines(server);
    expect(cancelTicket).toEqual([expect.objectContaining({ kind: "cancel", quantity: "1" })]);
    expect(callTicket).toEqual([expect.objectContaining({ kind: "new", quantity: "1" })]);
    expect(pushedOf(server, "order.void_line")[0]?.payload).toMatchObject({
      quantity: "1",
      reasonCode: "customer_changed_mind",
      approvalId: server.state.approvals[0]?.approvalId,
    });
    expect(server.state.calls.approvals[0]?.action).toMatchObject({
      key: "void_after_sent",
      voidedQuantity: "1",
    });
    tap(text.tables.slips.backToOrder);
    // Only the new M cup is owed money for, and nothing is left to send.
    expect(amountDue()).toBe("35000");
    expect(screen.getByRole("button", { name: text.tables.order.nothingToSend })).toBeTruthy();
  }, 20_000);

  it("changes nothing when the manager is not asked for the approval after all", async () => {
    const server = tablesWithManager();
    await teaAtTheBar(server);
    await openChange();
    tap("M");
    tap(/^Hủy món cũ, gọi lại/);
    await screen.findByRole("heading", { name: text.approval.title });
    tap(text.approval.cancel);
    // Back on the order exactly as it was: the old cup, no cancel, no second ticket.
    await waitFor(() => expect(amountDue()).toBe("45000"));
    expect(screen.queryByRole("heading", { name: T.change.slipsTitle })).toBeNull();
    expect(pushedOf(server, "order.void_line")).toHaveLength(0);
    expect(ticketLines(server)).toHaveLength(1);
  });

  it("backing out of the picker changes nothing", async () => {
    const server = tablesWithManager();
    await teaAtTheBar(server);
    await openChange();
    tap(text.sale.picker.cancel);
    await waitFor(() => expect(amountDue()).toBe("45000"));
    expect(pushedOf(server, "order.void_line")).toHaveLength(0);
  });

  it("does not offer the change for an item the kitchen has not seen", async () => {
    const server = tablesWithManager();
    await tillOnTheFloor(server, simulatedPrinterThatPrints);
    await openTable(FLOOR.t1, "1");
    tap(/^Trà sữa trân châu/);
    tap("50% đường");
    tap(/^Thêm vào đơn/);
    await waitFor(() => expect(amountDue()).toBe("35000"));
    tap(/^Thao tác món Trà sữa/);
    expect(screen.getByRole("button", { name: /^Hủy món Trà sữa/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Đổi tùy chọn món/ })).toBeNull();
  });
});

describe("items that keep the two separate steps", () => {
  it("offers no change for a weighing that the kitchen has", async () => {
    const server = weighedCafeWithTables();
    await tillOnTheFloor(server);
    await openTable(FLOOR.t1, "1");
    tap(new RegExp(`^${BEANS.name}`));
    const keypad = await screen.findByRole("dialog");
    for (const digit of "351") {
      fireEvent.click(within(keypad).getByRole("button", { name: digit }));
    }
    fireEvent.click(document.querySelector<HTMLButtonElement>("[form='pos-line-entry']")!);
    await waitFor(() => expect(amountDue()).toBe("112320"));
    tap(/^Gửi bếp/);
    await screen.findByRole("heading", { name: text.tables.slips.kitchenTitle });
    tap(text.tables.slips.backToOrder);
    tap(T.tools.lineMenu(BEANS.name));
    expect(screen.getByRole("button", { name: T.tools.void(BEANS.name) })).toBeTruthy();
    expect(screen.queryByRole("button", { name: T.tools.changeOptions(BEANS.name) })).toBeNull();
  });
});
