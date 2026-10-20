import { describe, expect, it } from "vitest";
import { httpRolesApi } from "./roles-api";
import { httpStaffApi } from "./staff-api";

const STAFF = "0190a000-0000-7000-8000-0000000000a1";
const ROLE = "0190a000-0000-7000-8000-0000000000c1";

/** A fetch answering every call with `status` and `body`, recording what was asked. */
function answering(status: number, body: unknown = null) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    calls.push({ url, method: String(init.method), body: init.body === undefined ? undefined : JSON.parse(String(init.body)) });
    return new Response(body === null ? null : JSON.stringify(body), { status });
  };
  return { calls, fetchImpl };
}

describe("the staff tool calls", () => {
  it("send each tool to its route and read a 204 as done", async () => {
    const done = answering(204);
    const api = httpStaffApi("/api", done.fetchImpl);
    expect(await api.updateStaff(STAFF, { displayName: "Mai" })).toEqual({ ok: true, value: true });
    expect(await api.deactivateStaff(STAFF)).toEqual({ ok: true, value: true });
    expect(await api.reactivateStaff(STAFF)).toEqual({ ok: true, value: true });
    expect(await api.resetStaffPin(STAFF, "7391")).toEqual({ ok: true, value: true });
    expect(await api.unlockStaffPin(STAFF)).toEqual({ ok: true, value: true });
    expect(done.calls).toEqual([
      { url: `/api/staff/${STAFF}`, method: "PATCH", body: { displayName: "Mai" } },
      { url: `/api/staff/${STAFF}/deactivate`, method: "POST", body: undefined },
      { url: `/api/staff/${STAFF}/reactivate`, method: "POST", body: undefined },
      { url: `/api/staff/${STAFF}/pin`, method: "PUT", body: { pin: "7391" } },
      { url: `/api/staff/${STAFF}/pin-unlock`, method: "POST", body: undefined },
    ]);
  });

  it("read a refusal as its code", async () => {
    const refusal = answering(409, { code: "API_STAFF_ALREADY_INACTIVE" });
    expect(await httpStaffApi("/api", refusal.fetchImpl).deactivateStaff(STAFF)).toMatchObject({
      ok: false,
      status: 409,
      code: "API_STAFF_ALREADY_INACTIVE",
    });
  });

  it("archive a role and read it back archived, or keep the holders of a refusal", async () => {
    const role = { id: ROLE, name: "Ca đêm", permissionKeys: [], thresholds: {}, isTemplate: false, archivedAt: "2026-10-20T04:00:00.000Z", version: 2 };
    const archived = answering(200, role);
    expect(await httpRolesApi("/api", archived.fetchImpl).archiveRole(ROLE)).toEqual({ ok: true, value: role });
    expect(archived.calls[0]).toMatchObject({ url: `/api/roles/${ROLE}/archive`, method: "POST" });
    const held = { code: "API_ROLE_IN_USE", staff: [], members: [] };
    expect(await httpRolesApi("/api", answering(409, held).fetchImpl).archiveRole(ROLE)).toMatchObject({ ok: false, body: held });
    const garbled = answering(200, { ...role, archivedAt: 5 });
    expect((await httpRolesApi("/api", garbled.fetchImpl).archiveRole(ROLE)).ok).toBe(false);
  });
});
