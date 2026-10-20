import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import { SHOP_ACCOUNT, bankSettles, money } from "../test-support/qr-cafe-server";
import {
  FLOOR,
  addCoffees,
  openTable,
  pushedOf,
  tableCafeServer,
  tap,
  tileStatus,
  tillOnTheFloor,
} from "../test-support/table-cafe-server";

describe("paying for a table by VietQR", () => {
  it("closes the table's order once the bank's notice paid its QR, and frees the table", async () => {
    const server = tableCafeServer(true, { payment_account: SHOP_ACCOUNT });
    await tillOnTheFloor(server);
    await openTable(FLOOR.t2, "2");
    addCoffees(2);
    tap(text.tables.order.pay);
    await screen.findByRole("heading", { name: text.checkout.payment.title });
    tap(text.qr.offer(money(58_000)));
    await screen.findByRole("heading", { name: text.qr.title });
    await waitFor(() => expect(pushedOf(server, "payment.create_intent")).toHaveLength(1));
    const intent = pushedOf(server, "payment.create_intent")[0]?.payload;
    bankSettles(server, "paid", 58_000);
    await screen.findByRole("heading", { name: text.checkout.done.title });
    await waitFor(() => expect(pushedOf(server, "order.pay")).toHaveLength(1));
    expect(pushedOf(server, "order.pay")[0]?.payload).toMatchObject({
      payments: [{ method: "qr_transfer", amount: 58_000, paymentIntentId: intent?.intentId }],
      expectedAmountDue: 58_000,
    });
    tap(text.tables.order.backToFloor);
    await waitFor(() => expect(tileStatus(FLOOR.t2)).toBe("free"));
  });

  it("offers no QR at a table of a branch that set no account for it", async () => {
    const server = tableCafeServer();
    await tillOnTheFloor(server);
    await openTable(FLOOR.t2, "2");
    addCoffees(1);
    tap(text.tables.order.pay);
    await screen.findByRole("heading", { name: text.checkout.payment.title });
    expect(screen.queryByRole("button", { name: text.qr.offer(money(29_000)) })).toBeNull();
    expect(screen.getByText(text.qr.noAccount)).toBeTruthy();
  });
});
