import { formatGrams, formatVnd, vnd } from "@fnb/domain";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import { amountDue, cart, managerApproves, pushedOf, tap } from "../test-support/approval-cafe";
import { signedInTill } from "../test-support/signed-in-till";
import {
  BEANS,
  BIRTHDAY_CAKE,
  STRAWBERRIES,
  typedAndWeighedCafe,
  typedAndWeighedCafeWithWaiter,
} from "../test-support/typed-and-weighed-menu";

const E = text.sale.entry;

/** Taps the number keys of the drawer's keypad, one per character. */
function key(digits: string) {
  const keypad = within(screen.getByRole("group", { name: text.checkout.payment.keypad }));
  for (const digit of digits) fireEvent.click(keypad.getByRole("button", { name: digit }));
}

/** What the drawer says the line comes to, and its button, read off the elements. */
const lineAmount = () =>
  document.querySelector("[data-line-amount]")?.getAttribute("data-line-amount") ?? null;
const confirmButton = () => document.querySelector<HTMLButtonElement>("[form='pos-line-entry']");
const confirm = () => {
  const button = confirmButton();
  if (button === null) throw new Error("no entry drawer");
  fireEvent.click(button);
};

type SaveDraftLine = {
  lineId: string;
  productId: string;
  quantity: string;
  enteredPrice?: number;
  priceApprovalId?: string;
};
type Server = ReturnType<typeof typedAndWeighedCafe>;
const lastDraft = (server: Server) =>
  pushedOf(server, "order.save_draft").at(-1)?.payload as
    | { orderId: string; lines: SaveDraftLine[] }
    | undefined;
const lineOf = (server: Server, productId: string) =>
  lastDraft(server)?.lines.find((line) => line.productId === productId);

describe("a product sold by weight at the counter", () => {
  it("takes the grams on the keypad, prices them by the domain and sends the weight", async () => {
    const server = typedAndWeighedCafe();
    await signedInTill(server);
    tap(new RegExp(`^${BEANS.name}`));
    await screen.findByRole("dialog", { name: E.weightTitle(BEANS.name) });
    expect(confirmButton()?.disabled).toBe(true);
    key("351");
    // 351 g at 32.000 đ per 100 g.
    expect(lineAmount()).toBe("112320");
    confirm();

    await waitFor(() => expect(amountDue()).toBe("112320"));
    const row = cart().getByRole("button", { name: E.reweigh(BEANS.name) });
    expect(row.getAttribute("data-weighed")).toBe("351");
    // One weighing: no stepper to count it up.
    expect(cart().queryByRole("button", { name: text.sale.more(BEANS.name) })).toBeNull();
    await waitFor(() => expect(lineOf(server, BEANS.id)?.quantity).toBe("3.51"));
    expect(lineOf(server, BEANS.id)).not.toHaveProperty("enteredPrice");
  });

  it("weighs from the quick keys and refuses more than 100 kg on one line", async () => {
    const server = typedAndWeighedCafe();
    await signedInTill(server);
    tap(new RegExp(`^${STRAWBERRIES.name}`));
    await screen.findByRole("dialog", { name: E.weightTitle(STRAWBERRIES.name) });
    tap(formatGrams(250));
    expect(lineAmount()).toBe("50000");
    key("0000");
    expect(await screen.findByText(E.tooHeavy)).toBeTruthy();
    expect(confirmButton()?.disabled).toBe(true);
    expect(lineAmount()).toBeNull();
  });

  it("weighs a line again from the cart and saves the new weight in place", async () => {
    const server = typedAndWeighedCafe();
    await signedInTill(server);
    tap(new RegExp(`^${STRAWBERRIES.name}`));
    key("353");
    expect(lineAmount()).toBe("70600");
    confirm();
    await waitFor(() => expect(amountDue()).toBe("70600"));
    const lineId = lineOf(server, STRAWBERRIES.id)?.lineId;

    tap(E.reweigh(STRAWBERRIES.name));
    await screen.findByRole("dialog", { name: E.weightTitle(STRAWBERRIES.name) });
    tap(text.checkout.payment.backspace);
    tap(text.checkout.payment.backspace);
    tap(text.checkout.payment.backspace);
    key("1250");
    expect(confirmButton()?.textContent).toContain("Lưu");
    confirm();

    await waitFor(() => expect(amountDue()).toBe("250000"));
    await waitFor(() => expect(lineOf(server, STRAWBERRIES.id)?.quantity).toBe("1.25"));
    expect(lastDraft(server)?.lines).toHaveLength(1);
    expect(lineOf(server, STRAWBERRIES.id)?.lineId).toBe(lineId);
  });
});

describe("a product sold at the price the cashier types", () => {
  it("lets a cashier type it alone, from the usual price, and counts units of it", async () => {
    const server = typedAndWeighedCafe();
    await signedInTill(server);
    tap(new RegExp(`^${BIRTHDAY_CAKE.name}`));
    await screen.findByRole("dialog", { name: E.priceTitle(BIRTHDAY_CAKE.name) });
    expect(screen.queryByText(E.needsManager)).toBeNull();
    tap(new RegExp(E.usualPrice));
    expect(lineAmount()).toBe("250000");
    confirm();

    await waitFor(() => expect(amountDue()).toBe("250000"));
    expect(screen.queryByText(text.approval.title)).toBeNull();
    expect(server.state.calls.approvals).toEqual([]);
    const pill = cart().getByRole("button", { name: E.changePrice(BIRTHDAY_CAKE.name) });
    expect(pill.getAttribute("data-typed-price")).toBe("250000");
    tap(text.sale.more(BIRTHDAY_CAKE.name));
    await waitFor(() => expect(amountDue()).toBe("500000"));
    await waitFor(() =>
      expect(lineOf(server, BIRTHDAY_CAKE.id)).toMatchObject({ quantity: "2", enteredPrice: 250_000 }),
    );
    expect(lineOf(server, BIRTHDAY_CAKE.id)).not.toHaveProperty("priceApprovalId");
  });

  it("refuses a price past 100.000.000 đ before anything is sent", async () => {
    const server = typedAndWeighedCafe();
    await signedInTill(server);
    tap(new RegExp(`^${BIRTHDAY_CAKE.name}`));
    key("100000001");
    expect(await screen.findByText(E.tooHigh)).toBeTruthy();
    expect(confirmButton()?.disabled).toBe(true);
    tap(text.checkout.payment.backspace);
    expect(lineAmount()).toBe("10000000");
  });

  it("asks a manager for a waiter's price, for that price on that line, and sends the approval", async () => {
    const server = typedAndWeighedCafeWithWaiter();
    await signedInTill(server);
    tap(new RegExp(`^${BIRTHDAY_CAKE.name}`));
    expect(await screen.findByText(E.needsManager)).toBeTruthy();
    key("180000");
    confirm();
    await screen.findByRole("heading", { name: text.approval.title });
    // Money is written with a no-break space, so the sheet is read by what it was asked for.
    expect(document.querySelector("[data-approval-for]")?.getAttribute("data-approval-for")).toBe(
      E.approvalFor(BIRTHDAY_CAKE.name, formatVnd(vnd(180_000))),
    );
    await managerApproves();

    await waitFor(() => expect(amountDue()).toBe("180000"));
    await waitFor(() => expect(lineOf(server, BIRTHDAY_CAKE.id)?.enteredPrice).toBe(180_000));
    const sent = lineOf(server, BIRTHDAY_CAKE.id);
    expect(server.state.calls.approvals.map((call) => call.action)).toEqual([
      {
        key: "open_price",
        enteredPrice: "180000",
        subject: { orderId: lastDraft(server)?.orderId, lineId: sent?.lineId },
      },
    ]);
    expect(sent?.priceApprovalId).toBe(server.state.approvals[0]?.approvalId);
  });

  it("asks again for a price changed later, and keeps what was typed if nobody approves", async () => {
    const server = typedAndWeighedCafeWithWaiter();
    await signedInTill(server);
    tap(new RegExp(`^${BIRTHDAY_CAKE.name}`));
    key("180000");
    confirm();
    await managerApproves();
    await waitFor(() => expect(amountDue()).toBe("180000"));

    tap(E.changePrice(BIRTHDAY_CAKE.name));
    await screen.findByRole("dialog", { name: E.priceTitle(BIRTHDAY_CAKE.name) });
    tap(text.checkout.payment.backspace);
    tap(text.checkout.payment.backspace);
    tap(text.checkout.payment.backspace);
    tap(text.checkout.payment.backspace);
    key("5000");
    confirm();
    await screen.findByRole("heading", { name: text.approval.title });
    tap(text.approval.cancel);
    // Back in the drawer with the new price still typed, nothing changed on the order.
    await screen.findByRole("dialog", { name: E.priceTitle(BIRTHDAY_CAKE.name) });
    expect(lineAmount()).toBe("185000");
    expect(amountDue()).toBe("180000");

    confirm();
    await managerApproves();
    await waitFor(() => expect(amountDue()).toBe("185000"));
    const [first, second] = server.state.calls.approvals.map((call) => call.action);
    expect(second).toMatchObject({ enteredPrice: "185000", subject: first?.subject });
    await waitFor(() =>
      expect(lineOf(server, BIRTHDAY_CAKE.id)?.priceApprovalId).toBe(
        server.state.approvals[1]?.approvalId,
      ),
    );
  });
});
