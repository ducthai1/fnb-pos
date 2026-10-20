"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type AdminSection, SECTION_GROUPS, currentSection, sectionsFor } from "../../lib/navigation/admin-sections";
import { vi } from "../../messages/vi";
import { Icon } from "../ui/icon";
import { SECTION_ICONS } from "./section-icons";
import { useSession } from "./session-context";

const T = vi.shell;

function NavLink({ href, label, current, onNavigate }: { href: string; label: string; current: boolean; onNavigate: () => void }) {
  const glyph = SECTION_ICONS[href];
  return (
    <Link
      href={href}
      className="bo-sidenav__link"
      aria-current={current ? "page" : undefined}
      title={label}
      onClick={onNavigate}
    >
      {glyph && <Icon of={glyph} size={20} />}
      <span className="bo-sidenav__label">{label}</span>
    </Link>
  );
}

/**
 * The home page, then the pages the member's keys open, under the heading of their group.
 * A group the member has no page of is left out with its heading.
 */
export function SideNavLinks({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname() ?? "/";
  const current = currentSection(pathname);
  const { user } = useSession();
  const sections = sectionsFor(user.permissionKeys);
  const inGroup = (group: string): readonly AdminSection[] => sections.filter((section) => section.group === group);
  return (
    <ul className="bo-sidenav__links">
      <li>
        <NavLink href="/" label={T.nav.home} current={pathname === "/"} onNavigate={onNavigate} />
      </li>
      {SECTION_GROUPS.filter((group) => inGroup(group).length > 0).map((group) => (
        <li key={group} className="bo-sidenav__group">
          <p className="bo-sidenav__heading" id={`bo-nav-${group}`}>
            {T.groups[group]}
          </p>
          <ul className="bo-sidenav__links" aria-labelledby={`bo-nav-${group}`}>
            {inGroup(group).map((section) => (
              <li key={section.href}>
                <NavLink
                  href={section.href}
                  label={section.label}
                  current={current === section.href}
                  onNavigate={onNavigate}
                />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
