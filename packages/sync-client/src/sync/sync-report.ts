import { isSyncClientError } from "../sync-client-error";
import { SyncTransportError } from "./sync-transport";

/** Why a pass stopped short; the next pass waits out a backoff first. */
export interface SyncFailure {
  readonly stage: "push" | "pull";
  /** out_of_order: every command of the batch was told to come again later. */
  readonly kind: "network" | "http" | "protocol" | "out_of_order";
  readonly status?: number;
  /** The server's error code of an HTTP failure, or the client's own when it refused what the server sent. */
  readonly code?: string;
}

/** What one pass did. */
export interface SyncReport {
  /** Commands the server settled in this pass, by commandId. */
  accepted: string[];
  rejected: string[];
  /** Answers that said "send again later": an earlier command had not arrived yet. */
  retried: number;
  /** Changes received from the feed. */
  pulled: number;
  /** The feed was read to its end. */
  caughtUp: boolean;
  /** Commands still waiting after the pass. */
  pending: number;
  /** Set when the pass met a server restored from a backup and caught up with it. */
  restore: { readonly resent: number; readonly unrecoverable: number } | null;
  failure: SyncFailure | null;
}

export const emptyReport = (): SyncReport => ({
  accepted: [],
  rejected: [],
  retried: 0,
  pulled: 0,
  caughtUp: false,
  pending: 0,
  restore: null,
  failure: null,
});

/**
 * A failure the pass reports and backs off from: the network, the server's answer, or an
 * answer the till refuses to keep. Anything else (the local database failing) is thrown.
 */
export function failureOf(stage: SyncFailure["stage"], error: unknown): SyncFailure {
  if (error instanceof SyncTransportError) {
    return {
      stage,
      kind: error.kind,
      ...(error.status === null ? {} : { status: error.status }),
      ...(error.code === undefined ? {} : { code: error.code }),
    };
  }
  if (isSyncClientError(error)) return { stage, kind: "protocol", code: error.code };
  throw error;
}
