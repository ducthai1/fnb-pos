// What the browser test pages leave on `window` for the Node side to read.

export interface BrowserCaseResult {
  readonly id: string;
  readonly ok: boolean;
  readonly error?: string;
}

/** A case only the browser has: how the till database is opened on OPFS. */
export const OPFS_PRAGMAS_CASE =
  "the till database on OPFS runs WAL, exclusive locking and FULL sync";

/** window.__contractRun once the page has run every case. */
export interface ContractPageRun {
  readonly results: readonly BrowserCaseResult[];
}

/** window.__singleTab: what this tab got when it opened the till's database. */
export type SingleTabOutcome =
  | { readonly opened: true; readonly pending: number }
  | { readonly opened: false; readonly code: string | null; readonly message: string };
