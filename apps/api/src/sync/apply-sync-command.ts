import { isDomainError, isSupportedDomainVersion } from "@fnb/domain";
import type pg from "pg";
import { uuidSchema as idSchema } from "@fnb/contracts";
import { appendChange, lockTenantChangeFeed } from "./change-feed";
import { nextExpectedSeq, recordOutcome, storedResultOf } from "./command-ledger";
import { type CommandSubject, subjectSnapshotOf } from "./command-subject-snapshot";
import type { SyncCommandContext, SyncSender } from "./sync-command-context";
import { SYNC_COMMANDS } from "./sync-command-registry";
import { CommandRejection, SYNC_ERROR_CODES } from "./sync-error-codes";
import type { SyncCommandEnvelope, SyncCommandResult } from "./sync-wire-types";

/**
 * The oldest domain rules a till may still compute with. Raise it when a rule change makes
 * older tills total an order differently from the server.
 */
export const MINIMUM_SUPPORTED_DOMAIN_VERSION = "0.1.0";

type Outcome =
  | { status: "accepted"; subject: CommandSubject }
  | { status: "rejected"; code: string; subject: CommandSubject | null };

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
  const snapshot =
    outcome.subject === null ? null : await subjectSnapshotOf(client, device, outcome.subject);
  const result: SyncCommandResult = {
    commandId: command.commandId,
    status: outcome.status,
    ...(outcome.status === "rejected" ? { code: outcome.code } : {}),
    ...(snapshot === null ? {} : { snapshot }),
  };
  const { tenantId, deviceId } = device;
  await recordOutcome(client, { tenantId, deviceId, staffId: sender.staffId }, command, result);
  if (outcome.status === "accepted" && snapshot !== null) {
    await appendChange(client, device.tenantId, {
      branchId: device.branchId,
      entity: outcome.subject.entity,
      entityId: outcome.subject.id,
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
  // A refund names its new order refundOrderId; every other order command names orderId.
  const named = command.payload as { orderId?: unknown; refundOrderId?: unknown } | null;
  const orderId = idSchema.safeParse(named?.orderId ?? named?.refundOrderId);
  const rejected = (code: string): Outcome => ({
    status: "rejected",
    code,
    subject: orderId.success ? { entity: "order", id: orderId.data } : null,
  });
  if (!isSupportedDomainVersion(command.domainVersion, MINIMUM_SUPPORTED_DOMAIN_VERSION)) {
    return rejected(SYNC_ERROR_CODES.domainVersionUnsupported);
  }
  await client.query("SAVEPOINT sync_command");
  try {
    const subject = await dispatch(context);
    await client.query("RELEASE SAVEPOINT sync_command");
    return { status: "accepted", subject };
  } catch (error) {
    const code =
      error instanceof CommandRejection ? error.code : isDomainError(error) ? error.code : null;
    if (code === null) throw error;
    await client.query("ROLLBACK TO SAVEPOINT sync_command");
    return rejected(code);
  }
}

/** The command's definition applies it and names the row it changed (an order, a shift). */
function dispatch(context: SyncCommandContext): Promise<CommandSubject> {
  const definition = SYNC_COMMANDS.get(context.command.type);
  if (definition === undefined) throw new CommandRejection(SYNC_ERROR_CODES.unknownCommandType);
  return definition.apply(context, context.command.payload);
}
