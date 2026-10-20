import { describe, expect, it } from "vitest";
import { CREDENTIAL } from "../../test-support/fake-pos-server";
import { MILK_TEA, tid, tillBootstrap, tillBootstrapWire } from "../../test-support/till-fixtures";
import { httpBootstrapSource } from "../bootstrap/bootstrap-source";
import type { FetchLike } from "./api-result";
import { httpPosApi } from "./pos-api";

/** A fetch answering `status` with `body`, recording what it was asked. */
function answering(status: number, body: string) {
  const asked: { url: string; method: string | undefined; headers: unknown; body: unknown }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    asked.push({ url, method: init.method, headers: init.headers, body: init.body });
    return new Response(body, { status });
  };
  return { asked, fetchImpl };
}

const unreachable: FetchLike = async () => {
  throw new TypeError("Failed to fetch");
};

describe("the POS's calls outside the sync loop", () => {
  it("pairs with the code and name in the body and reads the credential from the answer", async () => {
    const server = answering(201, JSON.stringify({ ...CREDENTIAL, extra: 1 }));
    const result = await httpPosApi("/api/", server.fetchImpl).pairDevice({
      code: "ABCDEFGH",
      deviceName: "Quầy 1",
    });
    expect(result).toEqual({ ok: true, value: CREDENTIAL });
    expect(server.asked).toEqual([
      {
        url: "/api/devices/pair",
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "ABCDEFGH", deviceName: "Quầy 1" }),
      },
    ]);
  });

  it("opens a staff session as the paired till and reads its token", async () => {
    const answer = { staffSessionToken: "t", staffId: "s", expiresAt: "2026-10-20T15:00:00.000Z" };
    const server = answering(201, JSON.stringify(answer));
    const result = await httpPosApi("/api", server.fetchImpl).startStaffSession(CREDENTIAL, {
      staffId: "s",
      pin: "4826",
    });
    // A server that sends no session id: commands then go under whoever is signed in.
    expect(result).toEqual({
      ok: true,
      value: { staffId: "s", token: "t", sessionId: null, expiresAt: answer.expiresAt },
    });
    expect(server.asked[0]?.headers).toEqual({
      "content-type": "application/json",
      authorization: `Device ${CREDENTIAL.deviceToken}`,
    });
  });

  it("reads the session's id, which the till stamps on the commands recorded in it", async () => {
    const id = "0199f000-0000-7000-8000-00000000e001";
    const answer = { staffSessionToken: "t", staffSessionId: id, staffId: "s", expiresAt: "x" };
    const server = answering(201, JSON.stringify(answer));
    const result = await httpPosApi("/api", server.fetchImpl).startStaffSession(CREDENTIAL, {
      staffId: "s",
      pin: "4826",
    });
    expect(result).toMatchObject({ ok: true, value: { token: "t", sessionId: id } });
  });

  it("returns the server's error code with the status, never a credential", async () => {
    const server = answering(401, JSON.stringify({ code: "API_DEVICE_PAIRING_CODE_INVALID" }));
    const result = await httpPosApi("/api", server.fetchImpl).pairDevice({
      code: "X",
      deviceName: "Y",
    });
    expect(result).toMatchObject({
      ok: false,
      status: 401,
      code: "API_DEVICE_PAIRING_CODE_INVALID",
    });
  });

  it("refuses a 2xx answer that lacks a field it needs", async () => {
    const server = answering(201, JSON.stringify({ ...CREDENTIAL, deviceToken: undefined }));
    const result = await httpPosApi("/api", server.fetchImpl).pairDevice({
      code: "X",
      deviceName: "Y",
    });
    expect(result).toMatchObject({ ok: false, status: 201, code: null });
  });

  it("reports no answer at all as status null", async () => {
    const result = await httpPosApi("/api", unreachable).pairDevice({ code: "X", deviceName: "Y" });
    expect(result).toEqual({ ok: false, status: null, code: null, body: null });
  });
});

describe("loading the till's bootstrap", () => {
  const wire = tillBootstrapWire({ staff: [{ id: tid(1), displayName: "Lan", active: true }] });

  it("parses the whole answer by the contract, as the paired till", async () => {
    const server = answering(200, JSON.stringify(wire));
    const result = await httpBootstrapSource("/api", server.fetchImpl).load(CREDENTIAL);
    expect(result).toEqual({ ok: true, value: tillBootstrap({ staff: wire.staff }) });
    // Money left the parse as the domain's amounts, ready for pricing.
    expect(result.ok && result.value.menu.products[0]?.basePrice).toBe(35_000n);
    expect(server.asked[0]).toMatchObject({
      url: "/api/pos/bootstrap",
      method: "GET",
      headers: { authorization: `Device ${CREDENTIAL.deviceToken}` },
    });
  });

  it.each([
    ["no cursor", { ...wire, cursor: undefined }],
    ["a staff member without a name", { ...wire, staff: [{ id: tid(1), active: true }] }],
    [
      "a field the contract does not name",
      { ...wire, staff: [{ ...wire.staff[0], pinHash: "x" }] },
    ],
    [
      "a price that is not whole đồng",
      { ...wire, menu: { ...wire.menu, products: [{ ...MILK_TEA, basePrice: 35_000.5 }] } },
    ],
    ["no branch name", { ...wire, branch: { id: wire.branch.id } }],
  ])("refuses an answer with %s", async (_label, body) => {
    const server = answering(200, JSON.stringify(body));
    expect(await httpBootstrapSource("/api", server.fetchImpl).load(CREDENTIAL)).toMatchObject({
      ok: false,
      status: 200,
    });
  });
});
