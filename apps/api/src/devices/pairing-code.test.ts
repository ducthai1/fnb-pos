import { describe, expect, it } from "vitest";
import {
  PAIRING_CODE_ALPHABET,
  PAIRING_CODE_LENGTH,
  newPairingCode,
  normalizePairingCode,
} from "./pairing-code";

describe("PAIRING_CODE_ALPHABET", () => {
  it("leaves out every symbol that reads like another, and nothing else", () => {
    const left = [..."0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"].filter(
      (symbol) => !PAIRING_CODE_ALPHABET.includes(symbol),
    );
    expect(left).toEqual(["0", "1", "I", "L", "O", "U"]);
    expect(new Set(PAIRING_CODE_ALPHABET).size).toBe(PAIRING_CODE_ALPHABET.length);
  });
});

describe("newPairingCode", () => {
  it("draws 8 symbols of the alphabet, and normalizes to itself", () => {
    for (let i = 0; i < 200; i++) {
      const code = newPairingCode();
      expect(code).toHaveLength(PAIRING_CODE_LENGTH);
      expect(normalizePairingCode(code)).toBe(code);
    }
  });

  it("uses the whole alphabet, not a fixed part of it", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) for (const symbol of newPairingCode()) seen.add(symbol);
    expect(seen.size).toBe(PAIRING_CODE_ALPHABET.length);
  });
});

describe("normalizePairingCode", () => {
  it.each(["ABCD-EFGH", "abcd efgh", " AbCdEfGh ", "ABCD - EFGH"])(
    "reads %j as ABCDEFGH",
    (typed) => {
      expect(normalizePairingCode(typed)).toBe("ABCDEFGH");
    },
  );

  it.each(["ABCDEFG", "ABCDEFGHJ", "ABCD0FGH", "ABCDOFGH", "ABCD1FGH", "ABCDÉFGH", ""])(
    "rejects %j",
    (typed) => {
      expect(normalizePairingCode(typed)).toBeNull();
    },
  );
});
