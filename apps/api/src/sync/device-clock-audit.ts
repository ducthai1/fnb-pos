import { appendAudit } from "@fnb/db";
import type { CommandTime } from "./command-time";
import type { SyncCommandContext } from "./sync-command-context";

/**
 * Notes in the audit trail that a till's clock was off enough for the server to act on
 * another time than the one it wrote: which till, which command, and by how much. Written
 * whether or not the command is then accepted, since the clock was off either way.
 */
export async function auditClampedClock(
  context: Omit<SyncCommandContext, "time">,
  time: CommandTime,
): Promise<void> {
  const { client, device, command } = context;
  await appendAudit(client, {
    actor: { kind: "device", id: device.deviceId },
    action: "sync.device_clock_clamped",
    entityKind: "device",
    entityId: device.deviceId,
    payload: {
      commandId: command.commandId,
      commandType: command.type,
      deviceAt: time.deviceAt.toISOString(),
      receivedAt: time.receivedAt.toISOString(),
      effectiveAt: time.effectiveAt.toISOString(),
      /** deviceAt − receivedAt: how far the till's clock was from the server's. */
      skewMs: time.deviceAt.getTime() - time.receivedAt.getTime(),
      clampedByMs: time.clampedByMs,
    },
  });
}
