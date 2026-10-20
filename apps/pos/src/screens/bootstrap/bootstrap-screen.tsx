import { RotateCcw } from "lucide-react";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";
import { Alert, ScreenFrame } from "../shared/screen-frame";

/** Loading the shop's data after pairing or at start; a failure offers a retry. */
export function BootstrapScreen({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  if (error === null) {
    return (
      <ScreenFrame title={vi.bootstrap.loading} width="narrow">
        <div className="pos-spinner" aria-hidden="true" />
      </ScreenFrame>
    );
  }
  return (
    <ScreenFrame title={vi.bootstrap.failed} width="narrow">
      <div className="pos-signin">
        <Alert message={error} />
        <button
          type="button"
          className="pos-button pos-button--primary pos-button--block"
          onClick={onRetry}
        >
          <Icon of={RotateCcw} />
          {vi.bootstrap.retry}
        </button>
      </div>
    </ScreenFrame>
  );
}
