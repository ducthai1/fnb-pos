import { v7 } from "uuid";

/**
 * A new record id, made on the till: UUIDv7 like the server's, so orders, lines and
 * commands recorded offline already have the ids the server keeps, sorted by creation.
 */
export function newId(): string {
  return v7();
}
