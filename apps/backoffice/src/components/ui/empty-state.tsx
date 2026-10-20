import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Icon } from "./icon";

/** Nothing to list yet: an icon, the sentence that says so and what to do, maybe a button. */
export function EmptyState({
  icon,
  children,
  action,
}: {
  icon: LucideIcon;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="bo-empty-state">
      <span className="bo-empty-state__icon">
        <Icon of={icon} size={28} />
      </span>
      <p className="bo-wrap">{children}</p>
      {action}
    </div>
  );
}
