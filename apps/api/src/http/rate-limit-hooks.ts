import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { loginIdentifier } from "../auth/login-identifier";
import type { Clock } from "../clock";
import { FixedWindowRateLimiter, type RateLimit } from "../security/rate-limiter";
import { HTTP_ERROR_CODES } from "./allowed-origins-hook";
import { addressCountedAs, clientAddress, trustedProxies } from "./client-address";

/** Requests allowed per window, per client address and per account or till. */
export interface RateLimitSettings {
  readonly windowMillis: number;
  readonly loginPerAddress: number;
  readonly loginPerAccount: number;
  readonly pairingPerAddress: number;
  readonly tillPerAddress: number;
  readonly tillPerDevice: number;
  /** Proxies whose X-Forwarded-For names the client; empty when clients connect directly. */
  readonly trustedProxies: readonly string[];
}

interface LimitedRoute {
  readonly perAddress: number;
  /** Who the request speaks for, once the body is parsed and the till authenticated. */
  readonly subject?: {
    readonly limit: number;
    readonly of: (request: FastifyRequest) => string | null;
  };
}

const accountOf = (request: FastifyRequest): string | null => {
  const identifier = loginIdentifier((request.body ?? {}) as { email?: string; phone?: string });
  return identifier === null ? null : (identifier.email ?? identifier.phone);
};

const deviceOf = (request: FastifyRequest): string | null => request.device?.deviceId ?? null;

/**
 * The routes a guess or a flood is worth sending to: sign-in (each attempt costs a password
 * hash, even against a locked account), pairing (codes are short), and the till's PIN and
 * approval routes (a PIN has 10,000 values). Bank and gateway webhooks are deliberately not
 * here: a burst of payment notices must never be refused.
 */
function limitedRoutes(settings: RateLimitSettings): ReadonlyMap<string, LimitedRoute> {
  const till: LimitedRoute = {
    perAddress: settings.tillPerAddress,
    subject: { limit: settings.tillPerDevice, of: deviceOf },
  };
  return new Map<string, LimitedRoute>([
    [
      "POST /auth/login",
      {
        perAddress: settings.loginPerAddress,
        subject: { limit: settings.loginPerAccount, of: accountOf },
      },
    ],
    ["POST /devices/pair", { perAddress: settings.pairingPerAddress }],
    ["POST /pos/staff-sessions", till],
    ["POST /pos/approvals", till],
  ]);
}

/**
 * Counts requests to the limited routes and answers 429 API_RATE_LIMITED, with
 * Retry-After in seconds, past a limit. The client address is counted before anything
 * else runs (no body parsing, no database); the account or till once the request says
 * who it is for. Counters live in this process only (see FixedWindowRateLimiter).
 */
export function installRateLimits(
  app: FastifyInstance,
  settings: RateLimitSettings,
  clock: Clock,
): void {
  const routes = limitedRoutes(settings);
  const limiter = new FixedWindowRateLimiter(clock);
  const proxies =
    settings.trustedProxies.length > 0 ? trustedProxies(settings.trustedProxies) : null;
  const rule = (limit: number): RateLimit => ({ limit, windowMillis: settings.windowMillis });
  const routeOf = (request: FastifyRequest) =>
    routes.get(`${request.method} ${request.routeOptions.url ?? ""}`);

  const refuse = (reply: FastifyReply, key: string, limit: number) => {
    const decision = limiter.take(key, rule(limit));
    if (decision.allowed) return null;
    return reply
      .code(429)
      .header("retry-after", String(decision.retryAfterSeconds))
      .send({ code: HTTP_ERROR_CODES.rateLimited });
  };

  app.addHook("onRequest", async (request, reply) => {
    const route = routeOf(request);
    if (route === undefined) return;
    const address = addressCountedAs(
      clientAddress(request.ip, request.headers["x-forwarded-for"], proxies),
    );
    return (
      refuse(reply, `${request.routeOptions.url}|address|${address}`, route.perAddress) ?? undefined
    );
  });

  app.addHook("preHandler", async (request, reply) => {
    const subject = routeOf(request)?.subject;
    const who = subject?.of(request) ?? null;
    if (subject === undefined || who === null) return;
    return refuse(reply, `${request.routeOptions.url}|subject|${who}`, subject.limit) ?? undefined;
  });
}
