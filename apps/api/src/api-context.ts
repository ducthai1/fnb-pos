import type { UnlimitedPermissionKey } from "@fnb/domain";
import type { onRequestHookHandler } from "fastify";
import type pg from "pg";
import type { AuthPolicy } from "./auth/auth-policy";
import type { SessionCookieJar } from "./auth/session-cookie";
import type { Clock } from "./clock";
import type { ProductImageStore } from "./media/product-image-store";
import type { SecretVerifier } from "./security/secret-hash";

/** What every route module receives from buildApp. */
export interface ApiContext {
  pool: pg.Pool;
  clock: Clock;
  policy: AuthPolicy;
  /** Sets, clears and reads the backoffice session cookie. */
  sessionCookies: SessionCookieJar;
  /** Checks a password or PIN against its stored hash. */
  verifySecret: SecretVerifier;
  /** onRequest hook: sets request.auth from the backoffice session cookie, or answers 401. */
  requireSession: onRequestHookHandler;
  /** onRequest hook: sets request.device from `Authorization: Device <token>`, or answers 401. */
  requireDevice: onRequestHookHandler;
  /** onRequest hook after requireDevice: a till below the server's minimum build gets 426. */
  requireCurrentBuild: onRequestHookHandler;
  /** Product photos on disk; null when the server is started without a media directory. */
  productImages: ProductImageStore | null;
  /** onRequest hook after requireSession: the member's role allows `key`, or 403. */
  requirePermission: (key: UnlimitedPermissionKey) => onRequestHookHandler;
}
