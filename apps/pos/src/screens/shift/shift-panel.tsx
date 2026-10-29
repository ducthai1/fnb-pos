import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Icon } from "../shared/icon";

/**
 * One block of a shift screen (the count, the figures, the amount and its keys): a titled
 * card with a round sign, so the three screens of the drawer read as one family.
 */
export function ShiftPanel({
  icon,
  title,
  hint,
  tone = "brand",
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string | undefined;
  tone?: "brand" | "danger";
  children: ReactNode;
}) {
  return (
    <section className="pos-panel">
      <header className="pos-panel__head">
        <span className="pos-panel__mark" data-tone={tone} aria-hidden="true">
          <Icon of={icon} size={22} />
        </span>
        <div className="pos-panel__heading">
          <h2 className="pos-panel__title">{title}</h2>
          {hint === undefined ? null : <p className="pos-hint">{hint}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}
