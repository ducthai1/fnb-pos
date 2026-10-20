import type { SyncCommandEnvelope } from "@fnb/contracts";
import { describe, expect, it } from "vitest";
import { forgetToken, newTillStaffSessions, signInto, tokenForBatch } from "./till-staff-sessions";

const LAN = "0199f000-0000-7000-8000-00000000e001";
const MINH = "0199f000-0000-7000-8000-00000000e002";
const batchOf = (staffSessionId?: string) =>
  [{ ...(staffSessionId === undefined ? {} : { staffSessionId }) }] as SyncCommandEnvelope[];
const session = (sessionId: string | null, token: string) => ({
  staffId: "s",
  token,
  sessionId,
  expiresAt: "2026-10-20T15:00:00.000Z",
});

describe("the credential a batch is pushed with", () => {
  it("is its own session's, after someone else signed in and after signing out", () => {
    const sessions = newTillStaffSessions();
    signInto(sessions, session(LAN, "lan-token"));
    signInto(sessions, session(MINH, "minh-token"));
    expect(tokenForBatch(sessions, batchOf(LAN))).toBe("lan-token");
    expect(tokenForBatch(sessions, batchOf(MINH))).toBe("minh-token");
    sessions.current = null;
    expect(tokenForBatch(sessions, batchOf(LAN))).toBe("lan-token");
  });

  it("is whoever is signed in now for a session the till does not hold, or none named", () => {
    const sessions = newTillStaffSessions();
    signInto(sessions, session(MINH, "minh-token"));
    expect(tokenForBatch(sessions, batchOf(LAN))).toBe("minh-token");
    expect(tokenForBatch(sessions, batchOf())).toBe("minh-token");
    signInto(sessions, session(null, "old-server-token"));
    expect(tokenForBatch(sessions, batchOf())).toBe("old-server-token");
  });

  it("stops being one the server refused, so the session's commands go under the next", () => {
    const sessions = newTillStaffSessions();
    signInto(sessions, session(LAN, "lan-token"));
    signInto(sessions, session(MINH, "minh-token"));
    forgetToken(sessions, "lan-token");
    expect(tokenForBatch(sessions, batchOf(LAN))).toBe("minh-token");
  });
});
