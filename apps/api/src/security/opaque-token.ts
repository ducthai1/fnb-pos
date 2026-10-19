import { createHash, randomBytes } from "node:crypto";

/**
 * A bearer secret: 32 random bytes (256 bits), base64url so it fits a cookie or a header
 * unescaped. Only its SHA-256 is stored. A slow hash is unnecessary here, unlike for
 * passwords and PINs: guessing a 256-bit random value is hopeless however fast each guess.
 */
export function newOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Lowercase hex SHA-256, the form every token and code is stored and looked up by. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
