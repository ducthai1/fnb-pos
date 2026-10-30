import { describe, expect, it } from "vitest";
import { ORDER_VERSION_STALE } from "../table-order/redo-stale-draft";
import {
  askedForApproval,
  canRedo,
  dismissalNeedsWords,
  dismissalReasonsOf,
} from "./rejection-routes";

const refused = (type: string, code: string) => ({
  code,
  command: { type, payload: {} } as never,
});

describe("what a refusal leads to", () => {
  it("redoes only a draft another till changed first", () => {
    expect(canRedo(refused("order.save_draft", ORDER_VERSION_STALE))).toBe(true);
    expect(canRedo(refused("order.save_draft", "DOMAIN_ORDER_TOTAL_MISMATCH"))).toBe(false);
    expect(canRedo(refused("order.cancel", ORDER_VERSION_STALE))).toBe(false);
  });

  it("knows a refusal that is about a manager's approval", () => {
    expect(askedForApproval(refused("order.cancel", "SYNC_APPROVAL_REQUIRED"))).toBe(true);
    expect(askedForApproval(refused("order.cancel", "SYNC_APPROVAL_EXPIRED"))).toBe(true);
    expect(askedForApproval(refused("order.cancel", "SYNC_ORDER_NOT_FOUND"))).toBe(false);
  });

  it.each(["order.pay", "order.refund", "order.mark_sent_to_kitchen", "shift.cash_move"])(
    "needs the staff member's words to set aside %s, with no reason 'no longer needed'",
    (type) => {
      const entry = refused(type, "SYNC_NO_OPEN_SHIFT");
      expect(dismissalNeedsWords(entry)).toBe(true);
      expect(dismissalReasonsOf(entry)).not.toContain("no_longer_needed");
    },
  );

  it("sets a plain draft refusal aside with any reason", () => {
    const entry = refused("order.save_draft", "DOMAIN_ORDER_TOTAL_MISMATCH");
    expect(dismissalNeedsWords(entry)).toBe(false);
    expect(dismissalReasonsOf(entry)).toEqual(["handled_by_hand", "no_longer_needed", "other"]);
  });
});
