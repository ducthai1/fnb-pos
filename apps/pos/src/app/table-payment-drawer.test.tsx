import { formatVnd, vnd } from "@fnb/domain";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import {
  FLOOR,
  type TableServer,
  addCoffees,
  openTable,
  tableCafeServer,
  tap,
  tillOnTheFloor,
} from "../test-support/table-cafe-server";

const T = text.checkout.payment;
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
const paymentsSince = (server: TableServer, before: number) =>
  server.state.pushed
    .slice(before)
    .map((command) => command.type)
    .filter((type) => type === "order.pay" || type.startsWith("payment."));

/** Two coffees on table 1's order, the payment drawer open over it from its pay button. */
async function drawerOverTableOne(server: TableServer) {
  await tillOnTheFloor(server);
  await openTable(FLOOR.t1, "1");
  addCoffees(2);
  const opener = screen.getByRole("button", { name: text.tables.order.pay });
  opener.focus();
  fireEvent.click(opener);
  await screen.findByRole("dialog", { name: T.title });
  return opener;
}

describe("the payment drawer over a table's order", () => {
  it("opens over the table's order, which stays under it, unreachable", async () => {
    const server = tableCafeServer();
    await drawerOverTableOne(server);
    const under = document.querySelector("[data-covered]");
    expect(under?.getAttribute("data-covered")).toBe("true");
    expect(under?.hasAttribute("inert")).toBe(true);
    expect(under?.querySelector("[data-cart-line]")).not.toBeNull();
    // Still drawn under the drawer, but out of reach of a screen reader as of a finger.
    const heading = { name: text.tables.order.title("1") };
    expect(screen.queryByRole("heading", heading)).toBeNull();
    expect(screen.getByRole("heading", { ...heading, hidden: true })).toBeTruthy();
  });

  it("goes back to the table's order on Esc, taking no money, the focus on pay again", async () => {
    const server = tableCafeServer();
    const opener = await drawerOverTableOne(server);
    await settle();
    const before = server.state.pushed.length;
    tap(T.quickCash(formatVnd(vnd(100_000))));
    fireEvent.keyDown(window, { key: text.sale.keys.back });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.querySelector("[data-covered]")?.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(opener);
    await settle();
    expect(paymentsSince(server, before)).toEqual([]);
  });

  it("goes back to the table's order from the close button too", async () => {
    const server = tableCafeServer();
    await drawerOverTableOne(server);
    await settle();
    const before = server.state.pushed.length;
    tap(T.back);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("heading", { name: text.tables.order.title("1") })).toBeTruthy();
    await settle();
    expect(paymentsSince(server, before)).toEqual([]);
  });

  it("opens from F9 at a table as at the counter, the round kept on the order first", async () => {
    const server = tableCafeServer();
    await tillOnTheFloor(server);
    await openTable(FLOOR.t1, "1");
    addCoffees(2);
    fireEvent.keyDown(window, { key: text.sale.keys.pay });
    const dialog = await screen.findByRole("dialog", { name: T.title });
    expect(dialog).toBeTruthy();
    await settle();
    const drafts = server.state.pushed.filter((command) => command.type === "order.save_draft");
    expect(drafts.length).toBeGreaterThan(0);
    expect(paymentsSince(server, 0)).toEqual([]);
  });

  it("does nothing on F9 at a table with nothing on its order", async () => {
    const server = tableCafeServer();
    await tillOnTheFloor(server);
    await openTable(FLOOR.t1, "1");
    fireEvent.keyDown(window, { key: text.sale.keys.pay });
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
