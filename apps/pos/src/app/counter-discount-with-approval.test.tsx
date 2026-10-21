import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import {
  amountDue,
  cart,
  counterWithManager,
  managerApproves,
  pushedOf,
  tap,
} from "../test-support/approval-cafe";
import { signedInTill } from "../test-support/signed-in-till";

const T = text.adjust;
const COFFEE = "Cà phê sữa";

async function ringUpCoffees(server: ReturnType<typeof counterWithManager>, count: number) {
  await signedInTill(server);
  tap(/^Cà phê sữa/);
  for (let more = 1; more < count; more += 1) tap(text.sale.more(COFFEE));
  tap(/^Thêm vào đơn/);
  await waitFor(() => expect(amountDue()).toBe(String(29_000 * count)));
}

async function discountCoffee(preset: string) {
  tap(T.tools.lineMenu(COFFEE));
  tap(T.tools.discount(COFFEE));
  await screen.findByRole("heading", { name: T.discount.titleLine(COFFEE) });
  tap(T.discount.percentPreset(preset));
  tap(T.discount.confirm);
}

describe("a discount on an item at the counter", () => {
  it("gives 10% off alone, within the cashier's cap, and asks nobody", async () => {
    const server = counterWithManager();
    await ringUpCoffees(server, 2);
    await discountCoffee("10%");
    await screen.findByRole("region", { name: text.sale.menuLabel });
    expect(screen.queryByText(text.approval.title)).toBeNull();
    expect(amountDue()).toBe("52200");
    await waitFor(() => expect(pushedOf(server, "order.apply_discount")).toHaveLength(1));
    const sent = pushedOf(server, "order.apply_discount")[0]?.payload as Record<string, unknown>;
    expect(sent).toMatchObject({ scope: "line", discount: { kind: "percent", rate: 1000 } });
    expect(sent).not.toHaveProperty("approvalId");
    expect(server.state.calls.approvals).toEqual([]);
    // The item is held as it is now: taking a coffee off would be a void.
    expect(cart().queryByRole("button", { name: text.sale.less(COFFEE) })).toBeNull();
  });

  it("asks a manager for 20%, says what for, and sends the approval with the discount", async () => {
    const server = counterWithManager();
    await ringUpCoffees(server, 1);
    await discountCoffee("20%");
    await screen.findByRole("heading", { name: text.approval.title });
    expect(screen.getByText(text.approval.actions.lineDiscountRate("20%", COFFEE))).toBeTruthy();
    await managerApproves();
    await screen.findByRole("region", { name: text.sale.menuLabel });
    expect(amountDue()).toBe("23200");
    await waitFor(() => expect(pushedOf(server, "order.apply_discount")).toHaveLength(1));
    // The manager approved up to 20% of this coffee of this order, and nothing else.
    const applied = pushedOf(server, "order.apply_discount")[0]?.payload;
    expect(server.state.calls.approvals.map((call) => call.action)).toEqual([
      {
        key: "line_discount",
        discountRate: 2000,
        subject: { orderId: applied?.orderId, lineId: applied?.lineId },
      },
    ]);
    expect(pushedOf(server, "order.apply_discount")[0]?.payload).toMatchObject({
      approvalId: server.state.approvals[0]?.approvalId,
      discount: { kind: "percent", rate: 2000 },
    });
  });

  it("records nothing when the manager is not asked after all", async () => {
    const server = counterWithManager();
    await ringUpCoffees(server, 1);
    await discountCoffee("20%");
    await screen.findByRole("heading", { name: text.approval.title });
    tap(text.approval.cancel);
    await screen.findByRole("heading", { name: T.discount.titleLine(COFFEE) });
    tap(T.back);
    await screen.findByRole("region", { name: text.sale.menuLabel });
    expect(amountDue()).toBe("29000");
    await waitFor(() => expect(server.state.calls.pulls).toBeGreaterThan(3));
    expect(pushedOf(server, "order.apply_discount")).toEqual([]);
  });

  it("judges a second discount by what all of them take off, not the newest alone", async () => {
    const server = counterWithManager();
    await ringUpCoffees(server, 1);
    await discountCoffee("10%");
    await screen.findByRole("region", { name: text.sale.menuLabel });
    await discountCoffee("5%");
    // 10% then 5% of what is left is 14,5% of the coffee: past the cashier's 10%.
    expect(
      await screen.findByText(
        `${text.approval.actions.lineDiscountRate("5%", COFFEE)} (${text.approval.actions.discountInAll("14,5%")})`,
      ),
    ).toBeTruthy();
  });

  it("takes the discount off again, for nobody's approval", async () => {
    const server = counterWithManager();
    await ringUpCoffees(server, 1);
    await discountCoffee("10%");
    await screen.findByRole("region", { name: text.sale.menuLabel });
    tap(T.tools.lineMenu(COFFEE));
    tap(T.tools.discount(COFFEE));
    (await screen.findByRole("button", { name: T.discount.remove })).click();
    await screen.findByRole("region", { name: text.sale.menuLabel });
    expect(amountDue()).toBe("29000");
    await waitFor(() => expect(pushedOf(server, "order.remove_discount")).toHaveLength(1));
    const given = pushedOf(server, "order.apply_discount")[0]?.payload as {
      discountLineIds: string[];
    };
    expect(pushedOf(server, "order.remove_discount")[0]?.payload).toMatchObject({
      discountLineIds: given.discountLineIds,
    });
  });

  it("shows the discount at once and keeps it while the server cannot be reached", async () => {
    const server = counterWithManager();
    await ringUpCoffees(server, 1);
    server.state.online = false;
    await discountCoffee("10%");
    await screen.findByRole("region", { name: text.sale.menuLabel });
    expect(amountDue()).toBe("26100");
    expect(await screen.findByText(text.sync.offline, {}, { timeout: 3_000 })).toBeTruthy();
    expect(amountDue()).toBe("26100");
    server.state.online = true;
    await waitFor(() => expect(pushedOf(server, "order.apply_discount")).toHaveLength(1), {
      timeout: 5_000,
    });
    expect(amountDue()).toBe("26100");
  });
});
