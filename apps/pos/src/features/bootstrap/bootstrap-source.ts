import type { DeviceCredential } from "../../shell-bridge/device-credential-store";
import {
  type ApiResult,
  type FetchLike,
  requestJson,
  resultOf,
  stringFields,
} from "../api/api-result";
import { deviceAuthorization } from "../api/pos-api";

export interface BootstrapStaff {
  readonly id: string;
  readonly displayName: string;
}

/**
 * What the till needs before anyone signs in. Only the fields this shell reads: the full
 * answer of GET /pos/bootstrap (menu, prices, settings) is wider.
 */
export interface BootstrapSnapshot {
  readonly branch: { readonly id: string; readonly name: string };
  readonly staff: readonly BootstrapStaff[];
  /** The change-feed position the snapshot was read at. */
  readonly cursor: string;
}

export interface BootstrapSource {
  load(credential: DeviceCredential): Promise<ApiResult<BootstrapSnapshot>>;
}

// TO CONNECT AFTER MERGE: GET /pos/bootstrap is being written on the API side at the same
// time as this shell, so the shape below is the minimum both agreed on, checked by hand.
// Once the endpoint lands: parse with its schema from @fnb/contracts instead of
// parseBootstrap, and decide whether `cursor` should seed a fresh LocalStore (today the
// store pulls the change feed from its own cursor and the bootstrap cursor is unused).
export function parseBootstrap(body: unknown): BootstrapSnapshot | null {
  const record = body as { branch?: unknown; staff?: unknown; cursor?: unknown } | null;
  const branch = stringFields(record?.branch, ["id", "name"]);
  if (branch === null || !Array.isArray(record?.staff) || typeof record.cursor !== "string") {
    return null;
  }
  const staff: BootstrapStaff[] = [];
  for (const entry of record.staff) {
    const member = stringFields(entry, ["id", "displayName"]);
    if (member === null) return null;
    staff.push({ id: member.id, displayName: member.displayName });
  }
  return { branch: { id: branch.id, name: branch.name }, staff, cursor: record.cursor };
}

export function httpBootstrapSource(
  baseUrl: string,
  fetchImpl: FetchLike = (u, i) => fetch(u, i),
): BootstrapSource {
  const base = baseUrl.replace(/\/+$/, "");
  return {
    async load(credential) {
      const answer = await requestJson(fetchImpl, `${base}/pos/bootstrap`, {
        method: "GET",
        headers: deviceAuthorization(credential),
      });
      return resultOf(answer, parseBootstrap);
    },
  };
}
