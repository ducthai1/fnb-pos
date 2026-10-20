import { describe, expect, it } from "vitest";
import { readProvisionEnvironment } from "./provision-environment";

const SECRET = "a-very-long-secret-value";
const env = {
  FNB_ADMIN_DATABASE_URL: `postgresql://postgres:${SECRET}@db.internal:5432/postgres`,
  FNB_OWNER_PASSWORD: `${SECRET}-owner`,
  FNB_APP_PASSWORD: `${SECRET}-app`,
};

describe("the provisioning environment", () => {
  it("names the default roles and database", () => {
    expect(readProvisionEnvironment(env)).toEqual({
      ok: true,
      target: {
        adminUrl: env.FNB_ADMIN_DATABASE_URL,
        database: "fnb",
        owner: { user: "fnb_owner", password: env.FNB_OWNER_PASSWORD },
        app: { user: "fnb_app", password: env.FNB_APP_PASSWORD },
      },
    });
  });

  it("refuses a short password and one role playing both parts", () => {
    const result = readProvisionEnvironment({ ...env, FNB_APP_PASSWORD: "short" });
    expect(result).toEqual({
      ok: false,
      problems: ["FNB_APP_PASSWORD must be at least 16 characters (openssl rand -base64 24)"],
    });
    const sameRole = readProvisionEnvironment({
      ...env,
      FNB_OWNER_ROLE: "fnb",
      FNB_APP_ROLE: "fnb",
    });
    expect(sameRole).toEqual({
      ok: false,
      problems: [
        "FNB_APP_ROLE must differ from FNB_OWNER_ROLE: the app role must not own the schema",
      ],
    });
  });

  it("names every missing variable", () => {
    const result = readProvisionEnvironment({ FNB_ADMIN_DATABASE_URL: "mysql://x" });
    expect(result.ok).toBe(false);
    const problems = result.ok ? [] : result.problems;
    expect(problems).toEqual([
      "FNB_ADMIN_DATABASE_URL is not a postgres:// connection string with a user and a host",
      "FNB_OWNER_PASSWORD is required",
      "FNB_APP_PASSWORD is required",
    ]);
  });
});
