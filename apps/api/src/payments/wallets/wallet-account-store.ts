import { appendAudit, newId } from "@fnb/db";
import type pg from "pg";
import type { WebhookSecretBox } from "../webhook-secret-box";
import type { WalletCredentials } from "./wallet-gateway-adapter";

/**
 * A wallet's keys are sealed for an owner of their own, so a bank gateway's sealed secret
 * copied onto a wallet's row (or the other way round) does not open.
 */
const ownerOf = (tenantId: string, branchId: string, wallet: string) => ({
  tenantId,
  branchId,
  gateway: `wallet:${wallet}`,
});

const UNREADABLE = "payment.wallet_keys_unreadable";

export interface WalletAccountToSave {
  readonly tenantId: string;
  readonly branchId: string;
  readonly wallet: string;
  readonly enabled: boolean;
  /** New keys; absent keeps the saved ones (turning the wallet on or off alone). */
  readonly credentials?: WalletCredentials;
  readonly savedBy: string;
}

/**
 * Turns a branch's wallet on or off, sealing new keys when given. Answers false, saving
 * nothing, when no keys were given and none are saved: a wallet with no keys cannot open a
 * payment. Every save goes to the audit trail, without the keys.
 */
export async function saveWalletAccount(
  client: pg.ClientBase,
  box: WebhookSecretBox,
  account: WalletAccountToSave,
): Promise<boolean> {
  const { tenantId, branchId, wallet } = account;
  if (account.credentials === undefined) {
    const updated = await client.query(
      "UPDATE payment_webhook_endpoint SET enabled = $3, updated_at = now(), " +
        "version = version + 1 WHERE branch_id = $1 AND gateway = $2",
      [branchId, wallet, account.enabled],
    );
    if (updated.rowCount === 0) return false;
  } else {
    const sealed = box.seal(JSON.stringify(account.credentials), ownerOf(tenantId, branchId, wallet));
    await client.query(
      "INSERT INTO payment_webhook_endpoint (id, tenant_id, branch_id, gateway, secret_ciphertext, " +
        "enabled, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) " +
        "ON CONFLICT ON CONSTRAINT payment_webhook_endpoint_once_per_branch_gateway DO UPDATE SET " +
        "secret_ciphertext = EXCLUDED.secret_ciphertext, enabled = EXCLUDED.enabled, " +
        "updated_at = now(), version = payment_webhook_endpoint.version + 1",
      [newId(), tenantId, branchId, wallet, sealed, account.enabled, account.savedBy],
    );
  }
  await appendAudit(client, {
    actor: { kind: "app_user", id: account.savedBy },
    action: "payment.wallet_account_saved",
    entityKind: "branch",
    entityId: branchId,
    payload: { wallet, enabled: account.enabled, keysReplaced: account.credentials !== undefined },
  });
  return true;
}

/** Each wallet the branch has keys for, and whether it is on; keys are never read here. */
export async function readWalletAccounts(
  client: pg.ClientBase,
  branchId: string,
  wallets: readonly string[],
): Promise<Map<string, boolean>> {
  const { rows } = await client.query<{ gateway: string; enabled: boolean }>(
    "SELECT gateway, enabled FROM payment_webhook_endpoint WHERE branch_id = $1 " +
      "AND gateway = ANY ($2::text[])",
    [branchId, wallets],
  );
  return new Map(rows.map((row) => [row.gateway, row.enabled]));
}

interface AccountRow {
  id: string;
  branch_id: string;
  secret_ciphertext: string;
  enabled: boolean;
  version: number;
}

export interface OpenedWalletAccount {
  readonly branchId: string;
  readonly enabled: boolean;
  readonly credentials: WalletCredentials;
}

/**
 * The wallet's keys of `branchId` (or of every branch, in branch order, when null), opened.
 * Keys that no longer open (the server's key changed, the row was altered) are passed
 * over, and reported to the audit trail once per version of the row.
 */
export async function openWalletAccounts(
  client: pg.ClientBase,
  box: WebhookSecretBox,
  tenantId: string,
  wallet: string,
  branchId: string | null,
): Promise<OpenedWalletAccount[]> {
  const { rows } = await client.query<AccountRow>(
    "SELECT id, branch_id, secret_ciphertext, enabled, version FROM payment_webhook_endpoint " +
      "WHERE gateway = $1 AND ($2::uuid IS NULL OR branch_id = $2::uuid) ORDER BY branch_id",
    [wallet, branchId],
  );
  const opened: OpenedWalletAccount[] = [];
  for (const row of rows) {
    const credentials = openCredentials(box, row, ownerOf(tenantId, row.branch_id, wallet));
    if (credentials === null) {
      await reportUnreadable(client, row, wallet);
      continue;
    }
    opened.push({ branchId: row.branch_id, enabled: row.enabled, credentials });
  }
  return opened;
}

function openCredentials(
  box: WebhookSecretBox,
  row: AccountRow,
  owner: ReturnType<typeof ownerOf>,
): WalletCredentials | null {
  try {
    const parsed = JSON.parse(box.open(row.secret_ciphertext, owner)) as Partial<WalletCredentials>;
    const { appId, key1, key2 } = parsed;
    if (typeof appId !== "string" || typeof key1 !== "string" || typeof key2 !== "string") {
      return null;
    }
    return { appId, key1, key2 };
  } catch {
    return null;
  }
}

async function reportUnreadable(client: pg.ClientBase, row: AccountRow, wallet: string) {
  const reported = await client.query(
    "SELECT 1 FROM audit_log WHERE entity_kind = 'payment_webhook_endpoint' AND entity_id = $1 " +
      "AND action = $2 AND payload->>'version' = $3 LIMIT 1",
    [row.id, UNREADABLE, String(row.version)],
  );
  if ((reported.rowCount ?? 0) > 0) return;
  await appendAudit(client, {
    actor: { kind: "system" },
    action: UNREADABLE,
    entityKind: "payment_webhook_endpoint",
    entityId: row.id,
    payload: { branchId: row.branch_id, wallet, version: row.version },
  });
}
