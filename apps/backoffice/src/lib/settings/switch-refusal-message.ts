import { vi } from "../../messages/vi";
import type { ApiFailure } from "../api/api-result";
import type { ConfigScopeKind, SettingsScope } from "../api/settings-api";
import { failureMessage } from "../errors/failure-message";
import { flagViolationOf } from "./flag-violation";

const T = vi.settings;

/** A switch's name as the page shows it; a key this build does not know shows as itself. */
export const settingLabel = (key: string): string =>
  Object.hasOwn(T.flags, key) ? (T.flags[key] as string) : key;

/** The name of a branch or till by its id, null when the page does not know it. */
export type PlaceNames = (kind: ConfigScopeKind, id: string) => string | null;

/**
 * Why a switch write was refused, said about the switches involved: which one needs which,
 * or which two exclude each other, and where they clash when that is not the scope being
 * edited (a brand switch against what one branch or till set). Other refusals keep their
 * own sentence.
 */
export function switchRefusalMessage(failure: ApiFailure, scope: SettingsScope, names: PlaceNames): string {
  const violation = flagViolationOf(failure);
  if (violation === null) return failureMessage(failure);
  const said = T.violation[violation.rule](settingLabel(violation.flag), settingLabel(violation.other));
  if (violation.scopeKind === scope.kind && violation.scopeId === scope.id) return said;
  const name = names(violation.scopeKind, violation.scopeId);
  const place =
    violation.scopeKind === "brand"
      ? T.violation.place.brand
      : T.violation.place[violation.scopeKind](name);
  return `${said} ${T.violation.at(place)}`;
}
