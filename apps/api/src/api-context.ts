import type { onRequestHookHandler } from "fastify";
import type pg from "pg";
import type { AuthPolicy } from "./auth/auth-policy";
import type { Clock } from "./clock";

/** What every route module receives from buildApp. */
export interface ApiContext {
  pool: pg.Pool;
  clock: Clock;
  policy: AuthPolicy;
  /** onRequest hook: sets request.auth from the backoffice session cookie, or answers 401. */
  requireSession: onRequestHookHandler;
  /** onRequest hook: sets request.device from `Authorization: Device <token>`, or answers 401. */
  requireDevice: onRequestHookHandler;
}
