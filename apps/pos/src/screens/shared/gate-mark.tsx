import type { LucideIcon } from "lucide-react";
import { Icon } from "./icon";

/** The round sign above a gate's heading (pairing, who is at the till, a fault); the words say the rest. */
export function GateMark({ of, tone = "brand" }: { of: LucideIcon; tone?: "brand" | "danger" }) {
  return (
    <span className="pos-gate__mark" data-tone={tone} aria-hidden="true">
      <Icon of={of} size={30} />
    </span>
  );
}
