"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { currentSection, sectionsFor } from "../../lib/navigation/admin-sections";
import { useSession } from "./session-context";

export function SideNavLinks({ onNavigate }: { onNavigate: () => void }) {
  const current = currentSection(usePathname());
  const { user } = useSession();
  return (
    <ul className="bo-sidenav__links">
      {sectionsFor(user.permissionKeys).map((section) => (
        <li key={section.href}>
          <Link
            href={section.href}
            className="bo-sidenav__link"
            aria-current={current === section.href ? "page" : undefined}
            onClick={onNavigate}
          >
            {section.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
