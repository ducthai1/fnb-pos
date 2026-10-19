import type pg from "pg";
import { newId } from "../ids/new-id";
import { CURRENT_TENANT_SQL } from "../tenancy/current-tenant-sql";
import { toJsonPayload } from "./to-json-payload";

export type AuditActor =
  | { kind: "app_user" | "staff" | "device"; id: string }
  /** Scheduled work, such as closing a business day, has no one to name. */
  | { kind: "system" };

export interface AuditEntry {
  id?: string;
  actor: AuditActor;
  /** What happened, e.g. "config.changed" or "drawer.opened". */
  action: string;
  entityKind: string;
  entityId: string;
  payload?: Readonly<Record<string, unknown>>;
}

/**
 * Appends one entry to the audit trail of the tenant of the current withTenant
 * transaction, so the entry exists exactly when the change it describes was committed.
 */
export async function appendAudit(client: pg.ClientBase, entry: AuditEntry): Promise<string> {
  const id = entry.id ?? newId();
  const actorId = entry.actor.kind === "system" ? null : entry.actor.id;
  await client.query(
    `INSERT INTO audit_log (id, tenant_id, actor_kind, actor_id, action, entity_kind,
       entity_id, payload)
     VALUES ($1, ${CURRENT_TENANT_SQL}, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      id,
      entry.actor.kind,
      actorId,
      entry.action,
      entry.entityKind,
      entry.entityId,
      toJsonPayload(entry.payload ?? {}),
    ],
  );
  return id;
}
