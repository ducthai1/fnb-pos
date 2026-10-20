import { useCallback, useMemo, useRef, useState } from "react";
import type { PreBillState } from "./table-order-session";

/**
 * Whether the guests' pre-bill still shows the order: current once printed or shown, out of
 * date (changed) after anything changes what they owe, none before the first one.
 */
export function usePreBillState(printed: boolean, changed = false) {
  const [state, setState] = useState<PreBillState>(
    printed ? "current" : changed ? "changed" : "none",
  );
  const now = useRef(state);
  const outOfDate = useCallback(() => {
    if (now.current !== "current") return;
    now.current = "changed";
    setState("changed");
  }, []);
  const printedNow = useCallback(() => {
    now.current = "current";
    setState("current");
  }, []);
  return useMemo(() => ({ state, outOfDate, printedNow }), [state, outOfDate, printedNow]);
}
