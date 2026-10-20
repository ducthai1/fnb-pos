"use client";

import { Info, Layers, ListChecks, type LucideIcon, Tag } from "lucide-react";
import { useEffect, useState } from "react";
import { vi } from "../../../messages/vi";
import { Icon } from "../../ui/icon";
import { EDITOR_SECTIONS } from "./editor-sections";

const T = vi.menu.editor;
type Part = keyof typeof EDITOR_SECTIONS;
const PARTS: readonly { part: Part; icon: LucideIcon }[] = [
  { part: "info", icon: Info },
  { part: "price", icon: Tag },
  { part: "variants", icon: Layers },
  { part: "groups", icon: ListChecks },
];

/**
 * The editor's parts as segments over the form, kept in view while the form scrolls: a tap
 * goes to the part, and the part on screen is the one marked. Every part stays on the page
 * (nothing is hidden behind a tab), so an error under a field is never out of reach.
 */
export function EditorSectionNav() {
  const [current, setCurrent] = useState<Part>("info");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const seen = entries.filter((entry) => entry.isIntersecting).map((entry) => entry.target.id);
        const first = PARTS.find(({ part }) => seen.includes(EDITOR_SECTIONS[part]));
        if (first !== undefined) setCurrent(first.part);
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );
    for (const { part } of PARTS) {
      const element = document.getElementById(EDITOR_SECTIONS[part]);
      if (element !== null) observer.observe(element);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="bo-tabs bo-editor-nav" role="group" aria-label={T.sectionsLabel}>
      {PARTS.map(({ part, icon }) => (
        <button
          key={part}
          type="button"
          className="bo-tab"
          aria-pressed={current === part}
          onClick={() => {
            setCurrent(part);
            document.getElementById(EDITOR_SECTIONS[part])?.scrollIntoView?.({ behavior: "smooth", block: "start" });
          }}
        >
          <Icon of={icon} size={16} />
          {T.sections[part]}
        </button>
      ))}
    </div>
  );
}
