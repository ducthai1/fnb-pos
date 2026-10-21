"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { type FocusEvent, type KeyboardEvent, useEffect, useRef } from "react";
import type { AdminSection, SectionGroup } from "../../lib/navigation/admin-sections";
import { vi } from "../../messages/vi";
import { Icon } from "../ui/icon";
import { SECTION_ICONS } from "./section-icons";

const T = vi.shell;

type Edge = "first" | "last";

const linksIn = (panel: HTMLElement | null): HTMLElement[] => [...(panel?.querySelectorAll<HTMLElement>("a[href]") ?? [])];

/** The next link of the open list for a key that walks it, wrapping at either end; null for other keys. */
function linkFor(key: string, links: readonly HTMLElement[], at: number): HTMLElement | null {
  const last = links.length - 1;
  if (key === "ArrowDown") return links[at >= last ? 0 : at + 1] ?? null;
  if (key === "ArrowUp") return links[at <= 0 ? last : at - 1] ?? null;
  if (key === "Home") return links[0] ?? null;
  if (key === "End") return links[last] ?? null;
  return null;
}

export interface NavGroupMenuProps {
  group: SectionGroup;
  sections: readonly AdminSection[];
  /** The section of the page on screen, from `currentSection`. */
  current: string | null;
  open: boolean;
  onOpenChange(open: boolean): void;
}

/**
 * One heading of the menu bar and the list of its pages that drops from it. The heading is
 * a button (Enter or Space toggles it, an arrow opens it on its first or last page), the
 * pages are links walked with the arrows; Esc closes it and gives the heading the focus back,
 * and the list closes as the focus leaves it. The heading of the page on screen is marked too.
 */
export function NavGroupMenu({ group, sections, current, open, onOpenChange }: NavGroupMenuProps) {
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLUListElement>(null);
  const focusOnOpen = useRef<Edge | null>(null);
  const panelId = `bo-topnav-${group}`;
  const holdsCurrent = sections.some((section) => section.href === current);

  // A hidden list cannot take the focus, so an arrow that opens it moves in once it shows.
  useEffect(() => {
    const edge = focusOnOpen.current;
    focusOnOpen.current = null;
    if (!open || edge === null) return;
    const links = linksIn(panel.current);
    (edge === "first" ? links[0] : links[links.length - 1])?.focus();
  }, [open]);

  function openAt(edge: Edge) {
    if (open) {
      const links = linksIn(panel.current);
      return (edge === "first" ? links[0] : links[links.length - 1])?.focus();
    }
    focusOnOpen.current = edge;
    onOpenChange(true);
  }

  function onTriggerKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openAt(event.key === "ArrowDown" ? "first" : "last");
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      onOpenChange(false);
    }
  }

  function onPanelKey(event: KeyboardEvent<HTMLUListElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onOpenChange(false);
      trigger.current?.focus();
      return;
    }
    const links = linksIn(panel.current);
    const next = linkFor(event.key, links, links.indexOf(event.target as HTMLElement));
    if (next === null) return;
    event.preventDefault();
    next.focus();
  }

  function onLeave(event: FocusEvent<HTMLLIElement>) {
    if (open && !event.currentTarget.contains(event.relatedTarget as Node | null)) onOpenChange(false);
  }

  return (
    <li className="bo-topnav__item" onBlur={onLeave}>
      <button
        ref={trigger}
        type="button"
        className="bo-topnav__top"
        aria-expanded={open}
        aria-controls={panelId}
        aria-current={holdsCurrent ? "true" : undefined}
        data-bar-item
        onClick={() => onOpenChange(!open)}
        onKeyDown={onTriggerKey}
      >
        <span className="bo-topnav__label">{T.groups[group]}</span>
        <Icon of={ChevronDown} size={18} />
      </button>
      <ul
        ref={panel}
        id={panelId}
        className="bo-topnav__panel"
        aria-label={T.groups[group]}
        hidden={!open}
        onKeyDown={onPanelKey}
      >
        {sections.map((section) => {
          const glyph = SECTION_ICONS[section.href];
          return (
            <li key={section.href}>
              <Link
                href={section.href}
                className="bo-topnav__link"
                aria-current={section.href === current ? "page" : undefined}
                onClick={() => onOpenChange(false)}
              >
                {glyph && <Icon of={glyph} size={20} />}
                <span className="bo-topnav__link-label">{section.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </li>
  );
}
