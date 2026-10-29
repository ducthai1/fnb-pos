"use client";

import { CrashPage } from "../components/shell/crash-page";
import { useReportRenderError } from "../components/app/report-render-error";

/** A page outside the signed-in frame (sign-in) that failed to draw. */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useReportRenderError(error);
  return (
    <main className="bo-splash">
      <CrashPage onRetry={reset} />
    </main>
  );
}
