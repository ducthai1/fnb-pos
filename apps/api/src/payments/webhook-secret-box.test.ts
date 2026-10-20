import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { paymentSecretKeyFromEnv, webhookSecretBox } from "./webhook-secret-box";

const KEY = Buffer.alloc(32, 7);
const OWNER = { tenantId: "t-1", branchId: "b-1", gateway: "sepay" };
const SECRET = "sepay-api-key-0123456789";

describe("webhookSecretBox", () => {
  it("opens what it sealed, for the endpoint it was sealed for", () => {
    const box = webhookSecretBox(KEY);
    expect(box.open(box.seal(SECRET, OWNER), OWNER)).toBe(SECRET);
  });

  it("keeps nothing of the secret readable, and never seals it the same way twice", () => {
    const box = webhookSecretBox(KEY);
    const first = box.seal(SECRET, OWNER);
    const second = box.seal(SECRET, OWNER);
    expect(first).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(first).not.toContain(SECRET);
    expect(Buffer.from(first.split(".")[3] ?? "", "base64url").toString()).not.toContain("sepay");
    expect(first).not.toBe(second);
  });

  it.each([
    ["another branch", { ...OWNER, branchId: "b-2" }],
    ["another shop", { ...OWNER, tenantId: "t-2" }],
    ["another gateway", { ...OWNER, gateway: "payos" }],
  ])("refuses to open a secret moved to %s", (_case, owner) => {
    const box = webhookSecretBox(KEY);
    expect(() => box.open(box.seal(SECRET, OWNER), owner)).toThrow();
  });

  it("refuses a sealed secret that was altered, or sealed under another key", () => {
    const box = webhookSecretBox(KEY);
    const [version, iv, tag, body] = box.seal(SECRET, OWNER).split(".");
    const flipped = Buffer.from(body ?? "", "base64url");
    flipped[0] = (flipped[0] ?? 0) ^ 1;
    expect(() =>
      box.open([version, iv, tag, flipped.toString("base64url")].join("."), OWNER),
    ).toThrow();
    const truncatedTag = Buffer.from(tag ?? "", "base64url")
      .subarray(0, 4)
      .toString("base64url");
    expect(() => box.open([version, iv, truncatedTag, body].join("."), OWNER)).toThrow();
    const other = webhookSecretBox(randomBytes(32));
    expect(() => other.open(box.seal(SECRET, OWNER), OWNER)).toThrow();
    expect(() => box.open("plain-text-secret", OWNER)).toThrow();
  });

  it("takes a 32-byte key only", () => {
    expect(() => webhookSecretBox(Buffer.alloc(16))).toThrow("32 bytes");
  });
});

describe("paymentSecretKeyFromEnv", () => {
  it("reads 32 bytes of base64, and nothing when unset", () => {
    const key = randomBytes(32);
    expect(paymentSecretKeyFromEnv({ FNB_PAYMENT_SECRET_KEY: key.toString("base64") })).toEqual(
      key,
    );
    expect(paymentSecretKeyFromEnv({})).toBeNull();
    expect(paymentSecretKeyFromEnv({ FNB_PAYMENT_SECRET_KEY: "" })).toBeNull();
  });

  it("refuses a key of the wrong size rather than running with a weak one", () => {
    const short = randomBytes(16).toString("base64");
    expect(() => paymentSecretKeyFromEnv({ FNB_PAYMENT_SECRET_KEY: short })).toThrow("32 bytes");
  });
});
