import type { ApiFailure } from "../../../lib/api/api-result";
import { isRecord } from "../../../lib/api/read-json-fields";
import { messageForCode } from "../../../lib/errors/failure-message";
import { type DraftErrors, productPath } from "./draft-error-paths";
import { locateDomainError } from "./locate-domain-error";
import type { DraftCombo } from "./product-draft";

const DOMAIN_CODE = /^DOMAIN_/;

/** The text-valued ids of a refusal's details; the API sends ids and nothing else there. */
function idsOf(body: unknown): Record<string, string> {
  const details = isRecord(body) && isRecord(body.details) ? body.details : {};
  return Object.fromEntries(Object.entries(details).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

/**
 * Where a save the API refused by a domain rule belongs in the editor, from the ids the
 * refusal names: the editor checks the same rules first, so this is the rule only the
 * server could judge, or a draft checked by an older editor. Null for any other failure,
 * and for a refusal about the product as a whole, which the save bar already says.
 */
export function serverRefusalErrors(failure: ApiFailure, combo: DraftCombo | null = null): DraftErrors | null {
  if (failure.status !== 400 || failure.code === null || !DOMAIN_CODE.test(failure.code)) return null;
  const path = locateDomainError({ code: failure.code, details: idsOf(failure.body) }, combo);
  return path === productPath() ? null : { [path]: messageForCode(failure.code) };
}
