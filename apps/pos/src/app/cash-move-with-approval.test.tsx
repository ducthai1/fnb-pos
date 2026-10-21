import { formatVnd, vnd } from "@fnb/domain";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import { counterWithManager, managerApproves, pushedOf, tap } from "../test-support/approval-cafe";
import { signedInTill } from "../test-support/signed-in-till";

const C = text.cash;
const A = text.approval.actions;
const money = (amount: number) => formatVnd(vnd(amount));
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

async function moveCash(kind: "in" | "out", amount: number, reason: string) {
  tap(kind === "in" ? C.in : C.out);
  fireEvent.change(field(C.amount), { target: { value: String(amount) } });
  fireEvent.change(field(C.reason), { target: { value: reason } });
  tap(C.confirm(kind, money(amount)));
}

async function cashScreen(server: ReturnType<typeof counterWithManager>) {
  await signedInTill(server);
  tap(C.open);
  await screen.findByRole("heading", { name: C.title });
  await screen.findByLabelText(C.amount);
}

describe("cash in and out of the drawer outside a sale", () => {
  it("takes 200.000 out alone, within the cashier's 500.000, with the reason", async () => {
    const server = counterWithManager();
    await cashScreen(server);
    await moveCash("out", 200_000, "Trả tiền đá");
    await waitFor(() =>
      expect(document.querySelector('[role="status"]')?.textContent).toBe(
        C.done("out", money(200_000)),
      ),
    );
    expect(server.state.calls.approvals).toEqual([]);
    await waitFor(() => expect(pushedOf(server, "shift.cash_move")).toHaveLength(1));
    expect(pushedOf(server, "shift.cash_move")[0]?.payload).toEqual({
      cashMoveId: expect.any(String),
      kind: "out",
      amount: 200_000,
      reason: "Trả tiền đá",
    });
  });

  it("asks a manager once the shift's moves pass the cap, for everything moved", async () => {
    const server = counterWithManager();
    await cashScreen(server);
    await moveCash("out", 400_000, "Trả tiền sữa");
    await waitFor(() => expect(pushedOf(server, "shift.cash_move")).toHaveLength(1));
    await moveCash("in", 200_000, "Đổi tiền lẻ");
    await screen.findByRole("heading", { name: text.approval.title });
    expect(document.querySelector("[data-approval-for]")?.textContent).toBe(
      `${A.cashIn(money(200_000))} (${A.cashInShift(money(600_000))})`,
    );
    await managerApproves();
    await waitFor(() => expect(pushedOf(server, "shift.cash_move")).toHaveLength(2));
    // The manager approved this shift's total, in this shift only.
    expect(server.state.calls.approvals[0]?.action).toEqual({
      key: "cash_move",
      amount: "600000",
      subject: { shiftId: pushedOf(server, "shift.open")[0]?.payload.shiftId },
    });
    expect(pushedOf(server, "shift.cash_move")[1]?.payload).toMatchObject({
      kind: "in",
      amount: 200_000,
      approvalId: server.state.approvals[0]?.approvalId,
    });
  });

  it("records nothing without an amount and a reason", async () => {
    const server = counterWithManager();
    await cashScreen(server);
    fireEvent.change(field(C.amount), { target: { value: "2O0.000" } });
    expect(screen.getByText(C.unreadable)).toBeTruthy();
    fireEvent.change(field(C.amount), { target: { value: "50000" } });
    expect(screen.getByRole("button", { name: C.confirm("out", money(50_000)) })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.change(field(C.reason), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: C.confirm("out", money(50_000)) })).toHaveProperty(
      "disabled",
      true,
    );
    expect(pushedOf(server, "shift.cash_move")).toEqual([]);
  });

  it("counts a move made offline at once, in what the drawer should hold at the close", async () => {
    const server = counterWithManager();
    await cashScreen(server);
    server.state.online = false;
    await moveCash("in", 300_000, "Thêm tiền lẻ đầu ca");
    expect(await screen.findByText(text.sync.offline, {}, { timeout: 3_000 })).toBeTruthy();
    tap(C.back);
    tap(text.closeShift.open);
    await screen.findByRole("heading", { name: text.closeShift.title });
    await waitFor(() =>
      expect(document.querySelector("[data-expected]")?.getAttribute("data-expected")).toBe(
        "300000",
      ),
    );
    expect(pushedOf(server, "shift.cash_move")).toEqual([]);
  });
});
