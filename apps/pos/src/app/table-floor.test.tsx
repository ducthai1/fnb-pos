import { formatVnd, vnd } from "@fnb/domain";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import { signedInTill } from "../test-support/signed-in-till";
import {
  FLOOR,
  anotherTillPays,
  anotherTillSeats,
  openFloor,
  tableCafeServer,
  tile,
  tileStatus,
} from "../test-support/table-cafe-server";
import { MENU, tillBootstrapWire } from "../test-support/till-fixtures";

const F = text.tables.floor;
const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const drafts = (server: ReturnType<typeof tableCafeServer>) =>
  server.state.pushed.filter((command) => command.type === "order.save_draft");
const money = (amount: number) => formatVnd(vnd(amount));
/** A milk coffee with no extra shot: 29.000. */
const addCoffee = () => {
  tap(/^Cà phê sữa/);
  tap(/^Thêm vào đơn/);
};

describe("the floor of a branch that serves at tables", () => {
  it("offers the floor beside the counter while the branch's tables switch is on", async () => {
    const server = tableCafeServer();
    await signedInTill(server);
    const modes = screen.getByRole("navigation", { name: text.tables.modes.label });
    expect(within(modes).getByRole("button", { name: text.tables.modes.counter })).toHaveProperty(
      "ariaPressed",
      "true",
    );
    await openFloor();
    expect(screen.getByRole("heading", { name: F.title })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Sân vườn" })).toBeTruthy();
  });

  it("offers no floor at all while the switch is off", async () => {
    const off = tableCafeServer(false);
    await signedInTill(off);
    expect(screen.queryByRole("button", { name: text.tables.modes.tables })).toBeNull();
    expect(screen.getByRole("region", { name: text.sale.menuLabel })).toBeTruthy();
  });

  it("takes the floor away as soon as the switch goes off in the backoffice", async () => {
    const server = tableCafeServer();
    await signedInTill(server);
    await openFloor();
    const { config } = tillBootstrapWire();
    const off = { ...config, version: 20, flags: { ...config.flags, tables: false } };
    server.state.feed.push({ entity: "device_config", entityId: config.id, snapshot: off });
    await screen.findByRole("region", { name: text.sale.menuLabel });
    expect(screen.queryByRole("button", { name: text.tables.modes.tables })).toBeNull();
  });

  it("names each table's status in words, area by area", async () => {
    const server = tableCafeServer();
    await signedInTill(server);
    await openFloor();
    await waitFor(() => expect(tile(FLOOR.t1)).not.toBeNull());
    for (const id of [FLOOR.t1, FLOOR.t2, FLOOR.t3]) {
      expect(tileStatus(id)).toBe("free");
      expect(tile(id)?.textContent).toContain(F.status.free);
    }
    // The garden's table is under its own tab.
    expect(tile(FLOOR.s1)).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Sân vườn" }));
    expect(tile(FLOOR.s1)?.textContent).toContain(F.seats(8));
  });

  it("shows guests another till seated once a pull brings them, and frees the table when paid there", async () => {
    const server = tableCafeServer();
    await signedInTill(server);
    await openFloor();
    const seated = anotherTillSeats(server, FLOOR.t2, { coffees: 2 });
    // The time since opening comes with the next read of the floor, a second at most.
    await waitFor(() => expect(tile(FLOOR.t2)?.textContent).toContain(F.seatedFor(F.minutes(25))), {
      timeout: 3_000,
    });
    expect(tileStatus(FLOOR.t2)).toBe("occupied");
    const shown = tile(FLOOR.t2)?.textContent ?? "";
    expect(shown).toContain(F.status.occupied);
    // Two milk coffees at 29.000, as the domain totals them.
    expect(shown).toContain(money(58_000));
    anotherTillPays(server, seated.orderId);
    await waitFor(() => expect(tileStatus(FLOOR.t2)).toBe("free"));
    expect(tile(FLOOR.t2)?.textContent).not.toContain(money(58_000));
  });

  it("opens a new order at a free table and seats it there with its first item", async () => {
    const server = tableCafeServer();
    await signedInTill(server);
    await openFloor();
    await waitFor(() => expect(tile(FLOOR.t1)).not.toBeNull());
    fireEvent.click(tile(FLOOR.t1)!);
    await screen.findByRole("heading", { name: text.tables.order.title("1") });
    // Nothing is saved for a table nobody ordered at.
    expect(drafts(server)).toEqual([]);
    addCoffee();
    await waitFor(() => expect(drafts(server)).toHaveLength(1));
    expect(drafts(server)[0]?.payload).toMatchObject({
      serviceType: "dine_in",
      tableId: FLOOR.t1,
      tableTag: null,
      lines: [expect.objectContaining({ productId: MENU.coffee, quantity: "1" })],
    });
    // The coffee was not sent to the bar: leaving asks first.
    tap(text.tables.order.backToFloor);
    tap(text.tables.order.leaveAnyway);
    await waitFor(() => expect(tileStatus(FLOOR.t1)).toBe("occupied"));
    expect(tile(FLOOR.t1)?.textContent).toContain(money(29_000));
  });

  it("opens the order seated at a table and adds to it, keeping what was ordered", async () => {
    const server = tableCafeServer();
    await signedInTill(server);
    await openFloor();
    const seated = anotherTillSeats(server, FLOOR.t3, { coffees: 2 });
    // The amount shows once the till holds the order, which it then can open.
    await waitFor(() => expect(tile(FLOOR.t3)?.textContent).toContain(money(58_000)));
    fireEvent.click(tile(FLOOR.t3)!);
    await screen.findByRole("heading", { name: text.tables.order.title("3") });
    const cart = within(screen.getByRole("region", { name: text.sale.cartLabel }));
    expect(cart.getByText("Cà phê sữa")).toBeTruthy();
    const number = text.sale.orderNumber(seated.deviceOrderNo);
    expect(
      cart.getByText((_, element) => element?.textContent?.endsWith(number) === true),
    ).toBeTruthy();
    tap(/^Trà sữa trân châu/);
    tap("M");
    tap("50% đường");
    tap(/^Thêm vào đơn/);
    await waitFor(() => expect(drafts(server)).toHaveLength(1));
    expect(drafts(server)[0]?.payload).toMatchObject({
      orderId: seated.orderId,
      deviceOrderNo: seated.deviceOrderNo,
      tableId: FLOOR.t3,
      lines: [
        expect.objectContaining({ lineId: seated.lineId, productId: MENU.coffee, quantity: "2" }),
        expect.objectContaining({ productId: MENU.milkTea, quantity: "1" }),
      ],
    });
  });

  it("numbers its own next order after its own, not after the other till's it added to", async () => {
    const server = tableCafeServer();
    await signedInTill(server);
    await openFloor();
    anotherTillSeats(server, FLOOR.t3, { coffees: 1 });
    await waitFor(() => expect(tile(FLOOR.t3)?.textContent).toContain(money(29_000)));
    fireEvent.click(tile(FLOOR.t3)!);
    await screen.findByRole("heading", { name: text.tables.order.title("3") });
    // Offline: the till's own copy of the other till's order is all it has for a while.
    server.state.online = false;
    addCoffee();
    tap(text.tables.order.backToFloor);
    tap(text.tables.order.leaveAnyway);
    await waitFor(() => expect(tile(FLOOR.t1)).not.toBeNull());
    fireEvent.click(tile(FLOOR.t1)!);
    await screen.findByRole("heading", { name: text.tables.order.title("1") });
    // The counter's open order has number 1; this table's is the till's next, 2.
    const number = document.querySelector(".pos-cart__number")?.textContent;
    expect(number).toContain(text.sale.orderNumber(2));
  });

  it("says so, and opens nothing, for guests whose order has not reached the till yet", async () => {
    const server = tableCafeServer();
    await signedInTill(server);
    anotherTillSeats(server, FLOOR.t2, { feed: false });
    await openFloor();
    await waitFor(() => expect(tileStatus(FLOOR.t2)).toBe("occupied"));
    fireEvent.click(tile(FLOOR.t2)!);
    expect(await screen.findByText(F.orderNotOnTill)).toBeTruthy();
    expect(screen.getByRole("heading", { name: F.title })).toBeTruthy();
  });

  it("keeps the counter's order while the cashier looks at the floor", async () => {
    const server = tableCafeServer();
    await signedInTill(server);
    addCoffee();
    await waitFor(() => expect(drafts(server)).toHaveLength(1));
    await openFloor();
    tap(text.tables.modes.counter);
    const cart = within(await screen.findByRole("region", { name: text.sale.cartLabel }));
    expect(cart.getByText("Cà phê sữa")).toBeTruthy();
    expect(cart.getByText(text.sale.orderNumber(1))).toBeTruthy();
  });
});
