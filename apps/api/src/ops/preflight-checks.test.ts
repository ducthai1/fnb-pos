import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readServerConfig } from "../server/server-config";
import { type PreflightFacts, preflightChecks } from "./preflight-checks";

const PRODUCTION = {
  FNB_ENV: "production",
  FNB_DATABASE_URL: "postgresql://fnb_app:pw@127.0.0.1:5432/fnb",
  FNB_EINVOICE_PROVIDER: "none",
  FNB_ALLOWED_ORIGINS: "https://quan.example.vn",
  FNB_PAYMENT_SECRET_KEY: randomBytes(32).toString("base64"),
  FNB_TRUSTED_PROXIES: "127.0.0.1,::1",
};

const READY: PreflightFacts = {
  config: readServerConfig(PRODUCTION),
  role: { superuser: false, bypassesRls: false },
  migrations: { pending: [], unknown: [] },
  health: { status: 200 },
};

const without = (key: keyof typeof PRODUCTION): Record<string, string> =>
  Object.fromEntries(Object.entries(PRODUCTION).filter(([name]) => name !== key));

const statusOf = (facts: PreflightFacts, name: string) =>
  preflightChecks(facts).find((check) => check.name === name)?.status;

const failures = (facts: PreflightFacts) =>
  preflightChecks(facts)
    .filter((check) => check.status === "fail")
    .map((check) => check.name);

describe("preflight checks", () => {
  it("pass a production deployment that is ready to open", () => {
    expect(preflightChecks(READY).map((check) => check.status)).toEqual(Array(8).fill("pass"));
  });

  it("fail a configuration the API would refuse, naming the problems", () => {
    const checks = preflightChecks({
      ...READY,
      config: readServerConfig({ FNB_ENV: "production" }),
    });
    expect(checks[0]).toMatchObject({ status: "fail", name: "cấu hình API" });
    expect(checks[0]?.detail).toContain("FNB_DATABASE_URL is required");
  });

  it("fail a development configuration on a real server", () => {
    const config = readServerConfig({ ...PRODUCTION, FNB_ENV: "development" });
    expect(failures({ ...READY, config })).toEqual(["FNB_ENV"]);
  });

  it("fail an API behind the proxy that believes no proxy, and pass one listening openly", () => {
    const withoutProxies = without("FNB_TRUSTED_PROXIES");
    expect(failures({ ...READY, config: readServerConfig(withoutProxies) })).toEqual([
      "FNB_TRUSTED_PROXIES",
    ]);
    const open = readServerConfig({ ...withoutProxies, HOST: "0.0.0.0" });
    expect(statusOf({ ...READY, config: open }, "FNB_TRUSTED_PROXIES")).toBe("pass");
  });

  it("warn, without failing, when bank notices or the cleanup job are off", () => {
    const withoutKey = without("FNB_PAYMENT_SECRET_KEY");
    const config = readServerConfig({ ...withoutKey, FNB_CLEANUP_ENABLED: "false" });
    const checks = preflightChecks({ ...READY, config });
    expect(checks.filter((check) => check.status === "warn").map((check) => check.name)).toEqual([
      "FNB_PAYMENT_SECRET_KEY",
      "dọn mã ghép và phiên hết hạn",
    ]);
    expect(failures({ ...READY, config })).toEqual([]);
  });

  it("fail a database role that row level security does not bind", () => {
    for (const role of [
      { superuser: true, bypassesRls: false },
      { superuser: false, bypassesRls: true },
    ]) {
      expect(failures({ ...READY, role })).toEqual(["role database của API"]);
    }
    expect(failures({ ...READY, role: { error: "connection refused" } })).toEqual([
      "role database của API",
    ]);
  });

  it("fail pending migrations, a database newer than the code, and an unchecked ledger", () => {
    const pending = { pending: ["0029_x.sql"], unknown: [] };
    const newer = { pending: [], unknown: ["0030_y.sql"] };
    for (const migrations of [pending, newer, null]) {
      expect(failures({ ...READY, migrations })).toEqual(["migration"]);
    }
    const detail = preflightChecks({ ...READY, migrations: pending }).find(
      (check) => check.name === "migration",
    )?.detail;
    expect(detail).toContain("0029_x.sql");
  });

  it("fail a health check that is not 200 or cannot be made", () => {
    for (const health of [{ status: 503 }, { error: "ECONNREFUSED" }, null]) {
      expect(failures({ ...READY, health })).toEqual(["/health"]);
    }
  });
});
