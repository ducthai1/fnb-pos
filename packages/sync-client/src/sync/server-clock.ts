/**
 * How far the server's clock is ahead of the till's (below 0: the till runs fast), from one
 * answer that named it: the server read its clock somewhere between the till sending the
 * request and the answer arriving, so it is set against the middle of the two. The error is
 * at most half the round trip, a second at worst, far inside the two minutes that matter.
 */
export function clockOffsetOf(serverTimeMs: number, sentAtMs: number, answeredAtMs: number) {
  return Math.round(serverTimeMs - (sentAtMs + answeredAtMs) / 2);
}
