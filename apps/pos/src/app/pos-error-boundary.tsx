import { Component, type ErrorInfo, type ReactNode } from "react";
import type { ClientErrorReporter } from "../features/client-errors/client-error-reporter";
import { CrashScreen } from "../screens/crash/crash-screen";

interface Props {
  readonly reporter?: ClientErrorReporter | undefined;
  readonly onReload: () => void;
  readonly children: ReactNode;
}

/**
 * Catches a failure while the till draws: reports it and shows the recovery screen instead
 * of a blank page. Event handlers and promises are not caught here (React does not route
 * them); the window handlers report those.
 */
export class PosErrorBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    this.props.reporter?.capture({
      kind: "render",
      error,
      ...(info.componentStack ? { extraStack: info.componentStack } : {}),
    });
  }

  override render() {
    return this.state.failed ? <CrashScreen onReload={this.props.onReload} /> : this.props.children;
  }
}
