// @vitest-environment node
import { describe, expect, it } from "vitest";
// The server's own registry, so a command added there without a name here fails this test.
import { SYNC_COMMANDS } from "../../../api/src/sync/sync-command-registry";
import { commandNameOf } from "./vi-sync-errors";

describe("how the needs-attention list names a refused command", () => {
  it.each([...SYNC_COMMANDS.keys()])("gives %s a name in Vietnamese", (type) => {
    expect(commandNameOf(type)).not.toBe(type);
  });
});
