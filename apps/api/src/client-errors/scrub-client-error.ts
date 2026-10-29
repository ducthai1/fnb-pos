import {
  CLIENT_ERROR_MESSAGE_MAX,
  CLIENT_ERROR_STACK_MAX_BYTES,
  type ClientErrorReport,
} from "@fnb/contracts";
import { maskSecrets } from "../http/server-error-report";

/** A client report as the server keeps it: bounded, with nothing a person could be found by. */
export interface ScrubbedClientError {
  readonly app: ClientErrorReport["app"];
  readonly appVersion: string;
  readonly occurredAt: string;
  readonly kind: ClientErrorReport["kind"];
  readonly message: string;
  readonly stack: string | null;
  readonly route: string | null;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
// Three base64url parts, the first two starting like a JSON object ("eyJ").
const JWT = /\beyJ[\w-]{4,}\.[\w-]{4,}\.[\w-]*/g;
// Nine or more digits, however a phone number or an id card is spaced or dotted.
const LONG_DIGITS = /\+?\d(?:[\s.-]?\d){8,}/g;
// A URL's query and fragment: values the page was showing, never needed to find the fault.
const URL_TAIL = /(\b[a-z][a-z0-9+.-]*:\/\/[^\s?#()'"<>]*|\B\/[^\s?#()'"<>]*)[?#][^\s()'"<>]*/gi;

/** `text` with its URL tails cut and the personal or secret values in it replaced. */
export function scrubText(text: string): string {
  return maskSecrets(text.replace(URL_TAIL, "$1"))
    .replace(JWT, "[token]")
    .replace(EMAIL, "[email]")
    .replace(LONG_DIGITS, "[number]");
}

/** A route or URL without its query string and fragment. */
export function stripQueryAndFragment(route: string): string {
  const cut = route.search(/[?#]/);
  return cut === -1 ? route : route.slice(0, cut);
}

function capBytes(text: string, maxBytes: number): string {
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length <= maxBytes) return text;
  // Decoding a cut inside a character yields U+FFFD at the end; drop it.
  return bytes.subarray(0, maxBytes).toString("utf8").replace(/�$/, "");
}

export function scrubClientError(report: ClientErrorReport): ScrubbedClientError {
  const route = report.route === undefined ? "" : scrubText(stripQueryAndFragment(report.route));
  return {
    app: report.app,
    appVersion: report.appVersion,
    occurredAt: report.occurredAt,
    kind: report.kind,
    message: scrubText(report.message).slice(0, CLIENT_ERROR_MESSAGE_MAX),
    stack:
      report.stack === undefined
        ? null
        : capBytes(scrubText(report.stack), CLIENT_ERROR_STACK_MAX_BYTES),
    route: route === "" ? null : route,
  };
}
