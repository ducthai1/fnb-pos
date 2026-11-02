import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import {
  FLOOR,
  type TableServer,
  addCoffees,
  OTHER_TILLS_LINE,
  addMilkTea,
  anotherTillAddsCoffee,
  anotherTillPays,
  anotherTillSeats,
  openTable,
  pushedOf,
  tap,
  tableCafeServer,
  tileStatus,
  tillOnTheFloor,
} from "../test-support/table-cafe-server";
import { MENU } from "../test-support/till-fixtures";
import { MOST_REDOS_IN_A_ROW } from "../features/table-order/redo-stale-order";

const STALE = "SYNC_ORDER_VERSION_STALE";
type Line = { id: string; productId: string | null; parentLineId: string | null };
const itemsOnServer = (server: TableServer, orderId: string) =>
  ((server.rows.get(orderId)?.lines ?? []) as Line[]).filter((line) => line.parentLineId === null);

/** This till opens table 1, where the other till seated two coffees, its pushes held. */
/** The other till saves the table again just as the n-th save of this till reaches the server. */
function otherTillSavesAgainAtSave(
  server: TableServer,
  seated: { orderId: string; lineId: string },
  nth: readonly number[],
  then: () => void = () => {},
) {
  let saves = 0;
  server.state.beforeAnswer = (command) => {
    if (command.type !== "order.save_draft") return;
    saves += 1;
    if (!nth.includes(saves)) return;
    anotherTillAddsCoffee(server, seated);
    then();
  };
}

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

  it("saves again when its redo is refused too because the order moved on once more", async () => {
    const { server, seated } = await bothTillsAtTableOne();
    addMilkTea();
    anotherTillAddsCoffee(server, seated);
    otherTillSavesAgainAtSave(server, seated, [2]);
    server.state.pushesHeld = false;

    await waitFor(() =>
      expect(itemsOnServer(server, seated.orderId).map((line) => line.productId)).toContain(
        MENU.milkTea,
      ),
    );
    expect(itemsOnServer(server, seated.orderId)).toHaveLength(3);
    const drafts = pushedOf(server, "order.save_draft").map((c) => c.payload.expectedVersion);
    // Refused over version 2, the redo refused over version 3, saved over version 3.
    expect(drafts).toEqual([1, 2, 3]);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("lists the items that missed the bill when the table is paid at another till under the redo", async () => {
    const { server, seated } = await bothTillsAtTableOne();
    addMilkTea();
    anotherTillAddsCoffee(server, seated);
    otherTillSavesAgainAtSave(server, seated, [2], () => anotherTillPays(server, seated.orderId));
    server.state.pushesHeld = false;

    await screen.findByRole("alert");
    tap(text.tables.order.backToFloor);
    fireEvent.click(await screen.findByRole("link", { name: text.sync.needsAttention(1) }));
    await screen.findByRole("heading", { name: text.needsAttention.title });
    const entry = await waitFor(() => {
      const found = document.querySelector(`[data-rejected-code="${STALE}"]`);
      expect(found?.textContent).toContain(text.needsAttention.notes.notDraft);
      return found;
    });
    expect(entry?.textContent).toContain(
      text.needsAttention.notes.missedItems("1 × Trà sữa trân châu"),
    );
    expect(pushedOf(server, "order.save_draft")).toHaveLength(2);
    expect(itemsOnServer(server, seated.orderId).map((line) => line.productId)).not.toContain(
      MENU.milkTea,
    );
  });

  it("stops saving and says so when the order moved on again under the redo", async () => {
    const { server, seated } = await bothTillsAtTableOne();
    server.state.refuseTypes.set("order.save_draft", STALE);
    addMilkTea();
    anotherTillAddsCoffee(server, seated);
    server.state.pushesHeld = false;

    const alert = await screen.findByRole("alert");
    // The cashier's save, then a few redos over each newer copy: not again and again.
    const saves = 1 + MOST_REDOS_IN_A_ROW;
    await waitFor(() => expect(pushedOf(server, "order.save_draft")).toHaveLength(saves));
    await waitFor(() => expect(alert.textContent).toContain(text.errors[STALE]));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(pushedOf(server, "order.save_draft")).toHaveLength(saves);
  });
});
