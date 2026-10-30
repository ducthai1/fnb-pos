import { CircleAlert, Eye, Printer } from "lucide-react";
import type { PrintedSlip } from "../../features/printing/print-sale-slips";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";
import { SlipPaper } from "./slip-paper";

const T = vi.checkout.done;


function slipStatus(slip: PrintedSlip): string {
  switch (slip.outcome.status) {
    case "preview_only":
      return T.previewOnly;
    case "printed":
      return T.printed;
    case "failed":
      return T.printFailed(slip.outcome.errorCode);
  }
}

const LOOK = {
  preview_only: { tone: "info", glyph: Eye },
  printed: { tone: "ok", glyph: Printer },
  failed: { tone: "danger", glyph: CircleAlert },
} as const;

/** Each slip as it prints, with whether the printer took it. Null: still printing. */
export function PrintedSlipList({ slips }: { slips: readonly PrintedSlip[] | null }) {
  return (
    <section className="pos-slips" aria-label={T.slips}>
      {slips === null ? <p className="pos-hint">{T.printing}</p> : null}
      {(slips ?? []).map((slip) => {
        const look = LOOK[slip.outcome.status];
        return (
          <article
            key={slip.job.jobId}
            className="pos-card pos-slip"
            data-print-status={slip.outcome.status}
            data-slip-kind={slip.job.kind}
          >
            <h2 className="pos-slip__title">{T.slipNames[slip.job.kind]}</h2>
            <p className="pos-badge pos-slip__status pos-wrap" data-tone={look.tone}>
              <Icon of={look.glyph} size={16} />
              {slipStatus(slip)}
            </p>
            {/* Drawn as the paper comes out of the printer: its own columns, its own width. */}
            <SlipPaper preview={slip.job.preview} />
          </article>
        );
      })}
    </section>
  );
}
