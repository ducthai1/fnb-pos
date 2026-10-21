import { basisPoints, quantity, vnd } from "@fnb/domain";
import { describe, expect, it } from "vitest";
import { actionOnWire, tillAuthority } from "./till-authority";

const LAN = { id: "lan", displayName: "Lan", active: true };
const MINH = { id: "minh", displayName: "Minh", active: true };
const GONE = { id: "gone", displayName: "Nghỉ việc", active: false };

const cashierAuthority = () =>
  tillAuthority({
    staffId: LAN.id,
    grants: [
      { key: "line_discount", threshold: { maxRate: basisPoints(1000) } },
      { key: "cash_move", threshold: { maxAmount: vnd(500_000) } },
    ],
    staff: [LAN, MINH, GONE],
    requestApproval: async () => ({ ok: true, value: "approval" }),
  });

describe("what the staff member at the till may do alone", () => {
  it("lets a cashier give 10% off an item alone and asks a manager for 20%", () => {
    const authority = cashierAuthority();
    expect(authority.decide({ key: "line_discount", discountRate: basisPoints(1000) })).toBe(
      "allowed",
    );
    expect(authority.decide({ key: "line_discount", discountRate: basisPoints(2000) })).toBe(
      "needs_approval",
    );
  });

  it("asks a manager for an action the cashier holds no key for", () => {
    expect(cashierAuthority().decide({ key: "refund" })).toBe("needs_approval");
  });

  it("offers everyone active at the branch but the person asking as approver", () => {
    expect(cashierAuthority().approvers).toEqual([MINH]);
  });

  it("sends money as a decimal string and leaves out the value an action does not carry", () => {
    expect(actionOnWire({ key: "cash_move", amount: vnd(9_007_199_254_740_993n) })).toEqual({
      key: "cash_move",
      amount: "9007199254740993",
    });
    expect(actionOnWire({ key: "refund" })).toEqual({ key: "refund" });
    expect(actionOnWire({ key: "order_discount", discountRate: basisPoints(2000) })).toEqual({
      key: "order_discount",
      discountRate: 2000,
    });
  });

  it("sends what the approval is for: the order, line or shift, the refund's money, the void's units", () => {
    const orderId = "0199f0ee-0000-7000-8000-00000000c0de";
    expect(
      actionOnWire({ key: "refund", refundAmount: vnd(25_000), subject: { orderId } }),
    ).toEqual({ key: "refund", refundAmount: "25000", subject: { orderId } });
    const subject = { orderId, lineId: "0199f0ee-0000-7000-8000-00000000beef" };
    expect(
      actionOnWire({ key: "void_after_sent", voidedQuantity: quantity("1.5"), subject }),
    ).toEqual({ key: "void_after_sent", voidedQuantity: "1.5", subject });
  });
});
