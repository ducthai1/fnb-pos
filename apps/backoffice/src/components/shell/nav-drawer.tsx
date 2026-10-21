"use client";

import { type ReactNode, type RefObject, useEffect, useRef } from "react";
import { vi } from "../../messages/vi";

const T = vi.shell;

/** The drawer's id, for the menu button's `aria-controls`. */
export const NAV_DRAWER_ID = "bo-nav-drawer";

/**
 * The menu on a phone or a tablet: a drawer over the content under the bar, opened by the
 * menu button. It takes the focus on its first link; Esc or a tap beside it closes it and
 * gives the focus back to the button, which also closes it (it reads "close menu" then).
 */
export function NavDrawer({
  menuButton,
  onClose,
  children,
}: {
  menuButton: RefObject<HTMLButtonElement | null>;
  onClose(): void;
  children: ReactNode;
}) {
  const drawer = useRef<HTMLElement>(null);

  useEffect(() => drawer.current?.querySelector<HTMLElement>("a[href]")?.focus(), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onClose();
      menuButton.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuButton, onClose]);

  return (
    <>
      <nav id={NAV_DRAWER_ID} ref={drawer} className="bo-drawer" aria-label={T.navigation}>
        {children}
      </nav>
      <div
        className="bo-shell__backdrop"
        aria-hidden="true"
        onClick={() => {
          onClose();
          menuButton.current?.focus();
        }}
      />
    </>
  );
}
