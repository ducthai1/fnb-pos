import { describe, expect, it } from "vitest";
import { httpBranchApi } from "./branch-api";
import { httpDevicesApi } from "./devices-api";
import { httpStaffApi } from "./staff-api";

const id = (n: number) => `0190a000-0000-7000-8000-${String(n).padStart(12, "0")}`;

/** A fetch that answers every call with 200 and `body`, recording the urls asked for. */
function answering(body: unknown) {
  const urls: string[] = [];
  const fetchImpl = async (url: string) => {
    urls.push(url);
    return new Response(JSON.stringify(body), { status: 200 });
  };
  return { urls, fetchImpl };
}

const device = { id: id(1), name: "Quầy 1", branchId: id(2), pairedAt: "2026-10-20T03:00:00.000Z", revokedAt: null };
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

describe("the list calls", () => {
  it("read the lists the API answers with", async () => {
    const branch = { id: id(2), name: "Q1", brandId: id(5), brandName: "Trà Sáng" };
    const branches = answering({ branches: [branch] });
    expect(await httpBranchApi("/api", branches.fetchImpl).listBranches()).toEqual({ ok: true, value: [branch] });
    const devices = answering({ devices: [device] });
    expect(await httpDevicesApi("/api", devices.fetchImpl).listDevices(id(2))).toEqual({ ok: true, value: [device] });
    expect(devices.urls).toEqual([`/api/devices?branchId=${id(2)}`]);
    const staff = answering({ staff: [member] });
    expect(await httpStaffApi("/api", staff.fetchImpl).listStaff()).toEqual({ ok: true, value: [member] });
  });

  it("treat an answer outside the contract as a failed call, a leaked secret included", async () => {
    const leaking = answering({ staff: [{ ...member, pinHash: "scrypt$…" }] });
    expect((await httpStaffApi("/api", leaking.fetchImpl).listStaff()).ok).toBe(false);
    const holed = answering({ devices: [{ ...device, revokedAt: undefined }] });
    expect((await httpDevicesApi("/api", holed.fetchImpl).listDevices(id(2))).ok).toBe(false);
    const bare = answering([{ id: id(2), name: "Q1" }]);
    expect((await httpBranchApi("/api", bare.fetchImpl).listBranches()).ok).toBe(false);
  });
});
