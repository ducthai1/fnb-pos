"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_SECTIONS, currentSection } from "../../lib/navigation/admin-sections";

export function SideNavLinks({ onNavigate }: { onNavigate: () => void }) {
  const current = currentSection(usePathname());
  return (
    <ul className="bo-sidenav__links">
      {ADMIN_SECTIONS.map((section) => (
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
