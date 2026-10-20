import { newId } from "@fnb/db";
import type pg from "pg";
import type { WebhookSecretBox } from "./webhook-secret-box";

export interface WebhookEndpointToSave {
  readonly tenantId: string;
  readonly branchId: string;
  readonly gateway: string;
  readonly secret: string;
  readonly savedBy: string;
}

/** Sets (or replaces) the secret a branch's gateway signs with; only its sealed form is kept. */
export async function saveWebhookSecret(
  client: pg.ClientBase,
  box: WebhookSecretBox,
  endpoint: WebhookEndpointToSave,
): Promise<void> {
  const sealed = box.seal(endpoint.secret, endpoint);
  await client.query(
    "INSERT INTO payment_webhook_endpoint (id, tenant_id, branch_id, gateway, secret_ciphertext, " +
      "created_by) VALUES ($1, $2, $3, $4, $5, $6) " +
      "ON CONFLICT ON CONSTRAINT payment_webhook_endpoint_once_per_branch_gateway DO UPDATE SET " +
      "secret_ciphertext = EXCLUDED.secret_ciphertext, updated_at = now(), " +
      "version = payment_webhook_endpoint.version + 1",
    [newId(), endpoint.tenantId, endpoint.branchId, endpoint.gateway, sealed, endpoint.savedBy],
  );
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
  const { rows } = await client.query<{ branch_id: string; secret_ciphertext: string }>(
    "SELECT branch_id, secret_ciphertext FROM payment_webhook_endpoint WHERE gateway = $1 " +
      "ORDER BY branch_id",
    [gateway],
  );
  for (const row of rows) {
    const secret = box.open(row.secret_ciphertext, { tenantId, branchId: row.branch_id, gateway });
    if (proves(secret)) return row.branch_id;
  }
  return null;
}
