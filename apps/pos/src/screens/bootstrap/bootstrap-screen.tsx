import { vi } from "../../messages/vi";
import { Alert, ScreenFrame } from "../shared/screen-frame";

/** Loading the shop's data after pairing or at start; a failure offers a retry. */
export function BootstrapScreen({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  if (error === null) {
    return (
      <ScreenFrame title={vi.bootstrap.loading}>
        <div className="pos-spinner" aria-hidden="true" />
      </ScreenFrame>
    );
  }
  return (
    <ScreenFrame title={vi.bootstrap.failed}>
      <Alert message={error} />
      <button type="button" className="pos-button pos-button--primary" onClick={onRetry}>
        {vi.bootstrap.retry}
      </button>
    </ScreenFrame>
  );
}
