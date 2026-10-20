import type { ReactNode } from "react";

/**
 * Every screen sits in this frame, which is the element that scrolls: the page itself never
 * does, so overflow is measured here and nowhere else.
 */
export function ScreenFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="pos-screen" data-scroll-root>
      <div className="pos-screen__inner">
        <h1 className="pos-title">{title}</h1>
        {children}
      </div>
    </main>
  );
}

/** A sentence read out by screen readers as soon as it appears (errors, refusals). */
export function Alert({ message }: { message: string | null }) {
  if (message === null) return null;
  return (
    <p className="pos-alert" role="alert">
      {message}
    </p>
  );
}
