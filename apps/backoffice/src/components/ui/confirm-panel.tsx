"use client";

import { useId } from "react";
import { vi } from "../../messages/vi";
import { ErrorNotice } from "./error-notice";

/**
 * A second step for something that cannot be undone from the page (revoking a till,
 * archiving a product): what will happen, and two buttons. Shown in place, so it works
 * the same on a phone and needs no overlay.
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
}: {
  title: string;
  hint: string;
  confirmLabel: string;
  busyLabel: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  return (
    <div className="bo-card bo-confirm" role="alertdialog" aria-labelledby={titleId}>
      <p id={titleId} className="bo-subtitle bo-wrap">
        {title}
      </p>
      <p className="bo-muted">{hint}</p>
      <ErrorNotice message={error} />
      <div className="bo-row">
        <button type="button" className="bo-button bo-button--danger" disabled={busy} onClick={onConfirm}>
          {busy ? busyLabel : confirmLabel}
        </button>
        <button type="button" className="bo-button" disabled={busy} onClick={onCancel}>
          {vi.common.cancel}
        </button>
      </div>
    </div>
  );
}
