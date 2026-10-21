import type { RestoreState, SyncReport } from "@fnb/sync-client";

/**
 * What the till knows about its link to the server, from the last sync pass itself:
 * navigator.onLine says only that a network interface is up, not that the API answers.
 */
export type TillConnection =
  | "checking"
  | "online"
  | "offline"
  | "server_error"
  /** The server refuses writes from the page's address (403 API_ORIGIN_NOT_ALLOWED). */
  | "origin_refused";

export interface TillSyncStatus {
  readonly connection: TillConnection;
  /** Commands recorded on the till and not yet settled by the server. */
  readonly pending: number;
  /** Commands the server refused for good: the "needs attention" list. */
  readonly needsAttention: number;
  /** After the server was restored from a backup: what the till still sends again. */
  readonly restore?: RestoreState;
  /** How far the server's clock is ahead of the till's, in ms; null before it is known. */
  readonly clockOffsetMs?: number | null;
}

/**
 * Past this the till's clock is worth fixing: the server sends back a command dated more
 * than two minutes ahead of its clock. The till dates its commands by the server's clock
 * either way, so nothing is refused for it; the notice is so someone fixes the PC.
 */
export const CLOCK_NOTICE_AFTER_MS = 2 * 60_000;

/** How many minutes the till's clock is off, when that is worth a notice; else null. */
export function clockOffMinutes(offsetMs: number | null | undefined): number | null {
  if (offsetMs === null || offsetMs === undefined) return null;
  if (Math.abs(offsetMs) <= CLOCK_NOTICE_AFTER_MS) return null;
  return Math.round(Math.abs(offsetMs) / 60_000);
}

export const INITIAL_SYNC_STATUS: TillSyncStatus = {
  connection: "checking",
  pending: 0,
  needsAttention: 0,
};

/**
 * No answer at all is offline; a push refused for the page's address says so (nothing the
 * till records gets through until someone fixes the server's settings); any other error
 * means the server is in trouble.
 */
export function connectionAfter(report: SyncReport): TillConnection {
  if (report.failure === null) return "online";
  if (report.failure.kind === "network") return "offline";
  const { stage, status } = report.failure;
  return stage === "push" && status === 403 ? "origin_refused" : "server_error";
}
