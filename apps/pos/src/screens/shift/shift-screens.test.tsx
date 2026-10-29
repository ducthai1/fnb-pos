import { type ClosingAssessment, type DenominationCount, type ShiftCashSummary, type Vnd, formatVnd, vnd } from "@fnb/domain";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi as mock } from "vitest";
import { vi as text } from "../../messages/vi";
import { OpenShiftScreen } from "../open-shift/open-shift-screen";
import { CashMoveScreen } from "./cash-move-screen";
import { CloseShiftScreen } from "./close-shift-screen";

const money = (amount: number) => formatVnd(vnd(amount));
const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const FIGURES: ShiftCashSummary = {
  openingCash: vnd(500_000),
  cashSales: vnd(1_200_000),
  cashRefunds: vnd(0),
  cashIn: vnd(0),
  cashOut: vnd(100_000),
  expectedCash: vnd(1_600_000),
};

describe("the drawer's screens, redrawn", () => {
  it("counts the opening float by taps, lights the row of a counted note, and opens with the counts", async () => {
    const onOpen = mock.fn<(counts: readonly DenominationCount[]) => Promise<void>>(async () => {});
    render(<OpenShiftScreen header={null} onOpen={onOpen} />);
    expect(document.querySelectorAll(".pos-note-row[data-filled]")).toHaveLength(0);
    tap(text.checkout.openShift.addNote(money(200_000)));
    tap(text.checkout.openShift.addNote(money(200_000)));
    expect(document.querySelectorAll(".pos-note-row[data-filled]")).toHaveLength(1);
    expect(document.querySelector(".pos-total")?.textContent).toContain("400.000");
    tap(text.checkout.openShift.removeNote(money(200_000)));
    tap(text.checkout.openShift.open);
    expect(onOpen).toHaveBeenCalledTimes(1);
    const counts = onOpen.mock.calls[0]![0];
    expect(counts.find((count) => count.denomination === 200_000n)?.pieces).toBe(1);
    tap(text.checkout.openShift.clear);
    expect(document.querySelectorAll(".pos-note-row[data-filled]")).toHaveLength(0);
  });

  it("shows the book beside the count, and colours the difference by its sign", () => {
    const assess = (counted: Vnd): ClosingAssessment => ({
      expectedCash: vnd(1_600_000),
      countedCash: counted,
      difference: vnd(Number(counted) - 1_600_000),
      needsAcceptance: false,
    });
    const onConfirm = mock.fn<(...args: unknown[]) => Promise<string | null>>(async () => null);
    render(
      <CloseShiftScreen header={null} figures={FIGURES} assess={assess} notice={null} onConfirm={onConfirm} onBack={() => {}} />,
    );
    const difference = () => document.querySelector(".pos-figures__row[data-sign]")?.getAttribute("data-sign");
    expect(difference()).toBe("-1");
    expect(document.querySelector("[data-expected]")?.textContent).toBe(money(1_600_000));
    for (let i = 0; i < 3; i += 1) tap(text.checkout.openShift.addNote(money(500_000)));
    tap(text.checkout.openShift.addNote(money(100_000)));
    expect(difference()).toBe("0");
    expect(screen.getByText(text.closeShift.noDifference)).toBeTruthy();
    tap(text.checkout.openShift.addNote(money(1_000)));
    expect(difference()).toBe("1");
    tap(text.closeShift.confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("records cash in or out with its reason, the chosen half marked", async () => {
    const onConfirm = mock.fn<(...args: unknown[]) => Promise<string | null>>(async () => null);
    render(
      <CashMoveScreen header={null} expectedAfter={(_kind, amount) => amount} onConfirm={onConfirm} onBack={() => {}} />,
    );
    const out = screen.getByRole("button", { name: text.cash.out });
    const into = screen.getByRole("button", { name: text.cash.in });
    expect(out.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(into);
    expect(into.getAttribute("aria-pressed")).toBe("true");
    expect(out.getAttribute("aria-pressed")).toBe("false");
    fireEvent.change(screen.getByLabelText(text.cash.amount), { target: { value: "50000" } });
    fireEvent.change(screen.getByLabelText(text.cash.reason), { target: { value: "đổi tiền lẻ" } });
    tap(text.cash.confirm("in", money(50_000)));
    expect(onConfirm).toHaveBeenCalledWith("in", vnd(50_000), "đổi tiền lẻ");
  });
});
