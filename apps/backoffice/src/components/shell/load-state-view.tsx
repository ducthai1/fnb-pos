"use client";

import { Lock, RefreshCw, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { vi } from "../../messages/vi";
import { ErrorNotice } from "../ui/error-notice";
import { Icon } from "../ui/icon";
import type { Loaded } from "./use-api-load";

const T = vi.shell;

/** A page the member's role may not see: says so instead of an empty or broken page. */
export function PermissionDenied() {
  return (
    <section className="bo-card bo-state-card" aria-labelledby="permission-denied">
      <span className="bo-state-card__icon">
        <Icon of={Lock} size={24} />
      </span>
      <h2 id="permission-denied" className="bo-subtitle">
        {T.permissionDeniedTitle}
      </h2>
      <p className="bo-muted">{T.permissionDeniedHint}</p>
    </section>
  );
}

/** The loading, refused and failed states of a load; `children` renders the value. */
export function LoadStateView<T>({
  loaded,
  retry,
  children,
}: {
  loaded: Loaded<T>;
  retry: () => void;
  children: (value: T) => ReactNode;
}) {
  if (loaded.state === "loading") return <p className="bo-muted bo-loading">{T.loading}</p>;
  if (loaded.state === "denied") return <PermissionDenied />;
  if (loaded.state === "failed") {
    return (
      <div className="bo-card bo-state-card" data-state="failed">
        <span className="bo-state-card__icon">
          <Icon of={TriangleAlert} size={24} />
        </span>
        <ErrorNotice message={loaded.message} />
        <button type="button" className="bo-button" onClick={retry}>
          <Icon of={RefreshCw} size={16} />
          {T.retry}
        </button>
      </div>
    );
  }
  return <>{children(loaded.value)}</>;
}
