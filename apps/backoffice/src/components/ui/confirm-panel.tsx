"use client";

import { TriangleAlert } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { vi } from "../../messages/vi";
import { ErrorNotice } from "./error-notice";
import { Icon } from "./icon";
import { FieldAttemptContext } from "./text-field";

/**
 * The one second step for everything that cannot be undone from the page (revoking a till,
 * archiving a product or a role, locking a member, handing money back): what will happen,
 * anything the step needs asked (`children`), and two buttons, the one that acts a solid red
 * that always reads as a button that can be pressed. Shown in place, so it works the same on
 * a phone and needs no overlay; it comes into view as it opens.
 */
export function ConfirmPanel({
  title,
  hint,
  confirmLabel,
  busyLabel,
  busy,
  error,
  onConfirm,
  onCancel,
  children,
  tone = "destructive",
}: {
  title: string;
  hint?: string | undefined;
  confirmLabel: string;
  busyLabel: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
  /** A step that changes something that can be changed back (save, unlock) is not red. */
  tone?: "destructive" | "change";
}) {
  const titleId = useId();
  const hintId = useId();
  const panel = useRef<HTMLDivElement>(null);
  // The fields of the step show their errors once its button was pressed.
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    panel.current?.scrollIntoView?.({ block: "nearest" });
  }, []);
  return (
    <div
      ref={panel}
      className="bo-card bo-confirm"
      data-tone={tone}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={hint === undefined ? undefined : hintId}
    >
      <div className="bo-confirm__head">
        {tone === "destructive" && (
          <span className="bo-confirm__sign" aria-hidden="true">
            <Icon of={TriangleAlert} size={20} />
          </span>
        )}
        <div className="bo-confirm__text">
          <p id={titleId} className="bo-subtitle bo-wrap bo-confirm__title">
            {title}
          </p>
          {hint !== undefined && (
            <p id={hintId} className="bo-muted bo-wrap">
              {hint}
            </p>
          )}
        </div>
      </div>
      <FieldAttemptContext.Provider value={attempted}>{children}</FieldAttemptContext.Provider>
      <ErrorNotice message={error} />
      <div className="bo-confirm__actions">
        <button type="button" className="bo-button" disabled={busy} onClick={onCancel}>
          {vi.common.cancel}
        </button>
        <button
          type="button"
          className={`bo-button ${tone === "destructive" ? "bo-button--destructive" : "bo-button--primary"}`}
          aria-busy={busy || undefined}
          disabled={busy}
          onClick={() => {
            setAttempted(true);
            onConfirm();
          }}
        >
          {busy ? busyLabel : confirmLabel}
        </button>
      </div>
    </div>
  );
}
