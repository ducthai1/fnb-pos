import { STAFF_MEMBER_ENTITY, posStaffMemberCopySchema } from "@fnb/contracts";
import type { SyncClient } from "@fnb/sync-client";
import { useEffect, useMemo, useState } from "react";
import type { BootstrapStaff } from "./bootstrap-source";

/**
 * The staff of the branch: the bootstrap's, read fresh at every start, with each change of
 * a staff member the change feed brought since. A change that shows nothing (the feed's
 * null) means the person may no longer sign in on this till: they leave the PIN list.
 */
export function useTillStaff(
  bootstrapStaff: readonly BootstrapStaff[],
  client: Pick<SyncClient, "snapshot" | "onChange"> | null,
): readonly BootstrapStaff[] {
  const [changes, setChanges] = useState<ReadonlyMap<string, BootstrapStaff | null>>(new Map());
  useEffect(() => {
    if (client === null) return;
    let live = true;
    const seen = new Map<string, BootstrapStaff | null>();
    // One read at a time, in the order the changes came: a later pass never shows first.
    let reading: Promise<void> = Promise.resolve();
    const unsubscribe = client.onChange((changed) => {
      const ids = changed.filter((ref) => ref.entity === STAFF_MEMBER_ENTITY);
      if (ids.length === 0) return;
      reading = reading
        .then(async () => {
          for (const { entityId } of ids) {
            const view = await client.snapshot(STAFF_MEMBER_ENTITY, entityId);
            const copy = view === null ? null : posStaffMemberCopySchema.safeParse(view.snapshot);
            // A copy of a newer server's shape changes nothing about the person.
            if (copy !== null && !copy.success) continue;
            if (copy === null) seen.set(entityId, null);
            else
              seen.set(entityId, {
                id: copy.data.id,
                displayName: copy.data.displayName,
                active: copy.data.active,
              });
          }
          if (live) setChanges(new Map(seen));
        })
        .catch(console.error);
    });
    return () => {
      live = false;
      unsubscribe();
    };
  }, [client]);
  return useMemo(() => {
    const staff = new Map(bootstrapStaff.map((member) => [member.id, member]));
    for (const [id, member] of changes) {
      if (member === null) staff.delete(id);
      else staff.set(id, member);
    }
    return [...staff.values()];
  }, [bootstrapStaff, changes]);
}
