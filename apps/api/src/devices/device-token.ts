import { newOpaqueToken } from "../security/opaque-token";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SECRET = /^[A-Za-z0-9_-]{43}$/;
const HEADER = /^Device ([^\s.]+)\.(\S+)$/;

/**
 * `<tenant id>.<secret>`. The tenant part only says where to look the secret up; the
 * credential is valid only if the secret's hash exists in that tenant.
 */
export function newDeviceToken(tenantId: string): string {
  return `${tenantId}.${newOpaqueToken()}`;
}

/** The token and its tenant from `Authorization: Device <token>`, or null. */
export function readDeviceToken(
  authorization: string | undefined,
): { token: string; tenantId: string } | null {
  const match = authorization === undefined ? null : HEADER.exec(authorization);
  const tenantId = match?.[1];
  const secret = match?.[2];
  if (tenantId === undefined || secret === undefined) return null;
  if (!UUID.test(tenantId) || !SECRET.test(secret)) return null;
  return { token: `${tenantId}.${secret}`, tenantId };
}
