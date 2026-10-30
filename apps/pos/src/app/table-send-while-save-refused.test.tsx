import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { simulatedPrinterThatPrints } from "../features/printing/printer-port";
import { vi as text } from "../messages/vi";
import {
  FLOOR,
  addMilkTea,
  anotherTillAddsCoffee,
  anotherTillSeats,
  openTable,
  pushedOf,
  tableCafeServer,
  tap,
  tileStatus,
  tillOnTheFloor,
} from "../test-support/table-cafe-server";
import { MENU } from "../test-support/till-fixtures";

const T = text.tables.order;
type Line = { productId: string | null; sentQuantity: string };
const cartText = () => screen.getByRole("region", { name: text.sale.cartLabel }).textContent ?? "";
const milkTeaOnServer = (server: ReturnType<typeof tableCafeServer>, orderId: string) =>
  ((server.rows.get(orderId)?.lines ?? []) as Line[]).filter(
    (line) => line.productId === MENU.milkTea,
  );

async function sendRound() {
  tap(/^Gửi bếp/);
  await screen.findByRole("heading", { name: text.tables.slips.kitchenTitle });
  await waitFor(() => expect(document.querySelector("[data-print-status]")).not.toBeNull());
}

/**
 * The till adds an item and sends it to the bar while its save has not reached the server;
 * another till changes the order first, so the server refuses the save and, finding the item
 * unknown, the ticket too.
 */
async function sentBeforeTheSaveWasAnswered() {
  const server = tableCafeServer();
  const seated = anotherTillSeats(server, FLOOR.t1, { coffees: 2 });
  await tillOnTheFloor(server, simulatedPrinterThatPrints);
  await waitFor(() => expect(tileStatus(FLOOR.t1)).not.toBe("free"));
  await openTable(FLOOR.t1, "1");
  server.state.pushesHeld = true;
  addMilkTea();
  await sendRound();
  anotherTillAddsCoffee(server, seated);
  server.state.pushesHeld = false;
  return { server, seated };
}

describe("an item sent to the bar before the server answered its save", () => {
  it("is recorded as sent once the save is redone, so the bar is not told twice", async () => {
    const { server, seated } = await sentBeforeTheSaveWasAnswered();

    await waitFor(() => expect(milkTeaOnServer(server, seated.orderId)).toHaveLength(1));
    // The ticket the bar already holds reaches the server over the redone save.
    await waitFor(() => expect(milkTeaOnServer(server, seated.orderId)[0]?.sentQuantity).toBe("1"));
    const ticket = pushedOf(server, "order.mark_sent_to_kitchen");
    expect(ticket.length).toBeGreaterThanOrEqual(1);
    screen.queryByRole("button", { name: text.tables.slips.backToOrder })?.click();
    // Only the other till's coffee is owed to the stations: the tea is not sent a second time.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: T.sendToKitchen(1) })).toBeTruthy(),
    );
    expect(cartText()).toMatch(/Trà sữa trân châu[^]*Đã gửi bếp/);
    expect(pushedOf(server, "order.mark_sent_to_kitchen")).toHaveLength(2);
    // The redo answers both refusals: nothing is left on the needs-attention list.
    expect(document.body.textContent).not.toMatch(/Cần xử lý \(/);
    // And the cashier is not told a command was refused for good.
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
