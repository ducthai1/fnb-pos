import type { PermissionKey } from "@fnb/domain";
import { vi } from "../../messages/vi";

interface AdminSection {
  readonly href: string;
  readonly label: string;
  /** The key the page's own list call needs; null when any signed-in member may read it. */
  readonly requires: PermissionKey | null;
}

/**
 * The pages of the side menu, in menu order. The menu pages only read the catalog, which
 * any member may; changing it is checked where it is changed.
 */
export const ADMIN_SECTIONS: readonly AdminSection[] = [
  { href: "/devices", label: vi.shell.nav.devices, requires: "manage_devices" },
  { href: "/staff", label: vi.shell.nav.staff, requires: "manage_staff" },
  { href: "/roles", label: vi.shell.nav.roles, requires: "manage_staff" },
  { href: "/menu", label: vi.shell.nav.products, requires: null },
  { href: "/menu/categories", label: vi.shell.nav.categories, requires: null },
  { href: "/menu/availability", label: vi.shell.nav.availability, requires: null },
  { href: "/settings", label: vi.shell.nav.settings, requires: "manage_settings" },
];

/**
 * The sections a member's keys open, so the menu does not offer a page that would only
 * say "no permission". Hiding is a courtesy: the page itself still shows that refusal to
 * anyone who opens it by its address, and the API refuses the call either way.
 */
export function sectionsFor(permissionKeys: readonly PermissionKey[]): readonly AdminSection[] {
  return ADMIN_SECTIONS.filter((section) => section.requires === null || permissionKeys.includes(section.requires));
}

/** The section a path belongs to: the longest matching href, so /menu/categories is not /menu. */
export function currentSection(pathname: string): string | null {
  let best: string | null = null;
  for (const { href } of ADMIN_SECTIONS) {
    const matches = pathname === href || pathname.startsWith(`${href}/`);
    if (matches && (best === null || href.length > best.length)) best = href;
  }
  return best;
}
