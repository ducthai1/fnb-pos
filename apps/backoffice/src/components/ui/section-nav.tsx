"use client";

import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Icon } from "./icon";

export interface SectionPart {
  /** The element id of the part on the page. */
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
}

/**
 * A long page's parts as segments kept in view while it scrolls: a tap goes to the part,
 * and the part on screen is the one marked. Every part stays on the page (nothing hides
 * behind a tab), so an error under a field is never out of reach.
 */
export function SectionNav({ label, parts }: { label: string; parts: readonly SectionPart[] }) {
  const [current, setCurrent] = useState(parts[0]?.id ?? "");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const seen = entries.filter((entry) => entry.isIntersecting).map((entry) => entry.target.id);
        const first = parts.find((part) => seen.includes(part.id));
        if (first !== undefined) setCurrent(first.id);
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );
    for (const part of parts) {
      const element = document.getElementById(part.id);
      if (element !== null) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [parts]);

  return (
    <div className="bo-tabs bo-section-nav" role="group" aria-label={label}>
      {parts.map((part) => (
        <button
          key={part.id}
          type="button"
          className="bo-tab"
          aria-pressed={current === part.id}
          onClick={() => {
            setCurrent(part.id);
            document.getElementById(part.id)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
          }}
        >
          <Icon of={part.icon} size={16} />
          {part.label}
        </button>
      ))}
    </div>
  );
}
