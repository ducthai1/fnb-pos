import type { PermissionKey } from "@fnb/domain";
import { vi } from "../../messages/vi";

/** The headings the menu groups its pages under, in menu order. */
export const SECTION_GROUPS = ["people", "menu", "sales", "shop"] as const;
export type SectionGroup = (typeof SECTION_GROUPS)[number];

export interface AdminSection {
  readonly href: string;
  readonly label: string;
  readonly group: SectionGroup;
  /** The key the page's own list call needs; null when any signed-in member may read it. */
  readonly requires: PermissionKey | null;
}

/**
 * The pages of the menu, in menu order. The menu pages only read the catalog, which
 * any member may; changing it is checked where it is changed.
 */
export const ADMIN_SECTIONS: readonly AdminSection[] = [
  { href: "/devices", group: "people", label: vi.shell.nav.devices, requires: "manage_devices" },
  { href: "/staff", group: "people", label: vi.shell.nav.staff, requires: "manage_staff" },
  { href: "/roles", group: "people", label: vi.shell.nav.roles, requires: "manage_staff" },
  { href: "/menu", group: "menu", label: vi.shell.nav.products, requires: null },
  { href: "/menu/categories", group: "menu", label: vi.shell.nav.categories, requires: null },
  { href: "/menu/availability", group: "menu", label: vi.shell.nav.availability, requires: null },
  { href: "/reports/daily-sales", group: "sales", label: vi.shell.nav.dailySales, requires: "view_reports" },
  { href: "/day-close", group: "sales", label: vi.shell.nav.dayClose, requires: "view_reports" },
  { href: "/payments", group: "sales", label: vi.shell.nav.transfers, requires: "view_reports" },
  { href: "/reports/print-failures", group: "sales", label: vi.shell.nav.printFailures, requires: "view_reports" },
  { href: "/floor", group: "shop", label: vi.shell.nav.floor, requires: "manage_settings" },
  { href: "/settings", group: "shop", label: vi.shell.nav.settings, requires: "manage_settings" },
];

/** The section a path belongs to, with its group, or null for the home page and unknown paths. */
export function sectionOf(href: string): AdminSection | null {
  return ADMIN_SECTIONS.find((section) => section.href === href) ?? null;
}

/**
 * The sections a member's keys open, so the menu does not offer a page that would only
 * say "no permission". Hiding is a courtesy: the page itself still shows that refusal to
 * anyone who opens it by its address, and the API refuses the call either way.
 */
export function sectionsFor(permissionKeys: readonly PermissionKey[]): readonly AdminSection[] {
  return ADMIN_SECTIONS.filter((section) => section.requires === null || permissionKeys.includes(section.requires));
}

/** The groups the member has at least one page in, each with those pages, in menu order. */
export function groupedSectionsFor(
  permissionKeys: readonly PermissionKey[],
): readonly { readonly group: SectionGroup; readonly sections: readonly AdminSection[] }[] {
  const sections = sectionsFor(permissionKeys);
  return SECTION_GROUPS.map((group) => ({ group, sections: sections.filter((section) => section.group === group) })).filter(
    (entry) => entry.sections.length > 0,
  );
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
