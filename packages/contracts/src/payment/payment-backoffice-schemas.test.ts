import { describe, expect, it } from "vitest";
import { outcomeOf } from "../zod-issue-test-helpers";
import { matchPaymentBodySchema, webhookSecretBodySchema } from "./payment-backoffice-schemas";

const id = (n: number) => `0192f5a4-7c3e-7d10-8b2a-${String(n).padStart(12, "0")}`;

describe("webhookSecretBodySchema", () => {
  it("takes a secret of 16 to 256 printable characters", () => {
    expect(outcomeOf(webhookSecretBodySchema, { secret: "k".repeat(16) }).ok).toBe(true);
    expect(outcomeOf(webhookSecretBodySchema, { secret: "k".repeat(256) }).ok).toBe(true);
  });

  it.each([
    ["short enough to guess", "k".repeat(15)],
    ["too long for a header", "k".repeat(257)],
    ["with a space, which splits the header", "sepay key 0123456789"],
    ["with a line break", "sepay-key-012345\n6789"],
    ["with letters outside ASCII", "khóa-bí-mật-0123456789"],
  ])("refuses a secret %s", (_case, secret) => {
    expect(outcomeOf(webhookSecretBodySchema, { secret }).ok).toBe(false);
  });
});

describe("matchPaymentBodySchema", () => {
  it("names one transfer and one intent, and nothing else", () => {
    const body = { transactionId: id(1), intentId: id(2) };
    expect(matchPaymentBodySchema.parse(body)).toEqual(body);
    expect(outcomeOf(matchPaymentBodySchema, { ...body, amount: 1 }).ok).toBe(false);
    expect(outcomeOf(matchPaymentBodySchema, { transactionId: id(1) }).ok).toBe(false);
  });
});
