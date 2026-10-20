import { formatVnd, vnd } from "@fnb/domain";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import { counterWithManager, managerApproves, pushedOf, tap } from "../test-support/approval-cafe";
import { signedInTill } from "../test-support/signed-in-till";

const T = text.closeShift;
const money = (amount: number) => formatVnd(vnd(amount));
const shown = (key: string) =>
  document.querySelector(`[data-${key}]`)?.getAttribute(`data-${key}`) ?? null;
const addNotes = (...notes: number[]) => {
  for (const note of notes) tap(text.checkout.openShift.addNote(money(note)));
};

/** A coffee sold for exactly 29.000 in cash, then the close screen. */
async function soldACoffeeThenClose(server: ReturnType<typeof counterWithManager>) {
  await signedInTill(server);
  tap(/^Cà phê sữa/);
  tap(/^Thêm vào đơn/);
  await screen.findByText(text.sale.orderNumber(1));
  tap(text.sale.checkout);
  await screen.findByRole("heading", { name: text.checkout.payment.title });
  tap(text.checkout.payment.quickCash(money(29_000)));
  tap(text.checkout.payment.finish);
  await screen.findByRole("heading", { name: text.checkout.done.title });
  tap(text.checkout.done.nextOrder);
  await screen.findByText(text.sale.orderNumber(2));
  tap(T.open);
  await screen.findByRole("heading", { name: T.title });
  await waitFor(() => expect(shown("expected")).toBe("29000"));
}

describe("closing the shift on the cashier's count", () => {
  it("closes on an exact count alone, prints the slip, then opens the next shift", async () => {
    const server = counterWithManager();
    await soldACoffeeThenClose(server);
    addNotes(20_000, 5_000, 2_000, 2_000);
    expect(shown("counted")).toBe("29000");
    expect(shown("difference")).toBe("0");
    expect(screen.getByText(T.noDifference)).toBeTruthy();
    // Coloured by its sign as well as said: none is the good case.
    expect(screen.getByText(T.noDifference).getAttribute("data-difference-sign")).toBe("0");
    tap(T.confirm);
    await screen.findByRole("heading", { name: T.doneTitle });
    await waitFor(() => expect(pushedOf(server, "shift.close")).toHaveLength(1));
    expect(pushedOf(server, "shift.close")[0]?.payload).toEqual({
      counted: 29_000,
      denominations: [
        { denomination: 20_000, pieces: 1 },
        { denomination: 5_000, pieces: 1 },
        { denomination: 2_000, pieces: 2 },
      ],
    });
    expect(server.state.calls.approvals).toEqual([]);
    const slip = document.querySelector('[data-slip-kind="shift_report"] pre')?.textContent ?? "";
    expect(slip).toContain("PHIẾU CHỐT CA");
    tap(T.openNext);
    expect(
      await screen.findByRole("heading", { name: text.checkout.openShift.title }),
    ).toBeTruthy();
  });

  it("asks a manager for a short drawer and records the close with its difference", async () => {
    const server = counterWithManager();
    await soldACoffeeThenClose(server);
    addNotes(20_000);
    expect(shown("difference")).toBe("-9000");
    // Money carries a no-break space, which text matchers fold away: read the page's text.
    expect(document.body.textContent).toContain(T.short(money(9_000)));
    const said = document.querySelector("[data-difference-sign]");
    expect([said?.textContent, said?.getAttribute("data-difference-sign")]).toEqual([
      T.short(money(9_000)),
      "-1",
    ]);
    expect(screen.getByText(T.needsApproval)).toBeTruthy();
    tap(T.confirm);
    await screen.findByRole("heading", { name: text.approval.title });
    expect(document.querySelector("[data-approval-for]")?.textContent).toBe(
      text.approval.actions.closeDifference(money(-9_000)),
    );
    await managerApproves();
    await screen.findByRole("heading", { name: T.doneTitle });
    await waitFor(() => expect(pushedOf(server, "shift.close")).toHaveLength(1));
    expect(server.state.calls.approvals[0]?.action).toEqual({ key: "accept_close_difference" });
    expect(pushedOf(server, "shift.close")[0]?.payload).toMatchObject({
      counted: 20_000,
      approvalId: server.state.approvals[0]?.approvalId,
    });
    const closed = [...server.rows.values()].find((row) => row.status === "closed");
    expect(closed?.close).toMatchObject({ expectedCash: 29_000, difference: -9_000 });
  });

  it("does not close a short drawer when nobody approves", async () => {
    const server = counterWithManager();
    await soldACoffeeThenClose(server);
    addNotes(20_000);
    tap(T.confirm);
    await screen.findByRole("heading", { name: text.approval.title });
    tap(text.approval.cancel);
    await screen.findByRole("heading", { name: T.title });
    await waitFor(() => expect(server.state.calls.pulls).toBeGreaterThan(5));
    expect(pushedOf(server, "shift.close")).toEqual([]);
  });

  it("asks a manager next time when the server found a difference the till did not", async () => {
    const server = counterWithManager();
    server.state.refuseTypes.set("shift.close", "SYNC_APPROVAL_REQUIRED");
    await soldACoffeeThenClose(server);
    addNotes(20_000, 5_000, 2_000, 2_000);
    tap(T.confirm);
    await screen.findByRole("heading", { name: T.doneTitle });
    await waitFor(() => expect(pushedOf(server, "shift.close")).toHaveLength(1));
    server.state.refuseTypes.delete("shift.close");
    tap(T.openNext);
    // The server kept the shift open: back to selling, and closing it again asks a manager.
    await screen.findByRole("button", { name: T.open });
    tap(T.open);
    expect(await screen.findByText(T.serverDisagreed)).toBeTruthy();
    addNotes(20_000, 5_000, 2_000, 2_000);
    tap(T.confirm);
    await managerApproves();
    await waitFor(() => expect(pushedOf(server, "shift.close")).toHaveLength(2));
    expect(pushedOf(server, "shift.close")[1]?.payload).toHaveProperty("approvalId");
  });
});
