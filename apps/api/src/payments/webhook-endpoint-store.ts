import { appendAudit, newId } from "@fnb/db";
import type pg from "pg";
import type { WebhookSecretBox } from "./webhook-secret-box";

export interface WebhookEndpointToSave {
  readonly tenantId: string;
  readonly branchId: string;
  readonly gateway: string;
  readonly secret: string;
  readonly savedBy: string;
}

interface EndpointRow {
  id: string;
  branch_id: string;
  secret_ciphertext: string;
  version: number;
}

const UNREADABLE_SECRET = "payment.webhook_secret_unreadable";

/**
 * Sets (or replaces) the secret a branch's gateway signs with; only its sealed form is kept.
 * Answers false, saving nothing, when another branch of the shop already has that secret
 * for the gateway: the secret is what tells a notice's branch, so with two the money would
 * always be put down to one of them.
 */
export async function saveWebhookSecret(
  client: pg.ClientBase,
  box: WebhookSecretBox,
  endpoint: WebhookEndpointToSave,
): Promise<boolean> {
  // Serializes with another branch saving the same secret for the gateway at the same time.
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('fnb.webhook_secret.' || $1 || '.' || $2, 0))",
    [endpoint.tenantId, endpoint.gateway],
  );
  const opened = await openedSecrets(client, box, endpoint.tenantId, endpoint.gateway);
  if (opened.some((o) => o.branchId !== endpoint.branchId && o.secret === endpoint.secret)) {
    return false;
  }
  const sealed = box.seal(endpoint.secret, endpoint);
  await client.query(
    "INSERT INTO payment_webhook_endpoint (id, tenant_id, branch_id, gateway, secret_ciphertext, " +
      "created_by) VALUES ($1, $2, $3, $4, $5, $6) " +
      "ON CONFLICT ON CONSTRAINT payment_webhook_endpoint_once_per_branch_gateway DO UPDATE SET " +
      "secret_ciphertext = EXCLUDED.secret_ciphertext, updated_at = now(), " +
      "version = payment_webhook_endpoint.version + 1",
    [newId(), endpoint.tenantId, endpoint.branchId, endpoint.gateway, sealed, endpoint.savedBy],
  );
  return true;
}

/**
 * The branch whose secret proves a notice, trying each branch set up for the gateway. A
 * shop gives each branch's account its own secret, so the secret is what names the branch.
 * Null when none does: the notice is answered as a stranger's, whatever it claims.
 */
export async function branchProvenBy(
  client: pg.ClientBase,
  box: WebhookSecretBox,
  tenantId: string,
  gateway: string,
  proves: (secret: string) => boolean,
): Promise<string | null> {
  const opened = await openedSecrets(client, box, tenantId, gateway);
  return opened.find((endpoint) => proves(endpoint.secret))?.branchId ?? null;
}

/**
 * The secrets the shop's branches set for `gateway`, opened, in branch order. One that no
 * longer opens (the server's key changed, the row was altered) is passed over, so it stops
 * only its own branch's notices instead of every branch's, and goes to the audit trail
 * once per version of the row, for a manager to set it again.
 */
async function openedSecrets(
  client: pg.ClientBase,
  box: WebhookSecretBox,
  tenantId: string,
  gateway: string,
): Promise<{ branchId: string; secret: string }[]> {
  const { rows } = await client.query<EndpointRow>(
    "SELECT id, branch_id, secret_ciphertext, version FROM payment_webhook_endpoint " +
      "WHERE gateway = $1 ORDER BY branch_id",
    [gateway],
  );
  const opened: { branchId: string; secret: string }[] = [];
  for (const row of rows) {
    const owner = { tenantId, branchId: row.branch_id, gateway };
    let secret: string;
    try {
      secret = box.open(row.secret_ciphertext, owner);
    } catch {
      await reportUnreadable(client, row, gateway);
      continue;
    }
    opened.push({ branchId: row.branch_id, secret });
  }
  return opened;
}

/** Once per version: any notice can make the server try the row, a stranger's included. */
async function reportUnreadable(client: pg.ClientBase, row: EndpointRow, gateway: string) {
  const reported = await client.query(
    "SELECT 1 FROM audit_log WHERE entity_kind = 'payment_webhook_endpoint' AND entity_id = $1 " +
      "AND action = $2 AND payload->>'version' = $3 LIMIT 1",
    [row.id, UNREADABLE_SECRET, String(row.version)],
  );
  if ((reported.rowCount ?? 0) > 0) return;
  await appendAudit(client, {
    actor: { kind: "system" },
    action: UNREADABLE_SECRET,
    entityKind: "payment_webhook_endpoint",
    entityId: row.id,
    payload: { branchId: row.branch_id, gateway, version: row.version },
  });
}
