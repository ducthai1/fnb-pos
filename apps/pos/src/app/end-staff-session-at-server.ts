import type { SyncClient } from "@fnb/sync-client";
import type { PosApi } from "../features/api/pos-api";
import type { DeviceCredential } from "../shell-bridge/device-credential-store";
import { type TillStaffSessions, forgetToken } from "./till-staff-sessions";

/**
 * Tells the server a cashier signed out, so their session stops being a credential that lives
 * until it expires. Only when nothing of theirs is still waiting to be sent: those commands
 * are pushed under this very session, and a session the server ended would refuse them. A
 * till that is offline, or a server that does not answer, changes nothing here: the cashier
 * is out on the till already, and the session ends by itself when it expires.
 * Answers whether the server ended it.
 */
export async function endStaffSessionAtServer(options: {
  api: PosApi;
  credential: DeviceCredential;
  client: SyncClient | null;
  sessions: TillStaffSessions;
  session: { readonly sessionId: string | null; readonly token: string };
}): Promise<boolean> {
  const { api, credential, client, sessions, session } = options;
  try {
    if (client !== null) {
      const waiting = await client.pendingCommands();
      // A command with no session of its own goes under whoever signs in next, not under this one.
      if (waiting.some((command) => command.staffSessionId === session.sessionId)) return false;
    }
    const ended = await api.endStaffSession(credential, session.token);
    if (!ended.ok) return false;
    forgetToken(sessions, session.token);
    return ended.value;
  } catch {
    return false;
  }
}
