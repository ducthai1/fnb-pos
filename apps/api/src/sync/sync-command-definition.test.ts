import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SYNC_COMMANDS } from "./sync-command-registry";
import type { SyncCommandContext } from "./sync-command-context";
import { defineSyncCommand, syncCommandRegistry } from "./sync-command-definition";
import { CommandRejection } from "./sync-error-codes";

const echo = defineSyncCommand(
  "test.echo",
  z.object({ orderId: z.string() }),
  async (_c, p) => p.orderId,
);
const context = {} as SyncCommandContext;

describe("sync command definitions", () => {
  it("hand the handler the payload its contract parsed", async () => {
    expect(await echo.apply(context, { orderId: "a", extra: 1 })).toBe("a");
  });

  it("answer a payload the contract refuses as a rejection of that command", async () => {
    const refusal = await echo.apply(context, { orderId: 1 }).catch((error: unknown) => error);
    expect(refusal).toEqual(new CommandRejection("SYNC_INVALID_PAYLOAD"));
  });

  it("refuse two definitions of one type, which would leave one of them unreachable", () => {
    expect(() => syncCommandRegistry([echo, echo])).toThrow("defined twice: test.echo");
  });

  it("register every order command the tills send", () => {
    expect([...SYNC_COMMANDS.keys()].sort()).toEqual([
      "order.apply_discount",
      "order.cancel",
      "order.pay",
      "order.remove_discount",
      "order.save_draft",
      "order.void_line",
    ]);
  });
});
