import type { OrderLine } from "@fnb/domain";
import { useCallback, useMemo, useRef, useState } from "react";
import type { KeptLines } from "./price-counter-order";

/** What an order holds beside its cart: items kept as stored, lines commands made. */
export interface OrderLocks {
  readonly kept: KeptLines;
  readonly commandLines: readonly OrderLine[];
}

const NONE: OrderLocks = { kept: new Map(), commandLines: [] };

/**
 * The locks for rendering (`state`) and for the session's saves (`now`, read when a save
 * runs, which may be after the render that queued it). `set(null)` clears them.
 */
export function useOrderLocks(initial: OrderLocks = NONE) {
  const [state, setState] = useState(initial);
  const now = useRef(initial);
  const set = useCallback((next: OrderLocks | null) => {
    now.current = next ?? NONE;
    setState(now.current);
  }, []);
  return useMemo(() => ({ state, now, set }), [state, set]);
}
