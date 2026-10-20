import { describe, expect, it } from "vitest";
import { httpAuthApi, loginBody } from "./auth-api";

/** A fetch that answers every call with `status` and `body`, recording what was sent. */
function answering(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(body === null ? null : JSON.stringify(body), { status });
  };
  return { calls, api: httpAuthApi("/api", fetchImpl) };
}

describe("the sign-in call", () => {
  it("sends an email as email and anything else as a phone number", () => {
    expect(loginBody({ identifier: " chu@quan.vn ", password: "p" })).toEqual({
      email: "chu@quan.vn",
      password: "p",
    });
    expect(loginBody({ identifier: "0912 345 678", password: "p" })).toEqual({
      phone: "0912 345 678",
      password: "p",
    });
  });

  it("reads the organizations of a 409 as a choice to make", async () => {
    const organizations = [{ id: "a", name: "Trà Sáng" }];
    const { api } = answering(409, { code: "API_AUTH_ORGANIZATION_REQUIRED", organizations });
    expect(await api.login({ identifier: "x@y.z", password: "p" })).toEqual({
      kind: "choose-organization",
      organizations,
    });
  });

  it("treats a 409 without a readable list as a failure, not as an empty choice", async () => {
    const { api } = answering(409, { code: "API_AUTH_ORGANIZATION_REQUIRED", organizations: [{}] });
    const outcome = await api.login({ identifier: "x@y.z", password: "p" });
    expect(outcome.kind).toBe("failed");
  });

  it("sends the cookie of this origin and no token of its own", async () => {
    const { api, calls } = answering(200, {
      accountId: "a",
      organizationId: "o",
      organizationName: null,
      displayName: "Chủ quán",
    });
    expect(await api.me()).toMatchObject({ ok: true, value: { displayName: "Chủ quán" } });
    expect(calls[0]?.url).toBe("/api/auth/me");
    expect(calls[0]?.init.credentials).toBe("same-origin");
    expect(calls[0]?.init.headers).toEqual({});
  });

  it("refuses a session answer missing the organization", async () => {
    const { api } = answering(200, { accountId: "a", organizationName: null, displayName: null });
    expect(await api.me()).toMatchObject({ ok: false, status: 200 });
  });
});
