"use client";

import { CrashPage } from "../components/shell/crash-page";
import { useReportRenderError } from "../components/app/report-render-error";
import "@fontsource/be-vietnam-pro/vietnamese-400.css";
import "@fontsource/be-vietnam-pro/latin-400.css";
import "@fontsource/be-vietnam-pro/vietnamese-600.css";
import "@fontsource/be-vietnam-pro/latin-600.css";
import "./backoffice-tokens.css";
import "./backoffice-base.css";
import "./backoffice-controls.css";
import "./backoffice-page.css";
import "./backoffice-states.css";

/**
 * The last resort: the root layout itself failed, so this page brings its own <html> and
 * styles. It still reports the fault, as far as the page can send it.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useReportRenderError(error);
  return (
    <html lang="vi">
      <body>
        <main className="bo-splash">
          <CrashPage onRetry={reset} />
        </main>
      </body>
    </html>
  );
}
