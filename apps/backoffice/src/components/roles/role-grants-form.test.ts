import { describe, expect, it } from "vitest";
import type { Role } from "../../lib/api/roles-api";
import { vi } from "../../messages/vi";
import { roleGrantsBody, roleGrantsFormOf } from "./role-grants-form";

const SHIFT_LEAD: Role = {
  id: "0190a000-0000-7000-8000-0000000000c1",
  name: "Trưởng ca",
  permissionKeys: ["line_discount", "cash_move", "refund"],
  thresholds: { line_discount: { maxRate: 1250 }, cash_move: { maxAmount: "500000" } },
  isTemplate: true,
  archivedAt: null,
  version: 3,
};

describe("the role editor's grants", () => {
  it("shows stored limits as a person types them, and sends them back unchanged", () => {
    const form = roleGrantsFormOf(SHIFT_LEAD);
    expect(form.limits).toEqual({ line_discount: "12.5", cash_move: "500.000" });
    expect(roleGrantsBody(form)).toEqual({
      ok: true,
      body: {
        name: "Trưởng ca",
        // In catalog order, whatever order they were ticked in.
        permissionKeys: ["refund", "line_discount", "cash_move"],
        thresholds: { line_discount: { maxRate: 1250 }, cash_move: { maxAmount: "500000" } },
      },
    });
  });

  it("reads a limit typed with a decimal comma or grouped đồng", () => {
    const body = roleGrantsBody({
      name: "Thu ngân",
      keys: ["order_discount", "cash_move"],
      limits: { order_discount: "7,5", cash_move: "1.000.000" },
    });
    expect(body).toMatchObject({
      ok: true,
      body: { thresholds: { order_discount: { maxRate: 750 }, cash_move: { maxAmount: "1000000" } } },
    });
  });

  it("sends no limit for a blank box, which means no cap", () => {
    const body = roleGrantsBody({ name: "Quản lý", keys: ["line_discount"], limits: { line_discount: " " } });
    expect(body).toEqual({
      ok: true,
      body: { name: "Quản lý", permissionKeys: ["line_discount"], thresholds: {} },
    });
  });

  it("drops the limit of a key that was unticked, since the API refuses limits on keys not held", () => {
    const body = roleGrantsBody({ name: "Phục vụ", keys: [], limits: { cash_move: "200000" } });
    expect(body).toEqual({ ok: true, body: { name: "Phục vụ", permissionKeys: [], thresholds: {} } });
  });

  it.each(["101", "12.345", "-5", "mười", "1e2"])("refuses %j as a discount cap", (text) => {
    const body = roleGrantsBody({ name: "X", keys: ["line_discount"], limits: { line_discount: text } });
    expect(body).toEqual({ ok: false, errors: { line_discount: vi.roles.rateInvalid } });
  });

  it.each(["35.5", "-1", "1.000.00", "9007199254740993"])("refuses %j as a cash cap", (text) => {
    const body = roleGrantsBody({ name: "X", keys: ["cash_move"], limits: { cash_move: text } });
    expect(body).toEqual({ ok: false, errors: { cash_move: vi.common.amountInvalid } });
  });

  it("refuses a role without a name, or with one longer than the API stores", () => {
    expect(roleGrantsBody({ name: "  ", keys: [], limits: {} })).toEqual({
      ok: false,
      errors: { name: vi.common.nameMissing },
    });
    expect(roleGrantsBody({ name: "A".repeat(81), keys: [], limits: {} })).toMatchObject({ ok: false });
    expect(roleGrantsBody({ name: "A".repeat(80), keys: [], limits: {} })).toMatchObject({ ok: true });
  });
});
