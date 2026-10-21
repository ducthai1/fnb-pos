import { formatVnd, vnd } from "@fnb/domain";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import { cafeServer, signedInTill } from "../test-support/signed-in-till";

const T = text.checkout.payment;
const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const pushedTypes = (server: ReturnType<typeof cafeServer>) =>
  server.state.pushed.map((command) => command.type);
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 50)));

/** Two coffees (58.000đ) on the order, the payment drawer open over it from its button. */
async function drawerOverTwoCoffees() {
  tap(/^Cà phê sữa/);
  tap(text.sale.more("Cà phê sữa"));
  tap(/^Thêm vào đơn/);
  await screen.findByText(text.sale.orderNumber(1));
  const opener = screen.getByRole("button", { name: text.sale.checkout });
  opener.focus();
  fireEvent.click(opener);
  const dialog = await screen.findByRole("dialog", { name: T.title });
  return { dialog, opener };
}

describe("the payment drawer over the counter's order", () => {
  it("opens over the order, which stays as it was under it, unreachable", async () => {
    const server = cafeServer();
    await signedInTill(server);
    const { dialog } = await drawerOverTwoCoffees();
    const under = document.querySelector("[data-covered]");
    expect(under?.getAttribute("data-covered")).toBe("true");
    expect(under?.hasAttribute("inert")).toBe(true);
    expect(under?.querySelector("[data-cart-line]")).not.toBeNull();
    expect(within(dialog).getByRole("heading", { name: T.title })).toBeTruthy();
    expect(document.activeElement).toBe(dialog);
  });

  it("goes back to the order on Esc, sending nothing, with the focus on the pay button again", async () => {
    const server = cafeServer();
    await signedInTill(server);
    const { opener } = await drawerOverTwoCoffees();
    const before = pushedTypes(server).length;
    tap(T.quickCash(formatVnd(vnd(100_000))));
    fireEvent.keyDown(window, { key: text.sale.keys.back });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.querySelector("[data-covered]")?.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(opener);
    await settle();
    expect(pushedTypes(server).slice(before)).not.toContain("order.pay");
    expect(
      pushedTypes(server)
        .slice(before)
        .filter((type) => type.startsWith("payment.")),
    ).toEqual([]);
  });

  it("keeps the order's keys off under the drawer: F9 short of cash does nothing at all", async () => {
    const server = cafeServer();
    await signedInTill(server);
    await drawerOverTwoCoffees();
    await settle();
    const before = pushedTypes(server).length;
    fireEvent.keyDown(window, { key: text.sale.keys.pay });
    await settle();
    // Live, the order's F9 would save the draft again to open the payment a second time.
    expect(pushedTypes(server).slice(before)).toEqual([]);
    expect(screen.getByRole("dialog", { name: T.title })).toBeTruthy();
  });

  it("pays from the drawer with F9 once the cash covers the order", async () => {
    const server = cafeServer();
    await signedInTill(server);
    await drawerOverTwoCoffees();
    const give = (amount: string) => {
      fireEvent.change(screen.getByLabelText(T.cashTyped), { target: { value: amount } });
      tap(T.addCash);
    };
    give("50000");
    expect(screen.getByRole("button", { name: T.finish })).toHaveProperty("disabled", true);
    give("10000");
    fireEvent.keyDown(window, { key: text.sale.keys.pay });
    await screen.findByRole("heading", { name: text.checkout.done.title });
    await waitFor(() => expect(pushedTypes(server)).toContain("order.pay"));
    const pay = server.state.pushed.find((command) => command.type === "order.pay")?.payload;
    expect(pay).toMatchObject({
      payments: [
        { method: "cash", amount: 50_000 },
        { method: "cash", amount: 8_000 },
      ],
      expectedAmountDue: 58_000,
    });
  });
});
