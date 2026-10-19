import { randomInt } from "node:crypto";

/**
 * Digits and capitals that cannot be misread for one another when copied from a screen
 * to a till: no 0/O, 1/I/L, and no U (it turns harmless codes into words). 30 symbols, 8
 * of them: about 6.6 x 10^11 codes, against codes that live 10 minutes and work once.
 */
export const PAIRING_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
export const PAIRING_CODE_LENGTH = 8;

export function newPairingCode(): string {
  let code = "";
  for (let i = 0; i < PAIRING_CODE_LENGTH; i++) {
    code += PAIRING_CODE_ALPHABET[randomInt(PAIRING_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * The code as generated, from what a person typed: case, spaces and dashes do not
 * matter (the backoffice may show it as `ABCD-EFGH`). Null if it cannot be a code.
 */
export function normalizePairingCode(typed: string): string | null {
  const code = typed.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== PAIRING_CODE_LENGTH) return null;
  for (const symbol of code) if (!PAIRING_CODE_ALPHABET.includes(symbol)) return null;
  return code;
}
