import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import {
  FLOOR,
  type TableServer,
  addCoffees,
  OTHER_TILLS_LINE,
  addMilkTea,
  anotherTillAddsCoffee,
  anotherTillSeats,
  openTable,
  pushedOf,
  tableCafeServer,
  tileStatus,
  tillOnTheFloor,
} from "../test-support/table-cafe-server";
import { MENU } from "../test-support/till-fixtures";

const STALE = "SYNC_ORDER_VERSION_STALE";
type Line = { id: string; productId: string | null; parentLineId: string | null };
const itemsOnServer = (server: TableServer, orderId: string) =>
  ((server.rows.get(orderId)?.lines ?? []) as Line[]).filter((line) => line.parentLineId === null);

/** This till opens table 1, where the other till seated two coffees, its pushes held. */
async function bothTillsAtTableOne() {
  const server = tableCafeServer();
  const seated = anotherTillSeats(server, FLOOR.t1, { coffees: 2 });
  await tillOnTheFloor(server);
  await waitFor(() => expect(tileStatus(FLOOR.t1)).not.toBe("free"));
  await openTable(FLOOR.t1, "1");
  server.state.pushesHeld = true;
  return { server, seated };
}

describe("two tills adding to one table at once", () => {
  it("keeps the items of both when this till's save reaches the server second", async () => {
    const { server, seated } = await bothTillsAtTableOne();
    addMilkTea();
    anotherTillAddsCoffee(server, seated);
    server.state.pushesHeld = false;

    await waitFor(() => expect(itemsOnServer(server, seated.orderId)).toHaveLength(3));
    const items = itemsOnServer(server, seated.orderId);
    expect(items.map((line) => line.id)).toContain(OTHER_TILLS_LINE);
    expect(items.map((line) => line.productId)).toContain(MENU.milkTea);
    const drafts = pushedOf(server, "order.save_draft").map((c) => c.payload.expectedVersion);
    // Edited from version 1, refused over the other till's version 2, then saved over it.
    expect(drafts).toEqual([1, 2]);
    // The screen shows the order as saved: no refusal, all three items.
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("puts back what the other till added when a later save of this till took it off", async () => {
    const { server, seated } = await bothTillsAtTableOne();
    addMilkTea();
    addCoffees(1);
    anotherTillAddsCoffee(server, seated);
    server.state.pushesHeld = false;

    // The first save is refused; the second, edited from version 2, lands on the other
    // till's version 2 and drops its coffee; the redo saves it again with ours.
    await waitFor(() => expect(itemsOnServer(server, seated.orderId)).toHaveLength(4));
    expect(itemsOnServer(server, seated.orderId).map((line) => line.id)).toContain(
      OTHER_TILLS_LINE,
    );
  });

  it("stops saving and says so when the order moved on again under the redo", async () => {
    const { server, seated } = await bothTillsAtTableOne();
    server.state.refuseTypes.set("order.save_draft", STALE);
    addMilkTea();
    anotherTillAddsCoffee(server, seated);
    server.state.pushesHeld = false;

    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(pushedOf(server, "order.save_draft")).toHaveLength(2));
    expect(alert.textContent).toContain(text.errors[STALE]);
    // Redone once, not again and again.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(pushedOf(server, "order.save_draft")).toHaveLength(2);
  });
});
