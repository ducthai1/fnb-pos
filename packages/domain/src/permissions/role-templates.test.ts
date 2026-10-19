import { describe, expect, it } from "vitest";
import { authorize, canApprove } from "./authorize";
import { PERMISSION_KEYS, type PermissionKey } from "./permission-catalog";
import { actionFor } from "./permissions-test-helpers";
import { ROLE_TEMPLATES } from "./role-templates";

const ADMINISTRATION: readonly PermissionKey[] = [
  "manage_staff",
  "manage_devices",
  "manage_settings",
];

describe("role templates", () => {
  it("give the owner every key with no limit", () => {
    const { grants } = ROLE_TEMPLATES.owner;
    for (const key of PERMISSION_KEYS) {
      expect({ key, result: authorize(actionFor(key, 10_000), grants) }).toEqual({
        key,
        result: "allowed",
      });
    }
  });

  it("keep administration with the owner alone", () => {
    for (const template of Object.values(ROLE_TEMPLATES)) {
      if (template.key === "owner") continue;
      for (const key of ADMINISTRATION) {
        expect({
          template: template.key,
          key,
          result: authorize(actionFor(key), template.grants),
        }).toEqual({ template: template.key, key, result: "denied" });
      }
    }
  });

  it("all pass grant validation and are keyed by their own key", () => {
    for (const [key, template] of Object.entries(ROLE_TEMPLATES)) {
      expect(template.key).toBe(key);
      expect(() => authorize(actionFor("refund"), template.grants)).not.toThrow();
    }
  });

  it("let a manager approve the refunds, voids and big discounts a cashier cannot", () => {
    const { manager } = ROLE_TEMPLATES;
    for (const action of [
      actionFor("refund"),
      actionFor("void_after_sent"),
      actionFor("line_discount", 5_000),
      actionFor("cash_move", 3_000_000),
      actionFor("accept_close_difference"),
    ]) {
      expect({ action, approves: canApprove(action, manager.grants) }).toEqual({
        action,
        approves: true,
      });
    }
    expect(authorize(actionFor("edit_menu"), manager.grants)).toBe("denied");
  });
});

describe("the cashier template", () => {
  const { grants } = ROLE_TEMPLATES.cashier;

  it("gives a line discount alone up to 10% and asks for approval above", () => {
    expect(authorize(actionFor("line_discount", 1_000), grants)).toBe("allowed");
    expect(authorize(actionFor("line_discount", 1_001), grants)).toBe("needs_approval");
  });

  it("needs approval for any order discount", () => {
    expect(authorize(actionFor("order_discount", 100), grants)).toBe("needs_approval");
  });

  it("pays small deliveries from the drawer alone, up to 500.000 đ", () => {
    expect(authorize(actionFor("cash_move", 500_000), grants)).toBe("allowed");
    expect(authorize(actionFor("cash_move", 500_001), grants)).toBe("needs_approval");
  });

  it.each([
    "refund",
    "void_after_sent",
    "price_override",
    "comp_item",
    "open_drawer",
    "accept_close_difference",
    "reopen_paid_order",
    "close_unpaid_table",
    "stock_adjust",
  ] as const)("needs a manager to approve %s", (key) => {
    expect(authorize(actionFor(key), grants)).toBe("needs_approval");
  });

  it.each(["view_reports", "edit_menu", ...ADMINISTRATION])("is denied %s outright", (key) => {
    expect(authorize(actionFor(key as PermissionKey), grants)).toBe("denied");
  });

  it("enters open prices and moves guests between tables alone", () => {
    expect(authorize(actionFor("open_price"), grants)).toBe("allowed");
    expect(authorize(actionFor("transfer_table"), grants)).toBe("allowed");
  });

  it("cannot approve another cashier's discount above its own cap", () => {
    expect(canApprove(actionFor("line_discount", 1_500), grants)).toBe(false);
    expect(canApprove(actionFor("line_discount", 800), grants)).toBe(true);
  });
});
