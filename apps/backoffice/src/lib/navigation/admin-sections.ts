import { vi } from "../../messages/vi";

/** The pages of the side menu, in menu order. */
export const ADMIN_SECTIONS = [
  { href: "/devices", label: vi.shell.nav.devices },
  { href: "/staff", label: vi.shell.nav.staff },
  { href: "/roles", label: vi.shell.nav.roles },
  { href: "/menu", label: vi.shell.nav.products },
  { href: "/menu/categories", label: vi.shell.nav.categories },
  { href: "/menu/availability", label: vi.shell.nav.availability },
] as const;

/** The section a path belongs to: the longest matching href, so /menu/categories is not /menu. */
export function currentSection(pathname: string): string | null {
  let best: string | null = null;
  for (const { href } of ADMIN_SECTIONS) {
    const matches = pathname === href || pathname.startsWith(`${href}/`);
    if (matches && (best === null || href.length > best.length)) best = href;
  }
  return best;
}
