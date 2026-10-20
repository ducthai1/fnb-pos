"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiFailure, ApiResult } from "../../lib/api/api-result";
import { failureMessage, isPermissionDenied, isSignedOut } from "../../lib/errors/failure-message";
import { useSession } from "./session-context";

export type Loaded<T> =
  | { readonly state: "loading" }
  | { readonly state: "ready"; readonly value: T }
  | { readonly state: "denied" }
  | { readonly state: "failed"; readonly message: string };

/**
 * What a page reads from the API, as a state the page can show. A 403 for a missing key
 * is its own state (the page explains it), and a lost session sends the person to sign
 * in. `load` is null while the page still waits for something (the branch, say). The
 * third element reloads without blanking what is shown: for refreshes nobody asked for.
 */
export function useApiLoad<T>(
  load: (() => Promise<ApiResult<T>>) | null,
): [Loaded<T>, () => void, () => void] {
  const session = useSession();
  const [loaded, setLoaded] = useState<Loaded<T>>({ state: "loading" });
  // Answers of an older load (the branch changed meanwhile) must not overwrite a newer one.
  const latest = useRef(0);

  const run = useCallback(
    (quiet: boolean) => {
      if (load === null) return;
      const ticket = ++latest.current;
      if (!quiet) setLoaded({ state: "loading" });
      void load().then((result) => {
        if (ticket !== latest.current) return;
        if (result.ok) return setLoaded({ state: "ready", value: result.value });
        // A quiet refresh that fails keeps what is on screen; the next one may work.
        if (!quiet) setLoaded(loadFailure(result, session.signedOut));
      });
    },
    [load, session.signedOut],
  );

  useEffect(() => run(false), [run]);
  const reload = useCallback(() => run(false), [run]);
  const refresh = useCallback(() => run(true), [run]);
  return [loaded, reload, refresh];
}

export function loadFailure(failure: ApiFailure, signedOut: () => void): Loaded<never> {
  if (isSignedOut(failure)) signedOut();
  if (isPermissionDenied(failure)) return { state: "denied" };
  return { state: "failed", message: failureMessage(failure) };
}
