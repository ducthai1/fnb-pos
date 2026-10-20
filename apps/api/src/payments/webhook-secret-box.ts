import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** Which endpoint a sealed secret belongs to; a copy moved to another row will not open. */
export interface SecretOwner {
  readonly tenantId: string;
  readonly branchId: string;
  readonly gateway: string;
}

export interface WebhookSecretBox {
  seal(secret: string, owner: SecretOwner): string;
  /** Throws when the text was not sealed by this key for this owner, or was altered. */
  open(sealed: string, owner: SecretOwner): string;
}

const VERSION = "v1";
const ownerText = (owner: SecretOwner) => `${owner.tenantId}/${owner.branchId}/${owner.gateway}`;

/**
 * Gateway secrets sealed with AES-256-GCM under the server's key, the owner bound in as
 * associated data. The database then holds nothing a thief could sign notices with, and a
 * sealed secret pasted onto another branch's row fails to open instead of verifying there.
 */
export function webhookSecretBox(key: Buffer): WebhookSecretBox {
  if (key.length !== 32) throw new Error("the payment secret key must be 32 bytes");
  return {
    seal(secret, owner) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from(ownerText(owner), "utf8"));
      const sealed = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
      const parts = [iv, cipher.getAuthTag(), sealed].map((part) => part.toString("base64url"));
      return [VERSION, ...parts].join(".");
    },
    open(sealed, owner) {
      const [version, iv, tag, body, ...rest] = sealed.split(".");
      if (version !== VERSION || iv === undefined || tag === undefined || body === undefined) {
        throw new Error("not a sealed secret");
      }
      if (rest.length > 0) throw new Error("not a sealed secret");
      // A tag shorter than 16 bytes would be easier to forge, so no other length is taken.
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"), {
        authTagLength: 16,
      });
      decipher.setAAD(Buffer.from(ownerText(owner), "utf8"));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      const opened = Buffer.concat([
        decipher.update(Buffer.from(body, "base64url")),
        decipher.final(),
      ]);
      return opened.toString("utf8");
    },
  };
}

export const PAYMENT_SECRET_KEY_ENV = "FNB_PAYMENT_SECRET_KEY";

/**
 * The key from the server's environment: 32 bytes in base64. None set means the server
 * takes no gateway notices; a key of the wrong size is a deployment error and throws.
 */
export function paymentSecretKeyFromEnv(env: Readonly<Record<string, string | undefined>>) {
  const text = env[PAYMENT_SECRET_KEY_ENV];
  if (text === undefined || text === "") return null;
  const key = Buffer.from(text, "base64");
  if (key.length !== 32) throw new Error(`${PAYMENT_SECRET_KEY_ENV} must be 32 bytes in base64`);
  return key;
}
