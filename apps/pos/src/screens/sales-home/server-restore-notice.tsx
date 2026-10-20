import type { RestoreState } from "@fnb/sync-client";
import { VI_SERVER_RESTORE } from "../../messages/vi-server-restore";

/**
 * One line while the till sends again what a restored server lost, so nobody mistakes the
 * wait for a fault; and a lasting warning when the till no longer holds some of it.
 */
export function ServerRestoreNotice({ restore }: { restore: RestoreState | undefined }) {
  if (restore === undefined) return null;
  if (restore.unrecoverable > 0) {
    return (
      <p className="pos-alert pos-wrap" role="alert" data-server-restore="unrecoverable">
        {VI_SERVER_RESTORE.unrecoverable(restore.unrecoverable)}
      </p>
    );
  }
  if (restore.resending === 0) return null;
  return (
    <p className="pos-notice pos-wrap" role="status" data-server-restore="resending">
      {VI_SERVER_RESTORE.resending(restore.resending)}
    </p>
  );
}
