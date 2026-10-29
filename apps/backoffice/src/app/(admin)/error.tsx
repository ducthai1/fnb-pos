"use client";

import { CrashPage } from "../../components/shell/crash-page";
import { useReportRenderError } from "../../components/app/report-render-error";

/** A signed-in page that failed to draw: the frame (bar, menu) stays, the page is replaced. */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useReportRenderError(error);
  return <CrashPage onRetry={reset} />;
}
