import { formatVnd, vnd } from "@fnb/domain";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import { MINH, MINH_PIN, counterWithManager, pushedOf, tap } from "../test-support/approval-cafe";
import { sessionOf } from "../test-support/fake-pos-api";
import { LAN, signedInTill, typePin } from "../test-support/signed-in-till";

const money = (amount: number) => formatVnd(vnd(amount));
const tokenOf = (staffId: string) => `staff-${staffId}`;

/** A coffee sold for exactly 29.000 in cash, the next customer's order on the counter. */
async function sellACoffee(orderNo: number) {
  tap(/^Cà phê sữa/);
  tap(/^Thêm vào đơn/);
  await screen.findByText(text.sale.orderNumber(orderNo));
  tap(text.sale.checkout);
  await screen.findByRole("heading", { name: text.checkout.payment.title });
  tap(text.checkout.payment.quickCash(money(29_000)));
  tap(text.checkout.payment.finish);
  await screen.findByRole("heading", { name: text.checkout.done.title });
  tap(text.checkout.done.nextOrder);
  await screen.findByText(text.sale.orderNumber(orderNo + 1));
}

describe("handing the till over while the first cashier's sale has not synced", () => {
  it("pushes that sale under the first cashier's session, and the next one's under theirs", async () => {
    const server = counterWithManager();
    await signedInTill(server);
    await waitFor(() => expect(pushedOf(server, "shift.open")).toHaveLength(1));
    // The network drops: Lan's sale stays on the till.
    server.state.pushesHeld = true;
    await sellACoffee(1);
    expect(pushedOf(server, "order.pay")).toEqual([]);
    // Minh takes over (signing in still reaches the server), then the pushes go through.
    tap(text.sales.switchStaff);
    await screen.findByRole("heading", { name: text.staff.title });
    tap(MINH.displayName);
    await typePin(MINH_PIN);
    await screen.findByRole("region", { name: text.sale.menuLabel });
    await sellACoffee(2);
    server.state.pushesHeld = false;
    await waitFor(() => expect(pushedOf(server, "order.pay")).toHaveLength(2));
    const pushedUnder = (orderPay: number) => {
      const pay = pushedOf(server, "order.pay")[orderPay];
      const batch = server.state.pushedWith.find((sent) =>
        sent.commands.some((command) => command.commandId === pay?.commandId),
      );
      return { token: batch?.token, session: pay?.staffSessionId };
    };
    expect(pushedUnder(0)).toEqual({ token: tokenOf(LAN.id), session: sessionOf(LAN.id) });
    expect(pushedUnder(1)).toEqual({ token: tokenOf(MINH.id), session: sessionOf(MINH.id) });
    // No batch mixes the two cashiers' commands.
    for (const sent of server.state.pushedWith) {
      expect(new Set(sent.commands.map((command) => command.staffSessionId)).size).toBe(1);
    }
  });
});
