import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { refusalSentence, vi as text } from "../messages/vi";
import { managerApproves, tablesWithManager } from "../test-support/approval-cafe";
import { LAN } from "../test-support/signed-in-till";
import {
  FLOOR,
  addCoffees,
  anotherTillSeats,
  openTable,
  pushedOf,
  tableCafeServer,
  tap,
  tile,
  tileStatus,
  tillOnTheFloor,
} from "../test-support/table-cafe-server";

const T = text.tables;
const alerts = () => screen.queryAllByRole("alert").map((alert) => alert.textContent ?? "");

async function openTransfer(server: ReturnType<typeof tableCafeServer>) {
  await openTable(FLOOR.t1, "1");
  addCoffees(1);
  await waitFor(() => expect(pushedOf(server, "order.save_draft")).toHaveLength(1));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: T.order.transfer })).toHaveProperty(
      "disabled",
      false,
    ),
  );
  tap(T.order.transfer);
  await screen.findByRole("heading", { name: T.transfer.title("1") });
}

/** The table café with Lan allowed to move guests alone, as the cashier and waiter roles are. */
function movingCafe() {
  const server = tableCafeServer();
  server.state.grants.set(LAN.id, [{ key: "transfer_table" }]);
  return server;
}

/** The table café with Lan holding no key at all, so a move needs Minh. */
function cafeWhereMovingNeedsAManager() {
  const server = tablesWithManager();
  server.state.grants.set(LAN.id, []);
  return server;
}

describe("moving guests to another table", () => {
  it("moves them to a free table, and the floor shows them there at once", async () => {
    const server = movingCafe();
    await tillOnTheFloor(server);
    await openTransfer(server);
    tile(FLOOR.t3)?.click();
    await screen.findByText(T.floor.moved("1", "3"));
    expect(pushedOf(server, "table.transfer").map((command) => command.payload)).toEqual([
      { orderId: expect.any(String), toTableId: FLOOR.t3 },
    ]);
    await waitFor(() => expect(tileStatus(FLOOR.t3)).toBe("occupied"));
    expect(tileStatus(FLOOR.t1)).toBe("free");
  });

  it("refuses a table that has guests with a sentence saying why, and sends nothing", async () => {
    const server = movingCafe();
    await tillOnTheFloor(server);
    anotherTillSeats(server, FLOOR.t2);
    await waitFor(() => expect(tileStatus(FLOOR.t2)).toBe("occupied"));
    await openTransfer(server);
    tile(FLOOR.t2)?.click();
    expect(await screen.findByText(T.transfer.occupied("2"))).toBeTruthy();
    expect(pushedOf(server, "table.transfer")).toEqual([]);
    expect(screen.getByRole("heading", { name: T.transfer.title("1") })).toBeTruthy();
  });

  it("explains a move the server refused because guests sat down there a moment before", async () => {
    const server = movingCafe();
    await tillOnTheFloor(server);
    await openTransfer(server);
    // Another till seats the third table; this till has not heard of it yet.
    anotherTillSeats(server, FLOOR.t3, { feed: false });
    tile(FLOOR.t3)?.click();
    const sentence = refusalSentence("table.transfer", "SYNC_TABLE_OCCUPIED");
    await waitFor(() => expect(alerts()).toContain(sentence));
    expect(sentence).not.toBe(text.errors.unknown);
    await waitFor(() => expect(tileStatus(FLOOR.t1)).toBe("occupied"));
  });
});

describe("moving guests without the key to do it alone", () => {
  it("asks a manager to approve moving this order, and sends the approval with the move", async () => {
    const server = cafeWhereMovingNeedsAManager();
    await tillOnTheFloor(server);
    await openTransfer(server);
    tile(FLOOR.t3)?.click();
    await screen.findByRole("heading", { name: text.approval.title });
    expect(document.querySelector("[data-approval-for]")?.textContent).toBe(
      text.approval.actions.transferTable("1", "3"),
    );
    await managerApproves();
    await screen.findByText(T.floor.moved("1", "3"));
    const save = pushedOf(server, "order.save_draft")[0]?.payload as { orderId: string };
    // The manager approved moving this order, so the server lets the approval move no other.
    expect(server.state.calls.approvals.map((call) => call.action)).toEqual([
      { key: "transfer_table", subject: { orderId: save.orderId } },
    ]);
    await waitFor(() =>
      expect(pushedOf(server, "table.transfer").map((command) => command.payload)).toEqual([
        {
          orderId: save.orderId,
          toTableId: FLOOR.t3,
          approvalId: server.state.approvals[0]?.approvalId,
        },
      ]),
    );
    await waitFor(() => expect(tileStatus(FLOOR.t3)).toBe("occupied"));
  });

  it("moves nothing when the manager is not asked after all", async () => {
    const server = cafeWhereMovingNeedsAManager();
    await tillOnTheFloor(server);
    await openTransfer(server);
    tile(FLOOR.t3)?.click();
    await screen.findByRole("heading", { name: text.approval.title });
    tap(text.approval.cancel);
    await screen.findByRole("heading", { name: T.transfer.title("1") });
    await waitFor(() => expect(server.state.calls.pulls).toBeGreaterThan(5));
    expect(pushedOf(server, "table.transfer")).toEqual([]);
    expect(tileStatus(FLOOR.t3)).toBe("free");
  });
});

describe("a table's order the server refused", () => {
  it("says another till opened the table first, and records nothing more for the order", async () => {
    const server = tableCafeServer();
    await tillOnTheFloor(server);
    await openTable(FLOOR.t2, "2");
    anotherTillSeats(server, FLOOR.t2, { feed: false });
    addCoffees(1);
    const sentence = text.errors.SYNC_TABLE_OCCUPIED;
    await waitFor(() => expect(alerts().some((shown) => shown.startsWith(sentence))).toBe(true));
    expect(alerts().join(" ")).not.toContain(text.sync.serverError);
    addCoffees(1);
    await waitFor(() => expect(server.state.calls.pulls).toBeGreaterThan(6));
    expect(pushedOf(server, "order.save_draft")).toHaveLength(1);
    expect(screen.getByRole("button", { name: T.order.pay })).toHaveProperty("disabled", true);
    // Leaving needs no confirmation for items that can no longer be sent; the floor repeats why.
    tap(T.order.backToFloor);
    await screen.findByRole("heading", { name: T.floor.title });
    expect(alerts()).toContain(sentence);
  });

  it("says the table was taken off the floor plan, in its own words", async () => {
    const server = tableCafeServer();
    server.state.refuseTypes.set("order.save_draft", "SYNC_TABLE_ARCHIVED");
    await tillOnTheFloor(server);
    await openTable(FLOOR.t1, "1");
    addCoffees(1);
    const sentence = text.errors.SYNC_TABLE_ARCHIVED;
    await waitFor(() => expect(alerts().some((shown) => shown.startsWith(sentence))).toBe(true));
  });
});
