import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { vi } from "../../messages/vi";
import { GateMark } from "../shared/gate-mark";
import { ScreenFrame } from "../shared/screen-frame";

const T = vi.adjust.change;

/**
 * While the old item is cancelled (and a manager approves it where the branch asks), then,
 * when the cancel was refused, a card in the middle of the screen that says the order is
 * as it was and what to do next. Backing out of the approval lands on the order, not here.
 */
export function ChangeOptionsScreen(props: {
  header: ReactNode;
  itemName: string;
  /** The sentence of the refusal; null while the cancel is still being made. */
  failure: string | null;
  closing: boolean;
  onRetry(): void;
  onBack(): void;
}) {
  if (props.failure !== null) {
    return (
      <ScreenFrame
        title={T.failedTitle}
        stage="narrow"
        stageMark={<GateMark of={TriangleAlert} tone="danger" />}
      >
        <div className="pos-gate__body" data-change-options-failed>
          <p className="pos-gate__lead pos-wrap" role="alert">
            {props.failure}
          </p>
          <p className="pos-gate__note">{T.unchanged}</p>
          <button
            type="button"
            className="pos-button pos-button--primary pos-button--block pos-gate__action"
            onClick={props.onRetry}
          >
            {T.retry}
          </button>
          <button type="button" className="pos-button pos-button--block" onClick={props.onBack}>
            {vi.adjust.back}
          </button>
        </div>
      </ScreenFrame>
    );
  }
  return (
    <ScreenFrame enter="sheet" leaving={props.closing} title={T.title}>
      {props.header}
      <section className="pos-card pos-approval" aria-label={T.title} aria-busy="true">
        <p className="pos-approval__what pos-wrap">{props.itemName}</p>
        <div className="pos-spinner" />
        <p className="pos-hint">{T.working}</p>
        <p className="pos-hint">{T.workingHint}</p>
      </section>
    </ScreenFrame>
  );
}
