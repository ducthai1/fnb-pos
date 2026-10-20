import type { ReactNode } from "react";

/**
 * Every screen sits in this frame, which is the element that scrolls: the page itself never
 * does, so overflow is measured here and nowhere else.
 */
export function ScreenFrame({
  title,
  wide = false,
  children,
}: {
  title: string;
  /** The selling screen uses a tablet's whole width for the menu and the order side by side. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <main className="pos-screen" data-scroll-root>
      <div className={wide ? "pos-screen__inner pos-screen__inner--wide" : "pos-screen__inner"}>
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
