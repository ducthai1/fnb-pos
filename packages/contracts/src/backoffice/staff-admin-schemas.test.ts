import { describe, expect, it } from "vitest";
import { outcomeOf } from "../zod-issue-test-helpers";
import {
  roleHoldersSchema,
  staffPinBodySchema,
  staffUpdateBodySchema,
} from "./staff-admin-schemas";

const id = (n: number) => `0192f5a4-7c3e-7d10-8b2a-${String(n).padStart(12, "0")}`;

describe("staffUpdateBodySchema", () => {
  it("takes a new name, trimmed, a new role, or both", () => {
    expect(staffUpdateBodySchema.parse({ displayName: "  Lan  " })).toEqual({ displayName: "Lan" });
    expect(staffUpdateBodySchema.parse({ roleId: id(1) })).toEqual({ roleId: id(1) });
    expect(outcomeOf(staffUpdateBodySchema, { displayName: "Lan", roleId: id(1) }).ok).toBe(true);
  });

  it.each([
    ["with nothing to change", {}],
    ["with a blank name", { displayName: "   " }],
    ["with a name past 80 characters", { displayName: "n".repeat(81) }],
    ["with a role that is not an id", { roleId: "manager" }],
    ["that also sets their PIN", { displayName: "Lan", pin: "4826" }],
  ])("refuses a change %s", (_case, body) => {
    expect(outcomeOf(staffUpdateBodySchema, body).ok).toBe(false);
  });
});

describe("staffPinBodySchema", () => {
  it("takes any short text and leaves the PIN rules to the server", () => {
    expect(outcomeOf(staffPinBodySchema, { pin: "4826" }).ok).toBe(true);
    expect(outcomeOf(staffPinBodySchema, { pin: "12" }).ok).toBe(true);
    expect(outcomeOf(staffPinBodySchema, { pin: "1".repeat(17) }).ok).toBe(false);
    expect(outcomeOf(staffPinBodySchema, {}).ok).toBe(false);
  });
});

describe("roleHoldersSchema", () => {
  it("names the staff and members who hold the role, and no other field", () => {
    const holders = {
      code: "API_ROLE_IN_USE",
      staff: [{ id: id(1), displayName: "Lan", active: false }],
      members: [{ id: id(2), displayName: "Chủ quán", status: "active" }],
    };
    expect(roleHoldersSchema.parse(holders)).toEqual(holders);
    const leaking = { ...holders, staff: [{ ...holders.staff[0], pinHash: "x" }] };
    expect(outcomeOf(roleHoldersSchema, leaking).ok).toBe(false);
  });
});
