import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readServerConfig } from "./server-config";

const PASSWORD = "s3cret-Pa55word";
const DATABASE_URL = `postgresql://fnb_app:${PASSWORD}@127.0.0.1:5432/fnb`;
const KEY = randomBytes(32).toString("base64");

const development = { FNB_ENV: "development", FNB_DATABASE_URL: DATABASE_URL };
const production = {
  FNB_ENV: "production",
  FNB_DATABASE_URL: DATABASE_URL,
  FNB_EINVOICE_PROVIDER: "none",
  FNB_ALLOWED_ORIGINS: "https://pos.example.vn,https://admin.example.vn",
};

function problemsOf(env: Record<string, string>): readonly string[] {
  const result = readServerConfig(env);
  if (result.ok) throw new Error("expected the configuration to be refused");
  return result.problems;
}

describe("server configuration", () => {
  it("starts development with the fake invoice provider and secure cookies", () => {
    const result = readServerConfig(development);
    expect(result).toEqual({
      ok: true,
      config: {
        environment: "development",
        host: "127.0.0.1",
        port: 3000,
        databaseUrl: DATABASE_URL,
        paymentSecretKey: null,
        einvoiceProvider: "fake",
        einvoiceWorkerIntervalMs: 5_000,
        secureCookies: true,
        allowedOrigins: null,
      },
    });
  });

  it("reads every setting a production deployment names", () => {
    const result = readServerConfig({ ...production, PORT: "8080", FNB_PAYMENT_SECRET_KEY: KEY });
    if (!result.ok) throw new Error(result.problems.join("\n"));
    expect(result.config.port).toBe(8080);
    expect(result.config.einvoiceProvider).toBe("none");
    expect(result.config.paymentSecretKey).toEqual(Buffer.from(KEY, "base64"));
    expect(result.config.allowedOrigins).toEqual([
      "https://pos.example.vn",
      "https://admin.example.vn",
    ]);
  });

  it("refuses to guess the environment", () => {
    expect(problemsOf({ FNB_DATABASE_URL: DATABASE_URL })).toEqual([
      "FNB_ENV must be development or production",
    ]);
  });

  it("names a missing database and an empty one alike", () => {
    expect(problemsOf({ FNB_ENV: "development" })).toEqual([
      "FNB_DATABASE_URL is required: the app role's postgres:// connection string",
    ]);
    expect(problemsOf({ FNB_ENV: "development", FNB_DATABASE_URL: "" })).toEqual([
      "FNB_DATABASE_URL is required: the app role's postgres:// connection string",
    ]);
  });

  it("never repeats a refused value, which may be a secret", () => {
    const problems = problemsOf({
      FNB_ENV: "development",
      FNB_DATABASE_URL: `mysql://fnb_app:${PASSWORD}@db/fnb`,
      FNB_PAYMENT_SECRET_KEY: `${PASSWORD}${PASSWORD}`,
      FNB_EINVOICE_PROVIDER: PASSWORD,
      FNB_COOKIE_SECURE: PASSWORD,
      PORT: PASSWORD,
      FNB_ALLOWED_ORIGINS: PASSWORD,
    });
    expect(problems).toHaveLength(6);
    for (const problem of problems) expect(problem).not.toContain(PASSWORD.slice(0, 6));
    expect(problems.map((problem) => problem.split(" ")[0]).sort()).toEqual([
      "FNB_ALLOWED_ORIGINS",
      "FNB_COOKIE_SECURE",
      "FNB_DATABASE_URL",
      "FNB_EINVOICE_PROVIDER",
      "FNB_PAYMENT_SECRET_KEY",
      "PORT",
    ]);
  });

  it("makes production name its invoice provider and origins", () => {
    expect(problemsOf({ FNB_ENV: "production", FNB_DATABASE_URL: DATABASE_URL })).toEqual([
      "FNB_EINVOICE_PROVIDER is required in production: name the provider or none",
      "FNB_ALLOWED_ORIGINS is required in production",
    ]);
  });

  it("refuses the fake provider and insecure cookies in production only", () => {
    expect(
      problemsOf({ ...production, FNB_EINVOICE_PROVIDER: "fake", FNB_COOKIE_SECURE: "false" }),
    ).toEqual([
      "FNB_EINVOICE_PROVIDER cannot be fake in production: its invoices exist nowhere",
      "FNB_COOKIE_SECURE cannot be false in production",
    ]);
    const result = readServerConfig({ ...development, FNB_COOKIE_SECURE: "false" });
    expect(result.ok && result.config.secureCookies).toBe(false);
  });

  it("refuses an origin with a path, which a browser never sends", () => {
    expect(problemsOf({ ...production, FNB_ALLOWED_ORIGINS: "https://pos.example.vn/" })).toEqual([
      "FNB_ALLOWED_ORIGINS must be a comma separated list of origins such as https://pos.example.vn",
    ]);
  });
});
