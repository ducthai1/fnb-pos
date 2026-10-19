import type { SyncChangesPage, SyncCommandEnvelope, SyncCommandResult } from "@fnb/contracts";

/**
 * - network: no answer (offline, timeout, connection dropped); the server may have applied it.
 * - http: an answer other than 200, e.g. 401 once the staff session has expired.
 * - protocol: a 200 whose body is not what the contract says.
 */
export type SyncTransportErrorKind = "network" | "http" | "protocol";

export class SyncTransportError extends Error {
  constructor(
    readonly kind: SyncTransportErrorKind,
    readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = "SyncTransportError";
  }
}

/** How a till reaches the sync endpoints. Every failure is a SyncTransportError. */
export interface SyncTransport {
  /** One batch of the till's commands, oldest first; one answer per command it reached. */
  pushCommands(commands: readonly SyncCommandEnvelope[]): Promise<SyncCommandResult[]>;
  /** The changes after `cursor`, at most `limit`, oldest first. */
  pullChanges(cursor: string, limit: number): Promise<SyncChangesPage>;
}
