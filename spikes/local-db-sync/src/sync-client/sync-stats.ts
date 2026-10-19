export interface SyncStats {
  pushRounds: number;
  pushRequests: number;
  pushFailures: number;
  pullRequests: number;
  pullFailures: number;
  pullsDeferred: number;
  accepted: number;
  replayed: number;
  rejected: number;
  retriedOutOfOrder: number;
  rejectionCodes: Record<string, number>;
  /** Every cursor value the till stored, in order; it must never decrease. */
  cursorHistory: string[];
}

export function emptySyncStats(): SyncStats {
  return {
    pushRounds: 0,
    pushRequests: 0,
    pushFailures: 0,
    pullRequests: 0,
    pullFailures: 0,
    pullsDeferred: 0,
    accepted: 0,
    replayed: 0,
    rejected: 0,
    retriedOutOfOrder: 0,
    rejectionCodes: {},
    cursorHistory: [],
  };
}

export function cursorNeverDecreased(history: readonly string[]): boolean {
  return history.every((value, i) => i === 0 || BigInt(value) >= BigInt(history[i - 1] ?? "0"));
}
