import type { ReactNode } from "react";

/** How wide the content may grow; the till's bar always runs the whole width. */
export type ScreenWidth = "narrow" | "normal" | "wide";

const WIDTH_CLASS: Readonly<Record<ScreenWidth, string>> = {
  narrow: "pos-screen__inner pos-screen__inner--narrow",
  normal: "pos-screen__inner",
  wide: "pos-screen__inner pos-screen__inner--wide",
};

/**
 * Every screen sits in this frame, which is the element that scrolls: the page itself never
 * does, so overflow is measured here and nowhere else.
 */
export function ScreenFrame({
  title,
  wide = false,
  width,
  children,
}: {
  title: string;
  /** The selling screen uses a tablet's whole width for the menu and the order side by side. */
  wide?: boolean;
  /** A sign-in or a single form reads best as a narrow column in the middle. */
  width?: ScreenWidth;
  children: ReactNode;
}) {
  return (
    <main className="pos-screen" data-scroll-root>
      <div className={WIDTH_CLASS[width ?? (wide ? "wide" : "normal")]}>
        <h1 className="pos-title">{title}</h1>
        {children}
      </div>
    </main>
  );
}

export type AlertTone = "danger" | "warn" | "info" | "ok";

/** A sentence read out by screen readers as soon as it appears (errors, refusals). */
export function Alert({ message, tone = "danger" }: { message: string | null; tone?: AlertTone }) {
  if (message === null) return null;
  return (
    <p className={tone === "danger" ? "pos-alert" : `pos-alert pos-alert--${tone}`} role="alert">
      {message}
    </p>
  );
}
