import { newId } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { claimLoginAttempt, createSession, recordLoginSuccess } from "../../auth/account-store";
import { auditLoginLock } from "../../auth/audit-login-lock";
import { AUTH_ERROR_CODES } from "../../auth/auth-error-codes";
import { type LoginIdentifier, loginIdentifier } from "../../auth/login-identifier";
import { sessionCookie } from "../../auth/session-cookie";
import { hashToken, newOpaqueToken } from "../../security/opaque-token";
import { hashSecret } from "../../security/secret-hash";
import { chooseMembership } from "./choose-membership";

interface LoginBody {
  email?: string;
  phone?: string;
  password: string;
  organizationId?: string;
}

const loginBody = {
  type: "object",
  additionalProperties: false,
  required: ["password"],
  oneOf: [{ required: ["email"] }, { required: ["phone"] }],
  properties: {
    email: { type: "string", maxLength: 254 },
    phone: { type: "string", maxLength: 32 },
    password: { type: "string", minLength: 1, maxLength: 256 },
    organizationId: { type: "string", format: "uuid" },
  },
} as const;

let dummyHash: Promise<string> | undefined;

/**
 * An unknown or locked account still costs one full hash check, so the response time
 * does not tell them apart from a wrong password.
 */
async function checkPassword(
  context: ApiContext,
  identifier: LoginIdentifier,
  password: string,
): Promise<string | null> {
  const { pool, verifySecret } = context;
  const now = context.clock.now();
  const attempt = await claimLoginAttempt(pool, identifier, now, context.policy.login);
  if (attempt.kind !== "allowed") {
    dummyHash ??= hashSecret("no account has this password");
    await verifySecret(password, await dummyHash);
    return null;
  }
  // The lock is audited while the password is being checked, so the attempt that locks
  // answers no slower than the same attempt against an account that does not exist.
  const { accountId, lockedUntil } = attempt;
  const [right] = await Promise.all([
    verifySecret(password, attempt.passwordHash),
    lockedUntil === null
      ? undefined
      : auditLoginLock(pool, { accountId, failedAttempts: attempt.claimedAttempts, lockedUntil }),
  ]);
  if (!right) return null;
  await recordLoginSuccess(pool, attempt, now);
  return accountId;
}

export function registerLoginRoute(app: FastifyInstance, context: ApiContext): void {
  app.post<{ Body: LoginBody }>(
    "/auth/login",
    { schema: { body: loginBody } },
    async (request, reply) => {
      const identifier = loginIdentifier(request.body);
      if (identifier === null) {
        return reply.code(400).send({ code: AUTH_ERROR_CODES.invalidRequest });
      }
      const accountId = await checkPassword(context, identifier, request.body.password);
      if (accountId === null) {
        return reply.code(401).send({ code: AUTH_ERROR_CODES.invalidCredentials });
      }
      const choice = await chooseMembership(context.pool, accountId, request.body.organizationId);
      if (choice.kind === "none") {
        return reply.code(403).send({ code: AUTH_ERROR_CODES.noActiveMembership });
      }
      if (choice.kind === "not-a-member") {
        return reply.code(403).send({ code: AUTH_ERROR_CODES.notAMember });
      }
      if (choice.kind === "ambiguous") {
        return reply.code(409).send({
          code: AUTH_ERROR_CODES.organizationRequired,
          organizations: choice.organizations,
        });
      }
      const token = newOpaqueToken();
      const now = context.clock.now();
      const ttl = context.policy.sessionTtlMillis;
      await createSession(
        context.pool,
        {
          id: newId(),
          tokenHash: hashToken(token),
          accountId,
          tenantId: choice.tenantId,
          expiresAt: new Date(now.getTime() + ttl),
        },
        now,
      );
      reply.header("set-cookie", sessionCookie(token, Math.floor(ttl / 1000)));
      return { accountId, organizationId: choice.tenantId, appUserId: choice.appUserId };
    },
  );
}
