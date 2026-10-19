import { isDomainError, isSupportedDomainVersion } from "@fnb/domain";
import type pg from "pg";
import type { ZodType, ZodTypeDef } from "zod";
import { uuidSchema as idSchema } from "@fnb/contracts";
import { appendChange, lockTenantChangeFeed } from "./change-feed";
import { nextExpectedSeq, recordOutcome, storedResultOf } from "./command-ledger";
import { orderSnapshotOf } from "./order-snapshot";
import { payOrder } from "./pay-order-command";
import { saveDraft } from "./save-draft-command";
import { readStoredOrder } from "./stored-order";
import type { SyncCommandContext, SyncSender } from "./sync-command-context";
import { CommandRejection, SYNC_ERROR_CODES } from "./sync-error-codes";
import { payOrderPayloadSchema, saveDraftPayloadSchema } from "./sync-request-schemas";
import type { SyncCommandEnvelope, SyncCommandResult } from "./sync-wire-types";

/**
 * The oldest domain rules a till may still compute with. Raise it when a rule change makes
 * older tills total an order differently from the server.
 */
export const MINIMUM_SUPPORTED_DOMAIN_VERSION = "0.1.0";

type Outcome =
  | { status: "accepted"; orderId: string }
  | { status: "rejected"; code: string; orderId: string | null };

/**
 * Applies one command inside the caller's transaction (one transaction per command) and
 * returns its answer. The same command id answers what it answered the first time, even a
 * rejection. Commands of a till are taken strictly in device_seq order: one ahead of the
 * next expected is told to retry and nothing is stored, so the till resends from the gap.
 */
export async function applySyncCommand(
  client: pg.PoolClient,
  sender: SyncSender,
  command: SyncCommandEnvelope,
): Promise<SyncCommandResult> {
  const { device } = sender;
  await lockTenantChangeFeed(client, device.tenantId);
  const stored = await storedResultOf(client, command.commandId);
  if (stored !== undefined) return stored;
  const expected = await nextExpectedSeq(client, device.deviceId);
  if (command.deviceSeq > expected) {
    return { commandId: command.commandId, status: "retry", code: SYNC_ERROR_CODES.outOfOrder };
  }
  if (command.deviceSeq < expected) {
    return {
      commandId: command.commandId,
      status: "rejected",
      code: SYNC_ERROR_CODES.deviceSeqReused,
    };
  }
  const outcome = await outcomeOf({ ...sender, client, command });
  const found =
    outcome.orderId === null ? null : await readStoredOrder(client, outcome.orderId, false);
  // A till sees an order of its own branch only, even in the answer to its own command.
  const snapshot =
    found === null || found.branchId !== device.branchId ? null : orderSnapshotOf(found);
  const result: SyncCommandResult = {
    commandId: command.commandId,
    status: outcome.status,
    ...(outcome.status === "rejected" ? { code: outcome.code } : {}),
    ...(snapshot === null ? {} : { snapshot }),
  };
  await recordOutcome(client, device.tenantId, device.deviceId, command, result);
  if (outcome.status === "accepted" && snapshot !== null) {
    await appendChange(client, device.tenantId, {
      branchId: device.branchId,
      entity: "order",
      entityId: outcome.orderId,
      snapshot,
      commandId: command.commandId,
    });
  }
  return result;
}

/**
 * Runs the handler behind a savepoint, so a refusal halfway through leaves none of its
 * writes behind while the rejection itself is still stored in this transaction.
 */
async function outcomeOf(context: SyncCommandContext): Promise<Outcome> {
  const { client, command } = context;
  const orderId = idSchema.safeParse((command.payload as { orderId?: unknown } | null)?.orderId);
  const rejected = (code: string): Outcome => ({
    status: "rejected",
    code,
    orderId: orderId.success ? orderId.data : null,
  });
  if (!isSupportedDomainVersion(command.domainVersion, MINIMUM_SUPPORTED_DOMAIN_VERSION)) {
    return rejected(SYNC_ERROR_CODES.domainVersionUnsupported);
  }
  await client.query("SAVEPOINT sync_command");
  try {
    const appliedTo = await dispatch(context);
    await client.query("RELEASE SAVEPOINT sync_command");
    return { status: "accepted", orderId: appliedTo };
  } catch (error) {
    const code =
      error instanceof CommandRejection ? error.code : isDomainError(error) ? error.code : null;
    if (code === null) throw error;
    await client.query("ROLLBACK TO SAVEPOINT sync_command");
    return rejected(code);
  }
}

function dispatch(context: SyncCommandContext): Promise<string> {
  const { type, payload } = context.command;
  switch (type) {
    case "order.save_draft":
      return saveDraft(context, parsedPayload(saveDraftPayloadSchema, payload));
    case "order.pay":
      return payOrder(context, parsedPayload(payOrderPayloadSchema, payload));
    default:
      throw new CommandRejection(SYNC_ERROR_CODES.unknownCommandType);
  }
}

function parsedPayload<T>(schema: ZodType<T, ZodTypeDef, unknown>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new CommandRejection(SYNC_ERROR_CODES.invalidPayload);
  return parsed.data;
}
