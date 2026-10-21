import { describe, expect, it } from "vitest";
import { basisPoints, quantity, vnd } from "../money";
import { judgeApproval, missingApprovalTerm } from "./approval-coverage";
import type { PermissionAction } from "./authorize";
import { PERMISSION_DEFINITIONS, PERMISSION_KEYS } from "./permission-catalog";

const ORDER_A = "0190a000-0000-7000-8000-00000000000a";
const ORDER_B = "0190a000-0000-7000-8000-00000000000b";
const LINE_1 = "0190a000-0000-7000-8000-000000000001";
const LINE_2 = "0190a000-0000-7000-8000-000000000002";
const SHIFT_1 = "0190a000-0000-7000-8000-0000000000f1";
const SHIFT_2 = "0190a000-0000-7000-8000-0000000000f2";

const refund = (orderId: string, amount: bigint): PermissionAction => ({
  key: "refund",
  refundAmount: vnd(amount),
  subject: { orderId },
});
const lineDiscount = (lineId: string, rate: number, orderId = ORDER_A): PermissionAction => ({
  key: "line_discount",
  discountRate: basisPoints(rate),
  subject: { orderId, lineId },
});
const orderDiscount = (orderId: string, rate: number): PermissionAction => ({
  key: "order_discount",
  discountRate: basisPoints(rate),
  subject: { orderId },
});

describe("what an approval must name", () => {
  it("binds every key that names something to its kind of subject", () => {
    // Written out by hand, so unbinding a key by accident fails here.
    expect(
      PERMISSION_KEYS.filter((key) => PERMISSION_DEFINITIONS[key].subject !== undefined).map(
        (key) => [key, PERMISSION_DEFINITIONS[key].subject],
      ),
    ).toEqual([
      ["refund", "order"],
      ["void_after_sent", "order_line"],
      ["line_discount", "order_line"],
      ["order_discount", "order"],
      ["cash_move", "shift"],
      ["open_drawer", "shift"],
      ["accept_close_difference", "shift"],
      ["close_unpaid_table", "order"],
    ]);
  });

  it("refuses a request an old till sends without a subject, or with one of the wrong kind", () => {
    expect(missingApprovalTerm({ key: "refund", refundAmount: vnd(25_000n) })).toBe("subject");
    expect(missingApprovalTerm({ key: "close_unpaid_table" })).toBe("subject");
    expect(
      missingApprovalTerm({ key: "refund", refundAmount: vnd(1n), subject: { shiftId: SHIFT_1 } }),
    ).toBe("subject");
    expect(
      missingApprovalTerm({
        key: "line_discount",
        discountRate: basisPoints(2_000),
        subject: { orderId: ORDER_A },
      }),
    ).toBe("subject");
    expect(
      missingApprovalTerm({
        key: "order_discount",
        discountRate: basisPoints(2_000),
        subject: { orderId: ORDER_A, lineId: LINE_1 },
      }),
    ).toBe("subject");
    expect(missingApprovalTerm({ key: "transfer_table", subject: { orderId: ORDER_A } })).toBe(
      "subject",
    );
  });

  it("refuses a refund, void or close difference that names no figure", () => {
    expect(missingApprovalTerm({ key: "refund", subject: { orderId: ORDER_A } })).toBe("figure");
    expect(
      missingApprovalTerm({
        key: "void_after_sent",
        subject: { orderId: ORDER_A, lineId: LINE_1 },
      }),
    ).toBe("figure");
    expect(
      missingApprovalTerm({ key: "accept_close_difference", subject: { shiftId: SHIFT_1 } }),
    ).toBe("figure");
    expect(missingApprovalTerm(refund(ORDER_A, 25_000n))).toBeNull();
    expect(missingApprovalTerm({ key: "transfer_table" })).toBeNull();
  });
});

describe("judging an approval at use", () => {
  it("covers only the refund of the order it was given for, to the đồng", () => {
    expect(judgeApproval(refund(ORDER_A, 25_000n), refund(ORDER_A, 25_000n))).toBe("covers");
    expect(judgeApproval(refund(ORDER_A, 25_000n), refund(ORDER_B, 25_000n))).toBe(
      "another_subject",
    );
    expect(judgeApproval(refund(ORDER_A, 25_000n), refund(ORDER_A, 2_000_000n))).toBe(
      "another_action",
    );
    expect(judgeApproval(refund(ORDER_A, 25_000n), refund(ORDER_A, 24_000n))).toBe(
      "another_action",
    );
  });

  it("covers nothing when given without a subject, as approvals of older tills were", () => {
    const unbound: PermissionAction = { key: "refund", refundAmount: vnd(25_000n) };
    expect(judgeApproval(unbound, refund(ORDER_A, 25_000n))).toBe("another_subject");
    expect(judgeApproval(refund(ORDER_A, 25_000n), unbound)).toBe("another_subject");
  });

  it("takes a bound discount rate as a ceiling: lower passes, higher does not", () => {
    expect(judgeApproval(orderDiscount(ORDER_A, 2_000), orderDiscount(ORDER_A, 1_900))).toBe(
      "covers",
    );
    expect(judgeApproval(orderDiscount(ORDER_A, 2_000), orderDiscount(ORDER_A, 2_000))).toBe(
      "covers",
    );
    expect(judgeApproval(orderDiscount(ORDER_A, 2_000), orderDiscount(ORDER_A, 2_001))).toBe(
      "another_action",
    );
    expect(judgeApproval(orderDiscount(ORDER_A, 2_000), orderDiscount(ORDER_B, 1_000))).toBe(
      "another_subject",
    );
    expect(judgeApproval(lineDiscount(LINE_1, 2_000), lineDiscount(LINE_1, 1_500))).toBe("covers");
    expect(judgeApproval(lineDiscount(LINE_1, 2_000), lineDiscount(LINE_2, 1_500))).toBe(
      "another_subject",
    );
    expect(judgeApproval(lineDiscount(LINE_1, 2_000), orderDiscount(ORDER_A, 1_500))).toBe(
      "another_action",
    );
  });

  it("matches a void's units and a shift's cash total exactly, on its own line or shift", () => {
    const voided = (lineId: string, units: number): PermissionAction => ({
      key: "void_after_sent",
      voidedQuantity: quantity(units),
      subject: { orderId: ORDER_A, lineId },
    });
    expect(judgeApproval(voided(LINE_1, 1), voided(LINE_1, 1))).toBe("covers");
    expect(judgeApproval(voided(LINE_1, 1), voided(LINE_1, 3))).toBe("another_action");
    expect(judgeApproval(voided(LINE_1, 1), voided(LINE_2, 1))).toBe("another_subject");
    const cash = (shiftId: string, amount: bigint): PermissionAction => ({
      key: "cash_move",
      amount: vnd(amount),
      subject: { shiftId },
    });
    expect(judgeApproval(cash(SHIFT_1, 550_000n), cash(SHIFT_1, 550_000n))).toBe("covers");
    expect(judgeApproval(cash(SHIFT_1, 550_000n), cash(SHIFT_1, 500_000n))).toBe("another_action");
    expect(judgeApproval(cash(SHIFT_1, 550_000n), cash(SHIFT_2, 550_000n))).toBe("another_subject");
  });

  it("refuses another key whatever it names", () => {
    expect(
      judgeApproval(
        { key: "close_unpaid_table", subject: { orderId: ORDER_A } },
        refund(ORDER_A, 0n),
      ),
    ).toBe("another_action");
  });
});
