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
 * in. `load` is null while the page still waits for something (the branch, say).
 */
export function useApiLoad<T>(
  load: (() => Promise<ApiResult<T>>) | null,
): [Loaded<T>, () => void] {
  const session = useSession();
  const [loaded, setLoaded] = useState<Loaded<T>>({ state: "loading" });
  // Answers of an older load (the branch changed meanwhile) must not overwrite a newer one.
  const latest = useRef(0);

  const run = useCallback(() => {
    if (load === null) return;
    const ticket = ++latest.current;
    setLoaded({ state: "loading" });
    void load().then((result) => {
      if (ticket !== latest.current) return;
      if (result.ok) return setLoaded({ state: "ready", value: result.value });
      setLoaded(loadFailure(result, session.signedOut));
    });
  }, [load, session.signedOut]);

  useEffect(run, [run]);
  return [loaded, run];
}

export function loadFailure(failure: ApiFailure, signedOut: () => void): Loaded<never> {
  if (isSignedOut(failure)) signedOut();
  if (isPermissionDenied(failure)) return { state: "denied" };
  return { state: "failed", message: failureMessage(failure) };
}
