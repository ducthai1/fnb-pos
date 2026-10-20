import type { SyncCommandEnvelope } from "@fnb/contracts";
import type { StaffSession } from "../features/api/pos-api";

/**
 * The staff sessions of this till while the POS is open: who is signed in now, and the
 * credential of every session opened since, by its id. A command is stamped with the
 * session it was recorded in and pushed under that session's credential, so the server
 * records the cashier who made it as its author even when someone else signed in on the
 * till before it synced (a hand-over while the network was down).
 */
export interface TillStaffSessions {
  current: { readonly sessionId: string | null; readonly token: string } | null;
  readonly tokens: Map<string, string>;
}

export const newTillStaffSessions = (): TillStaffSessions => ({ current: null, tokens: new Map() });

export function signInto(sessions: TillStaffSessions, session: StaffSession): void {
  const sessionId = session.sessionId ?? null;
  sessions.current = { sessionId, token: session.token };
  if (sessionId !== null) sessions.tokens.set(sessionId, session.token);
}

/**
 * The credential to push `batch` with (one session's commands, see the sync client): its
 * own session's while the till still holds it, else whoever is signed in now. A command
 * from before this POS was opened, or of a session the server ended, then goes under the
 * current cashier rather than waiting for ever on a credential the till no longer has.
 */
export function tokenForBatch(
  sessions: TillStaffSessions,
  batch: readonly SyncCommandEnvelope[],
): string | null {
  const sessionId = batch[0]?.staffSessionId;
  const own = sessionId === undefined ? undefined : sessions.tokens.get(sessionId);
  return own ?? sessions.current?.token ?? null;
}

/** The server no longer takes `token`: its session's waiting commands go under the next. */
export function forgetToken(sessions: TillStaffSessions, token: string): void {
  for (const [sessionId, held] of sessions.tokens) {
    if (held === token) sessions.tokens.delete(sessionId);
  }
}
