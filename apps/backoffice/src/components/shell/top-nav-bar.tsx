"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { type SectionGroup, currentSection, groupedSectionsFor } from "../../lib/navigation/admin-sections";
import { vi } from "../../messages/vi";
import { NavGroupMenu } from "./nav-group-menu";
import { useSession } from "./session-context";

const T = vi.shell;

/** Left and right walk the headings of the bar, as they would a row of tabs. */
function walkBar(event: KeyboardEvent<HTMLUListElement>) {
  if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-bar-item]")];
  const at = items.indexOf(event.target as HTMLElement);
  if (at < 0) return;
  event.preventDefault();
  const step = event.key === "ArrowRight" ? 1 : -1;
  items[(at + step + items.length) % items.length]?.focus();
}

/**
 * The menu across the top of a computer screen: the home page, then one heading per group
 * the member has a page in, each dropping the list of those pages. One list is open at a
 * time; it closes on a tap or click anywhere else and once a page opens.
 */
export function TopNavBar() {
  const pathname = usePathname() ?? "/";
  const current = currentSection(pathname);
  const { user } = useSession();
  const [open, setOpen] = useState<SectionGroup | null>(null);
  const bar = useRef<HTMLUListElement>(null);

  useEffect(() => setOpen(null), [pathname]);

  useEffect(() => {
    if (open === null) return;
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !bar.current?.contains(event.target)) setOpen(null);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  return (
    <ul ref={bar} className="bo-topnav__items" onKeyDown={walkBar}>
      <li className="bo-topnav__item">
        <Link href="/" className="bo-topnav__top" aria-current={pathname === "/" ? "page" : undefined} data-bar-item>
          <span className="bo-topnav__label">{T.nav.home}</span>
        </Link>
      </li>
      {groupedSectionsFor(user.permissionKeys).map(({ group, sections }) => (
        <NavGroupMenu
          key={group}
          group={group}
          sections={sections}
          current={current}
          open={open === group}
          onOpenChange={(next) => setOpen((now) => (next ? group : now === group ? null : now))}
        />
      ))}
    </ul>
  );
}
