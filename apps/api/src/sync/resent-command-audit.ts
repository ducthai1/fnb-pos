import { appendAudit } from "@fnb/db";
import type pg from "pg";
import type { DeviceAuth } from "../devices/device-auth-hook";
import type { SyncCommandEnvelope, SyncCommandResult } from "./sync-wire-types";

/**
 * Notes in the audit trail a command a till sent again because the server was restored
 * from a backup taken before it first took the command: which till, which command, the
 * generation that took it first, and what this server answered. Written once, with the
 * answer it is stored with, so a repeat of the resend adds nothing.
 */
export async function auditResentCommand(
  client: pg.ClientBase,
  device: DeviceAuth,
  command: SyncCommandEnvelope,
  result: SyncCommandResult,
): Promise<void> {
  if (command.resentFromGeneration === undefined) return;
  await appendAudit(client, {
    actor: { kind: "device", id: device.deviceId },
    action: "sync.command_resent_after_restore",
    entityKind: "device",
    entityId: device.deviceId,
    payload: {
      commandId: command.commandId,
      commandType: command.type,
      deviceSeq: command.deviceSeq,
      resentFromGeneration: command.resentFromGeneration,
      status: result.status,
      ...(result.code === undefined ? {} : { code: result.code }),
    },
  });
}
