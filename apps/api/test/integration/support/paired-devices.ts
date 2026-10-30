import type { FastifyInstance } from "fastify";

export function issuePairingCode(app: FastifyInstance, cookie: string, branchId: string) {
  return app.inject({
    method: "POST",
    url: "/devices/pairing-codes",
    headers: { cookie },
    payload: { branchId },
  });
}

export function pair(app: FastifyInstance, code: string, deviceName = "Quầy 1") {
  return app.inject({ method: "POST", url: "/devices/pair", payload: { code, deviceName } });
}

/** Issues a code from the backoffice and pairs a till with it. */
export async function pairDevice(
  app: FastifyInstance,
  cookie: string,
  branchId: string,
  deviceName = "Quầy 1",
): Promise<{ deviceId: string; branchId: string; deviceToken: string }> {
  const issued = await issuePairingCode(app, cookie, branchId);
  if (issued.statusCode !== 201) throw new Error(`issuing answered ${issued.statusCode}`);
  const paired = await pair(app, issued.json().code, deviceName);
  if (paired.statusCode !== 201) {
    // A refusal here once showed up only in a whole-suite run and never alone; what the server
    // said and what it had issued (without the code) is what tells a code that expired or went
    // missing from a request that was refused for another reason.
    const issuedWithoutCode = { ...(issued.json() as Record<string, unknown>), code: undefined };
    throw new Error(
      `pairing answered ${paired.statusCode}: ${paired.body}; it had issued ` +
        `${JSON.stringify(issuedWithoutCode)}; the real time is ${new Date().toISOString()}`,
    );
  }
  return paired.json();
}

export async function asDevice(app: FastifyInstance, authorization: string | undefined) {
  const headers = authorization === undefined ? {} : { authorization };
  const response = await app.inject({ method: "GET", url: "/devices/me", headers });
  return { status: response.statusCode, body: response.json() };
}
