import type { SyncClient } from "@fnb/sync-client";
import { type ReactNode, useState } from "react";
import { useServerClose } from "../features/shift/server-closed-shift";
import { vi } from "../messages/vi";
import { RoundSlipsScreen } from "../screens/table-order/round-slips-screen";
import type { ShiftClosing } from "./close-shift-flow";

const T = vi.closeShift;

/**
 * The slip of a shift just closed. One printed from the till's own numbers (the server had
 * not answered) offers the official copy as soon as the closed shift arrives from the server,
 * and says so while it has not.
 */
export function ClosedShiftSlips(props: {
  client: Pick<SyncClient, "snapshot" | "pendingCommands" | "rejectedCommands" | "onChange"> | null;
  header: ReactNode;
  closing: ShiftClosing;
  onChange(closing: ShiftClosing): void;
  onNext(): void;
}) {
  const { closing } = props;
  const provisional = closing.provisional;
  const answer = useServerClose(
    props.client,
    provisional?.shiftId ?? "",
    provisional?.commandId ?? null,
  );
  const [printing, setPrinting] = useState(false);
  const ready = provisional !== undefined && answer.kind === "closed";
  async function printOfficial() {
    if (provisional === undefined || answer.kind !== "closed") return;
    setPrinting(true);
    try {
      const slips = await provisional.print(answer.shift);
      props.onChange({ slips: [...(closing.slips ?? []), ...slips], said: T.officialDone });
    } catch (error) {
      console.error(error);
      setPrinting(false);
    }
  }
  return (
    <RoundSlipsScreen
      header={props.header}
      title={T.doneTitle}
      slips={closing.slips}
      notice={closing.said === "" ? undefined : closing.said}
      backLabel={T.openNext}
      extra={
        provisional === undefined
          ? undefined
          : {
              label: ready ? T.printOfficial : T.officialWaiting,
              disabled: !ready || printing,
              onClick: () => void printOfficial(),
            }
      }
      onBack={props.onNext}
    />
  );
}
