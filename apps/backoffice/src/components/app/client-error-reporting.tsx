"use client";

import { useEffect } from "react";
import type { BackofficeReporter } from "../../lib/client-errors/backoffice-reporter";
import { backofficeReporter } from "../../lib/client-errors/reporter-instance";

/**
 * Reports what the page throws outside React (an event handler, a timer) and what a promise
 * rejects with unhandled; what React itself catches goes through the error pages. Draws
 * nothing. `reporter` is only for tests.
 */
export function ClientErrorReporting({ reporter }: { reporter?: BackofficeReporter }) {
  useEffect(() => {
    const target = reporter ?? backofficeReporter();
    const onError = (event: ErrorEvent) =>
      target.capture({ kind: "error", error: event.error ?? event.message });
    const onRejection = (event: PromiseRejectionEvent) =>
      target.capture({ kind: "unhandled_rejection", error: event.reason });
    const onOnline = () => void target.flush();
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("online", onOnline);
    };
  }, [reporter]);
  return null;
}
