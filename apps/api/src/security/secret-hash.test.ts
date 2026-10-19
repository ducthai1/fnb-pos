import { describe, expect, it } from "vitest";
import { hashSecret, verifySecret } from "./secret-hash";

// The cheapest cost the verifier accepts, so this file stays fast; the format and the
// comparison are what is under test here, not the strength.
const CHEAP = { log2N: 10, r: 8, p: 1 };

describe("hashSecret / verifySecret", () => {
  it("accepts the secret that was hashed and rejects any other", async () => {
    const stored = await hashSecret("Phở sáng 2026", CHEAP);
    expect(await verifySecret("Phở sáng 2026", stored)).toBe(true);
    expect(await verifySecret("Phở sáng 2027", stored)).toBe(false);
    expect(await verifySecret("", stored)).toBe(false);
  });

  it("salts every hash, so equal secrets never share a stored value", async () => {
    const first = await hashSecret("1357", CHEAP);
    const second = await hashSecret("1357", CHEAP);
    expect(first).not.toBe(second);
    expect(await verifySecret("1357", second)).toBe(true);
  });

  it("stores the cost and salt with the hash, in the documented format", async () => {
    const stored = await hashSecret("x", CHEAP);
    expect(stored).toMatch(/^scrypt\$10\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
  });

  it("treats the composed and decomposed spelling of a Vietnamese word as one secret", async () => {
    const composed = "Phở";
    const decomposed = composed.normalize("NFD");
    expect(decomposed).not.toBe(composed);
    expect(await verifySecret(decomposed, await hashSecret(composed, CHEAP))).toBe(true);
  });

  it("rejects a hash whose key was changed", async () => {
    const stored = await hashSecret("2468", CHEAP);
    const key = stored.slice(stored.lastIndexOf("$") + 1);
    const flipped = `${key[0] === "A" ? "B" : "A"}${key.slice(1)}`;
    expect(await verifySecret("2468", stored.replace(key, flipped))).toBe(false);
  });

  it.each([
    ["another algorithm", "bcrypt$10$8$1$c2FsdA$a2V5"],
    ["a missing part", "scrypt$10$8$1$c2FsdA"],
    [
      "a cost out of range",
      "scrypt$40$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    ],
    ["a short key", "scrypt$10$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAA"],
  ])(
    "throws on a stored value with %s instead of calling it a wrong secret",
    async (_case, stored) => {
      await expect(verifySecret("x", stored)).rejects.toThrow("malformed");
    },
  );
});
