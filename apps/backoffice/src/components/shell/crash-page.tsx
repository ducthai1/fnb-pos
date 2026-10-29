"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { vi } from "../../messages/vi";
import { Icon } from "../ui/icon";

const T = vi.crash;

/**
 * What a page shows when it failed to draw: it says so in plain words, that the shop's
 * data is safe, and offers to try the page again, or to start over from the home page.
 */
export function CrashPage({ onRetry }: { onRetry: () => void }) {
  return (
    <section
      className="bo-card bo-state-card"
      data-state="failed"
      data-crash-page
      aria-labelledby="crash-title"
    >
      <span className="bo-state-card__icon">
        <Icon of={TriangleAlert} size={24} />
      </span>
      <h2 id="crash-title" className="bo-subtitle">
        {T.title}
      </h2>
      <p className="bo-muted bo-wrap">{T.hint}</p>
      <p className="bo-muted bo-wrap">{T.persists}</p>
      <div className="bo-state-card__actions">
        <button type="button" className="bo-button bo-button--primary" onClick={onRetry}>
          <Icon of={RefreshCw} size={16} />
          {T.retry}
        </button>
        {/* A plain link: it loads the home page afresh, which a broken client state cannot. */}
        <a className="bo-button" href="/">
          {T.home}
        </a>
      </div>
    </section>
  );
}
