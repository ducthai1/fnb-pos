import { vi } from "../../messages/vi";
import type { ApiFailure } from "../api/api-result";

/** The sentence for an error code; a code this backoffice does not know shows with its code. */
export function messageForCode(code: string): string {
  return Object.hasOwn(vi.errors.byCode, code)
    ? (vi.errors.byCode[code] as string)
    : vi.errors.unknown(code);
}

/** The sentence a screen shows for a failed call. */
export function failureMessage(failure: Pick<ApiFailure, "status" | "code">): string {
  if (failure.status === null) return vi.errors.network;
  if (failure.code !== null) return messageForCode(failure.code);
  return vi.errors.unexpected(failure.status);
}

/** Whether the failure is the API saying the member's role lacks the key for the page. */
export const isPermissionDenied = (failure: Pick<ApiFailure, "status" | "code">): boolean =>
  failure.status === 403 && failure.code === "API_PERMISSION_DENIED";

/** Whether the session is gone: the page must send the person back to sign in. */
export const isSignedOut = (failure: Pick<ApiFailure, "status" | "code">): boolean =>
  failure.status === 401 && failure.code === "API_AUTH_UNAUTHENTICATED";
