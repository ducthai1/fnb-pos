import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type pg from "pg";

type Answer = { status: number; body: unknown };

const answered = async (response: Awaited<ReturnType<FastifyInstance["inject"]>>) => ({
  status: response.statusCode,
  body: response.body === "" ? null : (response.json() as unknown),
});

/** The backoffice's staff tools, each as a member holding `cookie` calls it. */
export function staffTools(app: FastifyInstance, cookie: string) {
  const send = async (method: "POST" | "PUT" | "PATCH", url: string, payload?: object) =>
    answered(
      await app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) }),
    );
  const listed = async () => {
    const response = await app.inject({ method: "GET", url: "/staff", headers: { cookie } });
    // A member without manage_staff gets no list: the update then names a placeholder and is refused first.
    return (response.json().staff ?? []) as {
      id: string;
      displayName: string;
      roleId: string;
      active: boolean;
      lockedOutUntil: string | null;
      failedSignIns: number;
      version: number;
    }[];
  };
  return {
    /** Renames or re-roles as of `version`, or as of the row's current one when none is named. */
    update: async (staffId: string, body: object, version?: number): Promise<Answer> => {
      const read = version ?? (await listed()).find((member) => member.id === staffId)?.version ?? 1;
      return send("PATCH", `/staff/${staffId}?version=${read}`, body);
    },
    deactivate: (staffId: string) => send("POST", `/staff/${staffId}/deactivate`),
    reactivate: (staffId: string) => send("POST", `/staff/${staffId}/reactivate`),
    resetPin: (staffId: string, pin: string) => send("PUT", `/staff/${staffId}/pin`, { pin }),
    unlockPin: (staffId: string) => send("POST", `/staff/${staffId}/pin-unlock`),
    archiveRole: (roleId: string) => send("POST", `/roles/${roleId}/archive`),
    list: listed,
  };
}

/** Who a till of the branch lists on its PIN screen when it starts. */
export async function pinScreenOf(app: FastifyInstance, deviceToken: string) {
  const response = await app.inject({
    method: "GET",
    url: "/pos/bootstrap",
    headers: { authorization: `Device ${deviceToken}` },
  });
  return (response.json().staff as { id: string; displayName: string }[]).map((s) => s.id);
}

/** The tenant's audit entries of one staff member or role, oldest first. */
export const auditOf = (pool: pg.Pool, tenantId: string, entityId: string) =>
  withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query(
      "SELECT actor_kind, actor_id, action, payload FROM audit_log WHERE entity_id = $1 ORDER BY id",
      [entityId],
    );
    return rows as { actor_kind: string; actor_id: string; action: string; payload: unknown }[];
  });
