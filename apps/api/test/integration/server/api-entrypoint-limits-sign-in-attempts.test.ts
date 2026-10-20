import { testConnectionString } from "@fnb/db/test-support";
import { afterEach, expect, inject, it } from "vitest";
import { uniqueEmail } from "../support/backoffice-accounts";
import { type ApiProcess, listeningUrl, spawnApi } from "../support/api-process";

const info = inject("testPostgres");
const spawned: ApiProcess[] = [];

afterEach(() => {
  for (const api of spawned.splice(0)) {
    if (api.child.exitCode === null && api.child.signalCode === null) api.child.kill("SIGKILL");
  }
});

// The limits are installed by the process, not by buildApp, so only the real entrypoint
// shows that a deployment is protected.
it("answers 429 with Retry-After once an account passes the configured limit", async () => {
  const api = spawnApi({
    FNB_ENV: "development",
    FNB_DATABASE_URL: testConnectionString(info, "app"),
    PORT: "0",
    FNB_RATE_LIMIT_LOGIN_PER_ACCOUNT: "2",
    FNB_RATE_LIMIT_WINDOW_SECONDS: "600",
  });
  spawned.push(api);
  const url = await listeningUrl(api);
  const email = uniqueEmail("entrypoint-limit");
  const attempt = () =>
    fetch(`${url}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "not the password" }),
    });
  try {
    expect([(await attempt()).status, (await attempt()).status]).toEqual([401, 401]);
    const refused = await attempt();
    expect(refused.status).toBe(429);
    expect(await refused.json()).toEqual({ code: "API_RATE_LIMITED" });
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(590);
    expect((await attempt()).status).toBe(429);
  } finally {
    api.child.kill("SIGTERM");
  }
  expect(await api.exited).toBe(0);
});
