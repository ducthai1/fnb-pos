import type { SyncReport } from "@fnb/sync-client";

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
