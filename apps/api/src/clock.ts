/**
 * The API's only source of "now". Lock windows and expiry times are computed from it and
 * passed to the database as values, so tests move time by moving this clock, never by
 * sleeping, and the database's own now() never decides anything.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
