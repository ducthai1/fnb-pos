import { expect } from "vitest";

/**
 * Reads the database again until it holds what the till has just sent. The till's "all
 * synced" line can already be on screen before a command it is about to send enters its
 * outbox, so waiting for that line alone reads too early on a slow machine.
 */
export const onceTheServerHasIt = <T>(read: () => Promise<T>) =>
  expect.poll(read, { timeout: 60_000, interval: 250 });
