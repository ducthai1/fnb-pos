import { describe, expect, it } from "vitest";
import { BRANCH_SCOPE, settingsView } from "../../test-support/fake-settings";
import { httpSettingsApi } from "./settings-api";

interface Call {
  url: string;
  method: string;
  body: unknown;
}

/** A fetch answering every call with `status` and `body`, recording what was asked. */
function answering(status: number, body: unknown) {
  const calls: Call[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    calls.push({ url, method: String(init.method), body: init.body === undefined ? undefined : JSON.parse(String(init.body)) });
    return new Response(status === 204 ? null : JSON.stringify(body), { status });
  };
  return { calls, fetchImpl };
}

const view = settingsView(BRANCH_SCOPE, { tables: true });

describe("the settings calls", () => {
  it("read, write and clear a key at a scope, answering the view after", async () => {
    const server = answering(200, view);
    const api = httpSettingsApi("/api", server.fetchImpl);
    expect(await api.getSettings(BRANCH_SCOPE)).toEqual({ ok: true, value: view });
    expect((await api.putSetting(BRANCH_SCOPE, "tables", true)).ok).toBe(true);
    expect((await api.clearSetting(BRANCH_SCOPE, "tables")).ok).toBe(true);
    const base = `/api/settings/branch/${BRANCH_SCOPE.id}/tables`;
    expect(server.calls).toEqual([
      { url: `/api/settings?scope=branch&scopeId=${BRANCH_SCOPE.id}`, method: "GET", body: undefined },
      { url: base, method: "PUT", body: { value: true } },
      { url: base, method: "DELETE", body: undefined },
    ]);
  });

  it("sends a deliberate none as a JSON null value", async () => {
    const server = answering(200, view);
    await httpSettingsApi("/api", server.fetchImpl).putSetting(BRANCH_SCOPE, "payment_account", null);
    expect(server.calls[0]!.body).toEqual({ value: null });
  });

  it("treats a view outside the contract as a failed call", async () => {
    const server = answering(200, { ...view, secrets: {} });
    expect((await httpSettingsApi("/api", server.fetchImpl).getSettings(BRANCH_SCOPE)).ok).toBe(false);
  });

  it("puts a webhook secret under its branch and gateway, answered with no body", async () => {
    const server = answering(204, null);
    const api = httpSettingsApi("/api", server.fetchImpl);
    expect(await api.putWebhookSecret(BRANCH_SCOPE.id, "sepay", "s".repeat(20))).toEqual({ ok: true, value: true });
    expect(server.calls).toEqual([
      { url: `/api/payments/webhook-secrets/${BRANCH_SCOPE.id}/sepay`, method: "PUT", body: { secret: "s".repeat(20) } },
    ]);
  });
});
