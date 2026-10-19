import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export interface ScryptCost {
  log2N: number;
  r: number;
  p: number;
}

/**
 * 2^15 x 8 x 1 needs 32 MiB and about 65 ms per hash on the development machine. OWASP's
 * floor is 2^17 (128 MiB); a small shop server handling a burst of logins cannot spare
 * that per request. The cost is stored inside every hash, so it can be raised later
 * without invalidating existing hashes.
 */
export const DEFAULT_SCRYPT_COST: ScryptCost = { log2N: 15, r: 8, p: 1 };

const KEY_BYTES = 32;
const SALT_BYTES = 16;
const PREFIX = "scrypt";

function derive(secret: string, salt: Buffer, cost: ScryptCost): Promise<Buffer> {
  const N = 2 ** cost.log2N;
  // Passwords typed on different keyboards may encode the same Vietnamese letter
  // differently (precomposed or with combining marks); NFC makes them one password.
  const normalized = secret.normalize("NFC");
  return new Promise((resolve, reject) => {
    scrypt(
      normalized,
      salt,
      KEY_BYTES,
      { N, r: cost.r, p: cost.p, maxmem: 256 * N * cost.r },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

/** `scrypt$<log2N>$<r>$<p>$<salt>$<key>`, salt and key in base64url. */
export async function hashSecret(
  secret: string,
  cost: ScryptCost = DEFAULT_SCRYPT_COST,
): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(secret, salt, cost);
  const parts = [PREFIX, cost.log2N, cost.r, cost.p, salt.toString("base64url")];
  return [...parts, key.toString("base64url")].join("$");
}

/**
 * Whether `secret` produced `stored`. Compares in constant time. A stored value that is
 * not a hash this code wrote is corrupt data, not a wrong password, so it throws.
 */
export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  const [prefix, log2N, r, p, salt, key] = parts;
  const cost = { log2N: Number(log2N), r: Number(r), p: Number(p) };
  const sane =
    parts.length === 6 &&
    prefix === PREFIX &&
    Number.isInteger(cost.log2N) &&
    cost.log2N >= 10 &&
    cost.log2N <= 20 &&
    Number.isInteger(cost.r) &&
    cost.r >= 1 &&
    cost.r <= 32 &&
    Number.isInteger(cost.p) &&
    cost.p >= 1 &&
    cost.p <= 16;
  if (!sane || salt === undefined || key === undefined) {
    throw new Error("stored secret hash is malformed");
  }
  const expected = Buffer.from(key, "base64url");
  if (expected.length !== KEY_BYTES) throw new Error("stored secret hash is malformed");
  const actual = await derive(secret, Buffer.from(salt, "base64url"), cost);
  return timingSafeEqual(actual, expected);
}
