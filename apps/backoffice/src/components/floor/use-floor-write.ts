"use client";

import { useState } from "react";
import type { ApiResult } from "../../lib/api/api-result";
import { failureMessage, isSignedOut } from "../../lib/errors/failure-message";
import { useSession } from "../shell/session-context";

export interface FloorWrite {
  readonly busy: boolean;
  readonly error: string | null;
  readonly done: string | null;
  /** Runs one write; on success says `doneText(value)` and lets the page re-read the plan. */
  run<T>(write: () => Promise<ApiResult<T>>, doneText: (value: T) => string): Promise<boolean>;
  dismiss(): void;
}

/**
 * The state of the writes one row of the floor plan makes, so a refusal (a table with
 * guests at it, a version someone else changed) shows on that row and nowhere else.
 */
export function useFloorWrite(onChanged: () => void): FloorWrite {
  const { signedOut } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  return {
    busy,
    error,
    done,
    async run(write, doneText) {
      setBusy(true);
      setError(null);
      setDone(null);
      const result = await write();
      setBusy(false);
      if (!result.ok) {
        if (isSignedOut(result)) signedOut();
        setError(failureMessage(result));
        // The row changed under this page (another manager's save): read the plan again.
        if (result.status === 409 && result.code === "API_FLOOR_VERSION_CONFLICT") onChanged();
        return false;
      }
      setDone(doneText(result.value));
      onChanged();
      return true;
    },
    dismiss() {
      setError(null);
      setDone(null);
    },
  };
}
