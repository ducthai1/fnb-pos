import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import { amountDue, cart, counterWithManager, pushedOf, tap } from "../test-support/approval-cafe";
import { signedInTill } from "../test-support/signed-in-till";

const T = text.adjust;
const COFFEE = "Cà phê sữa";

async function twoCoffees(server: ReturnType<typeof counterWithManager>) {
  await signedInTill(server);
  tap(/^Cà phê sữa/);
  tap(text.sale.more(COFFEE));
  tap(/^Thêm vào đơn/);
  await waitFor(() => expect(amountDue()).toBe("58000"));
}

describe("cancelling an item on the counter's order", () => {
  it("takes one of two coffees off with the reason, and holds the line as it is", async () => {
    const server = counterWithManager();
    await twoCoffees(server);
    tap(T.tools.void(COFFEE));
    await screen.findByRole("heading", { name: T.void.title });
    const confirm = screen.getByRole("button", { name: T.void.confirm(1) });
    // No reason, no void: the button waits for one.
    expect(confirm).toHaveProperty("disabled", true);
    tap(text.reasons.customer_changed_mind);
    tap(T.void.confirm(1));
    await screen.findByRole("region", { name: text.sale.menuLabel });
    expect(amountDue()).toBe("29000");
    expect(cart().getByText(`${COFFEE} ×1`)).toBeTruthy();
    expect(cart().queryByRole("button", { name: text.sale.more(COFFEE) })).toBeNull();
    await waitFor(() => expect(pushedOf(server, "order.void_line")).toHaveLength(1));
    const draft = pushedOf(server, "order.save_draft").at(-1)?.payload as {
      lines: { lineId: string }[];
    };
    expect(pushedOf(server, "order.void_line")[0]?.payload).toEqual({
      orderId: expect.any(String),
      lineId: draft.lines[0]?.lineId,
      quantity: "1",
      reasonCode: "customer_changed_mind",
    });
    // Nothing the kitchen had: nobody was asked.
    expect(server.state.calls.approvals).toEqual([]);
  });

  it("cannot cancel more than is left on the order", async () => {
    const server = counterWithManager();
    await twoCoffees(server);
    tap(T.tools.void(COFFEE));
    await screen.findByRole("heading", { name: T.void.title });
    tap(text.sale.more(COFFEE));
    expect(screen.getByRole("button", { name: text.sale.more(COFFEE) })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: T.void.confirm(2) })).toBeTruthy();
  });
});

describe("cancelling the counter's draft", () => {
  it("drops it with the reason and starts the next customer's order", async () => {
    const server = counterWithManager();
    await twoCoffees(server);
    tap(T.tools.cancelOrder);
    await screen.findByRole("heading", { name: T.cancel.title(1) });
    tap(text.reasons.customer_left);
    tap(T.cancel.confirm);
    expect(await screen.findByText(text.sale.orderNumber(2))).toBeTruthy();
    await waitFor(() => expect(pushedOf(server, "order.cancel")).toHaveLength(1));
    const draft = pushedOf(server, "order.save_draft").at(-1)?.payload as { orderId: string };
    expect(pushedOf(server, "order.cancel")[0]?.payload).toEqual({
      orderId: draft.orderId,
      reasonCode: "customer_left",
    });
  });

  it("says why when the server will not cancel it: the customer's QR transfer was paid", async () => {
    const server = counterWithManager();
    server.state.refuseTypes.set("order.cancel", "SYNC_ORDER_HAS_SETTLED_QR");
    await twoCoffees(server);
    tap(T.tools.cancelOrder);
    await screen.findByRole("heading", { name: T.cancel.title(1) });
    tap(text.reasons.duplicate_order);
    tap(T.cancel.confirm);
    // The next customer's order is on the counter before the refusal comes back.
    await screen.findByText(text.sale.orderNumber(2));
    fireEvent.click(await screen.findByText(text.sync.needsAttention(1), {}, { timeout: 3_000 }));
    expect(await screen.findByText(text.errors.SYNC_ORDER_HAS_SETTLED_QR)).toBeTruthy();
  });
});
