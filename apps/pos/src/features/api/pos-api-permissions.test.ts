import { describe, expect, it } from "vitest";
import { CREDENTIAL } from "../../test-support/credential";
import type { FetchLike } from "./api-result";
import { httpPosApi } from "./pos-api";

function answering(status: number, body: unknown) {
  const asked: { url: string; init: RequestInit }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    asked.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  };
  return { asked, fetchImpl };
}

const staffHeaders = {
  authorization: `Device ${CREDENTIAL.deviceToken}`,
  "x-staff-session": "staff-token",
};

describe("the POS's calls about what staff may do", () => {
  it("reads the signed-in staff member's grants with their session", async () => {
    const server = answering(200, {
      staffId: "s",
      grants: { permissionKeys: ["refund"], thresholds: {} },
    });
    const result = await httpPosApi("/api", server.fetchImpl).staffGrants(
      CREDENTIAL,
      "staff-token",
    );
    expect(result).toEqual({ ok: true, value: [{ key: "refund" }] });
    expect(server.asked[0]?.url).toBe("/api/pos/staff-sessions/current");
    expect(server.asked[0]?.init.headers).toEqual(staffHeaders);
  });

  it("asks for an approval as the cashier and reads its id", async () => {
    const server = answering(201, { approvalId: "0199f000-0000-7000-a000-000000000001" });
    const request = {
      action: { key: "cash_move", amount: "900000" },
      approverStaffId: "m",
      approverPin: "2468",
    };
    const result = await httpPosApi("/api", server.fetchImpl).requestApproval(
      CREDENTIAL,
      "staff-token",
      request,
    );
    expect(result).toEqual({ ok: true, value: "0199f000-0000-7000-a000-000000000001" });
    expect(server.asked[0]?.url).toBe("/api/pos/approvals");
    expect(server.asked[0]?.init.headers).toEqual({
      "content-type": "application/json",
      ...staffHeaders,
    });
    expect(server.asked[0]?.init.body).toBe(JSON.stringify(request));
  });

  it("gives back the refusal's code, never an id it did not get", async () => {
    const server = answering(403, { code: "API_APPROVAL_APPROVER_NOT_PERMITTED" });
    const result = await httpPosApi("/api", server.fetchImpl).requestApproval(
      CREDENTIAL,
      "staff-token",
      { action: { key: "refund" }, approverStaffId: "m", approverPin: "2468" },
    );
    expect(result).toMatchObject({
      ok: false,
      status: 403,
      code: "API_APPROVAL_APPROVER_NOT_PERMITTED",
    });
  });
});
