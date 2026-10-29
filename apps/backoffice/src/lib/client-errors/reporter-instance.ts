import { httpClientErrorsApi } from "../api/client-errors-api";
import { API_BASE } from "../api/backoffice-api";
import { type BackofficeReporter, createBackofficeReporter } from "./backoffice-reporter";

/** The release this page was built as (see next.config.ts); "dev" under the dev server. */
export const APP_VERSION: string = process.env.NEXT_PUBLIC_FNB_RELEASE_ID ?? "dev";

let instance: BackofficeReporter | null = null;

/** The page's one reporter, made on first use (never on the server, which has no storage). */
export function backofficeReporter(): BackofficeReporter {
  instance ??= (() => {
    const api = httpClientErrorsApi(API_BASE, (url, init) => fetch(url, init));
    return createBackofficeReporter({
      storage: window.sessionStorage,
      send: (reports) => api.reportClientErrors(reports),
      appVersion: APP_VERSION,
      now: () => Date.now(),
      route: () => window.location.pathname,
    });
  })();
  return instance;
}
