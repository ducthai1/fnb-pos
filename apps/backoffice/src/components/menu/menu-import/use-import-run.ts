"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CatalogApi, Category } from "../../../lib/api/catalog-api";
import type { ImportRow } from "./plan-menu-import";
import { type RowOutcome, runMenuImport } from "./run-menu-import";

export type RunState =
  | { readonly state: "idle" }
  | { readonly state: "running"; readonly done: number; readonly total: number }
  | {
      readonly state: "finished";
      readonly imported: number;
      readonly failed: number;
      readonly stopped: boolean;
    };

/**
 * One import at a time, its progress and each line's outcome. Leaving the page stops it
 * before the next product; `onWritten` runs after every run that wrote something, so the
 * page reads the menu again and the lines now match what was saved.
 */
export function useImportRun(api: CatalogApi, onWritten: () => void) {
  const [state, setState] = useState<RunState>({ state: "idle" });
  const [outcomes, setOutcomes] = useState<ReadonlyMap<number, RowOutcome>>(new Map());
  const stopAsked = useRef(false);
  useEffect(
    () => () => {
      stopAsked.current = true;
    },
    [],
  );

  const start = useCallback(
    (input: { brandId: string; rows: readonly ImportRow[]; categories: readonly Category[] }) => {
      stopAsked.current = false;
      const total = input.rows.length;
      let done = 0;
      let imported = 0;
      setState({ state: "running", done, total });
      void runMenuImport(api, input, {
        stopped: () => stopAsked.current,
        onRow: (line, outcome) => {
          done += 1;
          if (outcome.ok) imported += 1;
          setOutcomes((current) => new Map(current).set(line, outcome));
          setState({ state: "running", done, total });
        },
      }).then((result) => {
        setState({
          state: "finished",
          imported,
          failed: done - imported,
          stopped: result === "stopped",
        });
        if (done > 0) onWritten();
      });
    },
    [api, onWritten],
  );

  const stop = useCallback(() => {
    stopAsked.current = true;
  }, []);

  return { state, outcomes, start, stop };
}
