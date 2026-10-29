import { describe, expect, it } from "vitest";
import { AUTO_APPLY_IDLE_MS, type UpdateSituation, decideUpdate } from "./update-policy";

const quiet: UpdateSituation = {
  updateAvailable: true,
  shiftOpen: false,
  pendingCommands: 0,
  dialogOpen: false,
  idleMs: AUTO_APPLY_IDLE_MS,
};
const decide = (change: Partial<UpdateSituation>) => decideUpdate({ ...quiet, ...change });

describe("when the till reloads into a new release", () => {
  it("does nothing while it runs the served release", () => {
    expect(decide({ updateAvailable: false })).toEqual({ action: "none" });
  });

  it("applies by itself with no shift, nothing unsent, nothing open and nobody at it", () => {
    expect(decide({})).toEqual({ action: "apply" });
  });

  it("never applies while commands are unsent, whatever else is true", () => {
    expect(decide({ pendingCommands: 1 })).toEqual({ action: "wait" });
    expect(decide({ pendingCommands: null })).toEqual({ action: "wait" });
    expect(decide({ shiftOpen: true, pendingCommands: 3 })).toEqual({
      action: "banner",
      blockedBy: "outbox",
    });
  });

  it("never applies while a payment or dialog is open", () => {
    expect(decide({ dialogOpen: true })).toEqual({ action: "wait" });
    expect(decide({ shiftOpen: true, dialogOpen: true })).toEqual({
      action: "banner",
      blockedBy: "dialog",
    });
  });

  it("waits for the till to be idle, and for the shift to be known", () => {
    expect(decide({ idleMs: AUTO_APPLY_IDLE_MS - 1 })).toEqual({ action: "wait" });
    expect(decide({ shiftOpen: null })).toEqual({ action: "wait" });
  });

  it("with a shift open shows the banner and lets the button work only when nothing blocks", () => {
    expect(decide({ shiftOpen: true })).toEqual({ action: "banner", blockedBy: null });
    expect(decide({ shiftOpen: true, idleMs: 0 })).toEqual({ action: "banner", blockedBy: null });
  });

  it("applies once the shift is closed", () => {
    expect(decide({ shiftOpen: true }).action).toBe("banner");
    expect(decide({ shiftOpen: false }).action).toBe("apply");
  });
});
