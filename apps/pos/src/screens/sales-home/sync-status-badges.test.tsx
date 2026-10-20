import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TillSyncStatus } from "../../features/sync/till-sync-status";
import { vi as text } from "../../messages/vi";
import { SyncStatusBadges } from "./sync-status-badges";

function badges(status: TillSyncStatus) {
  const opened: number[] = [];
  render(<SyncStatusBadges status={status} onOpenNeedsAttention={() => void opened.push(1)} />);
  return opened;
}

describe("the till's sync badges", () => {
  it.each([
    ["online", text.sync.online],
    ["offline", text.sync.offline],
    ["server_error", text.sync.serverError],
    ["checking", text.sync.checking],
  ] as const)("names the link as %s", (connection, sentence) => {
    badges({ connection, pending: 0, needsAttention: 0 });
    expect(screen.getByText(sentence)).toBeTruthy();
  });

  it("counts the commands not yet synced, and says when there are none", () => {
    badges({ connection: "offline", pending: 12, needsAttention: 0 });
    expect(screen.getByText(text.sync.pending(12))).toBeTruthy();
    expect(screen.queryByText(text.sync.allSynced)).toBeNull();
  });

  it("says all is synced at zero", () => {
    badges({ connection: "online", pending: 0, needsAttention: 0 });
    expect(screen.getByText(text.sync.allSynced)).toBeTruthy();
  });

  it("links to the refused commands only when there are some", () => {
    const opened = badges({ connection: "online", pending: 0, needsAttention: 3 });
    fireEvent.click(screen.getByRole("link", { name: text.sync.needsAttention(3) }));
    expect(opened).toEqual([1]);
  });

  it("shows no needs-attention link at zero", () => {
    badges({ connection: "online", pending: 0, needsAttention: 0 });
    expect(screen.queryByRole("link")).toBeNull();
  });
});
