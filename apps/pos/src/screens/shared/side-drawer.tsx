import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { vi } from "../../messages/vi";
import { Icon } from "./icon";
import { useTillKey } from "./use-till-key";

export interface SideDrawerProps {
  title: string;
  /** Which order it is about, under the title. */
  subtitle?: string;
  /** The close button's name: where closing takes the cashier. */
  closeLabel: string;
  /** Something is being recorded: closing now would leave it half done. */
  closeDisabled?: boolean;
  onClose(): void;
  /** The button that finishes the drawer's job, kept in view at its foot. */
  foot?: ReactNode;
  children: ReactNode;
}

/**
 * A panel over the screen it was opened from: from the right on a till, from the bottom on a
 * tablet held upright, the whole screen on a phone. Esc, the close button and a tap beside it
 * close it; focus goes into it on opening and back to where it was on closing.
 */
export function SideDrawer(props: SideDrawerProps) {
  const { closeDisabled = false, onClose } = props;
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  // The opener, read before the screen under the drawer turns inert and loses the focus.
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  useTillKey(vi.sale.keys.back, onClose, !closeDisabled);
  useEffect(() => {
    panel.current?.focus();
    return () => {
      if (opener?.isConnected === true) opener.focus();
    };
  }, [opener]);
  return (
    <div className="pos-drawer-layer">
      <div
        className="pos-drawer-backdrop"
        aria-hidden
        onClick={closeDisabled ? undefined : onClose}
      />
      <section
        ref={panel}
        className="pos-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="pos-drawer__head">
          <div className="pos-drawer__heading">
            <h2 id={titleId} className="pos-drawer__title">
              {props.title}
            </h2>
            {props.subtitle === undefined ? null : (
              <p className="pos-drawer__subtitle pos-wrap">{props.subtitle}</p>
            )}
          </div>
          <button
            type="button"
            className="pos-button pos-button--quiet pos-drawer__close"
            aria-label={props.closeLabel}
            disabled={closeDisabled}
            onClick={onClose}
          >
            <Icon of={X} size={24} />
            <kbd className="pos-kbd" aria-hidden>
              {vi.sale.backKeyCap}
            </kbd>
          </button>
        </header>
        <div className="pos-drawer__body" data-scroll-root>
          {props.children}
        </div>
        {props.foot === undefined ? null : <div className="pos-drawer__foot">{props.foot}</div>}
      </section>
    </div>
  );
}
