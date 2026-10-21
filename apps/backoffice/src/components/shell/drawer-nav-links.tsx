"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { currentSection, groupedSectionsFor } from "../../lib/navigation/admin-sections";
import { vi } from "../../messages/vi";
import { Icon } from "../ui/icon";
import { SECTION_ICONS } from "./section-icons";
import { useSession } from "./session-context";

const T = vi.shell;

function DrawerLink({ href, label, current, onNavigate }: { href: string; label: string; current: boolean; onNavigate: () => void }) {
  const glyph = SECTION_ICONS[href];
  return (
    <Link href={href} className="bo-drawer__link" aria-current={current ? "page" : undefined} onClick={onNavigate}>
      {glyph && <Icon of={glyph} size={20} />}
      <span className="bo-drawer__label">{label}</span>
    </Link>
  );
}

/**
 * The menu behind the menu button on a phone or a tablet: the home page, then every page
 * the member's keys open, under the heading of its group, so nothing is a tap deeper than
 * the drawer itself. A group the member has no page of is left out with its heading.
 */
export function DrawerNavLinks({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname() ?? "/";
  const current = currentSection(pathname);
  const { user } = useSession();
  return (
    <ul className="bo-drawer__links">
      <li>
        <DrawerLink href="/" label={T.nav.home} current={pathname === "/"} onNavigate={onNavigate} />
      </li>
      {groupedSectionsFor(user.permissionKeys).map(({ group, sections }) => (
        <li key={group} className="bo-drawer__group">
          <p className="bo-drawer__heading" id={`bo-drawer-${group}`}>
            {T.groups[group]}
          </p>
          <ul className="bo-drawer__links" aria-labelledby={`bo-drawer-${group}`}>
            {sections.map((section) => (
              <li key={section.href}>
                <DrawerLink
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
