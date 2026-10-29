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
  stage,
  stageMark,
  wide = false,
  width,
  titleHidden = false,
  dock,
  enter,
  leaving = false,
  children,
}: {
  title: string;
  /** Kept for screen readers only, where the screen's bar already says where the cashier is. */
  titleHidden?: boolean;
  /**
   * The total and the buttons that act on the screen: at the foot of a short screen, kept in
   * view at the bottom of a long one.
   */
  dock?: ReactNode;
  /**
   * A gate (pairing, who is at the till, the fault screens): one card of this width centred
   * on the screen over a soft backdrop, whose heading is the screen's title, with `stageMark`
   * drawn above it. Short content sits in the middle; a taller card scrolls inside the frame.
   */
  stage?: "narrow" | "wide";
  stageMark?: ReactNode;
  /** The selling screen uses a tablet's whole width for the menu and the order side by side. */
  wide?: boolean;
  /** A sign-in or a single form reads best as a narrow column in the middle. */
  width?: ScreenWidth;
  /** A step over the order rises into place as it opens (see pos-motion.css). */
  enter?: "sheet";
  /** The step is playing its leaving movement: it takes no touch and its edges fade out. */
  leaving?: boolean;
  children: ReactNode;
}) {
  if (stage !== undefined) {
    return (
      <main className="pos-screen" data-scroll-root data-stage={stage}>
        <div className="pos-screen__inner pos-screen__inner--stage">
          <section className="pos-gate" data-size={stage}>
            {stageMark}
            <h1 className="pos-gate__title">{title}</h1>
            {children}
          </section>
        </div>
      </main>
    );
  }
  return (
    <main
      className="pos-screen"
      data-scroll-root
      data-enter={enter}
      data-leaving={leaving ? "" : undefined}
      inert={leaving}
    >
      <div className={WIDTH_CLASS[width ?? (wide ? "wide" : "normal")]}>
        <h1 className={titleHidden ? "pos-title pos-title--hidden" : "pos-title"}>{title}</h1>
        {children}
      </div>
      {dock === undefined ? null : (
        <div className={`pos-dock pos-dock--${width ?? (wide ? "wide" : "normal")}`}>{dock}</div>
      )}
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
