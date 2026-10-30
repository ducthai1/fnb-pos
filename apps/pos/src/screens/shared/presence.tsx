import { type ReactNode, useRef } from "react";
import { usePresence } from "./use-leave-motion";

/**
 * A notice or an in-place confirmation that sinks away when it goes, instead of vanishing: it
 * stays on the page, with what it last said, for the leaving movement. `children` is null when
 * there is nothing to show; the last thing shown is kept for the movement.
 */
export function Presence({ children }: { children: ReactNode | null }) {
  const last = useRef<ReactNode>(null);
  if (children !== null) last.current = children;
  const { present, leaving } = usePresence(children !== null, "--t-exit");
  if (!present) return null;
  return (
    <div className="pos-presence" data-leaving={leaving ? "" : undefined} inert={leaving}>
      {last.current}
    </div>
  );
}
