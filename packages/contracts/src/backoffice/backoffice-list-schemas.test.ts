import { describe, expect, it } from "vitest";
import { outcomeOf } from "../zod-issue-test-helpers";
import {
  branchListSchema,
  deviceListQuerySchema,
  deviceListSchema,
  staffListSchema,
} from "./backoffice-list-schemas";

const id = (n: number) => `0192f5a4-7c3e-7d10-8b2a-${String(n).padStart(12, "0")}`;

const device = {
  id: id(1),
  name: "Quầy Q1",
  branchId: id(2),
  pairedAt: "2026-10-20T03:00:00.000Z",
  revokedAt: null,
};
const member = {
  id: id(3),
  displayName: "Lan",
  roleId: id(4),
  active: true,
  branchIds: [id(2)],
  lockedOutUntil: null,
  failedSignIns: 0,
  version: 1,
};

describe("the backoffice lists", () => {
  it("take the shapes the API answers with", () => {
    const branch = { id: id(2), name: "Q1", brandId: id(5), brandName: "Phở Sáng" };
    expect(outcomeOf(branchListSchema, { branches: [branch] }).ok).toBe(true);
    expect(outcomeOf(deviceListSchema, { devices: [device] }).ok).toBe(true);
    const revoked = { ...device, revokedAt: "2026-10-20T04:00:00.000Z" };
    expect(outcomeOf(deviceListSchema, { devices: [revoked] }).ok).toBe(true);
    expect(outcomeOf(staffListSchema, { staff: [member] }).ok).toBe(true);
    const locked = { ...member, lockedOutUntil: "2026-10-20T05:00:00.000Z", failedSignIns: 5 };
    expect(outcomeOf(staffListSchema, { staff: [locked] }).ok).toBe(true);
    const unsaid = { ...member, failedSignIns: undefined };
    expect(outcomeOf(staffListSchema, { staff: [unsaid] }).ok).toBe(false);
    // A member's version is what a rename names, so a list without it is not one.
    const unversioned = { ...member, version: undefined };
    expect(outcomeOf(staffListSchema, { staff: [unversioned] }).ok).toBe(false);
  });

  it("refuse a field the contract does not name, such as a secret", () => {
    const leaking = { staff: [{ ...member, pinHash: "scrypt$…" }] };
    expect(outcomeOf(staffListSchema, leaking).ok).toBe(false);
    const credential = { devices: [{ ...device, tokenHash: "…" }] };
    expect(outcomeOf(deviceListSchema, credential).ok).toBe(false);
  });

  it("refuse a revoked moment that is not one", () => {
    const local = { devices: [{ ...device, revokedAt: "2026-10-20 11:00" }] };
    expect(outcomeOf(deviceListSchema, local).ok).toBe(false);
  });
});

describe("deviceListQuerySchema", () => {
  it("names one branch by its id, and nothing else", () => {
    expect(outcomeOf(deviceListQuerySchema, { branchId: id(2) }).ok).toBe(true);
    expect(outcomeOf(deviceListQuerySchema, {}).ok).toBe(false);
    expect(outcomeOf(deviceListQuerySchema, { branchId: id(2).toUpperCase() }).ok).toBe(false);
    expect(outcomeOf(deviceListQuerySchema, { branchId: id(2), all: "1" }).ok).toBe(false);
  });
});
