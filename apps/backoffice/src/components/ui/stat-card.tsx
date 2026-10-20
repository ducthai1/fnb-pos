import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Icon } from "./icon";

export type StatTone = "brand" | "info" | "amber" | "success";

/** One figure of a page's head: what it is, the number large, a line of context under it. */
export function StatCard({
  label,
  value,
  note,
  icon,
  tone = "brand",
  figure,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  icon: LucideIcon;
  tone?: StatTone;
  /** The report's own name for the figure, for tests and tools that read the page. */
  figure?: string;
}) {
  return (
    <div className="bo-stat" data-tone={tone} data-figure={figure}>
      <span className="bo-stat__icon">
        <Icon of={icon} size={22} />
      </span>
      <div className="bo-stat__text">
        <p className="bo-stat__label bo-wrap">{label}</p>
        <p className="bo-stat__value bo-wrap">{value}</p>
        {note !== undefined && <p className="bo-stat__note bo-wrap">{note}</p>}
      </div>
    </div>
  );
}
