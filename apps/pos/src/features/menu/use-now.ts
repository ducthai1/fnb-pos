import { useEffect, useState } from "react";

/**
 * The till's clock, read again every `everyMs`, for what changes with time alone: a product
 * back on sale once its "sold out until" passes, a happy-hour price starting.
 */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}
