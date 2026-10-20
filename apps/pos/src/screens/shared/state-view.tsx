import { CircleAlert, Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { Icon } from "./icon";

export interface StateViewProps {
  title: string;
  body?: string;
  action?: ReactNode;
}

/** Nothing to show yet: what is missing, and where it comes from. */
export function EmptyState(props: StateViewProps) {
  return (
    <div className="pos-state" data-tone="empty">
      <span className="pos-state__icon">
        <Icon of={Inbox} size={28} />
      </span>
      <StateText {...props} />
    </div>
  );
}

/** Could not load: says so in words (read out at once) and offers the way to try again. */
export function ErrorState(props: StateViewProps) {
  return (
    <div className="pos-state" data-tone="error" role="alert">
      <span className="pos-state__icon">
        <Icon of={CircleAlert} size={28} />
      </span>
      <StateText {...props} />
    </div>
  );
}

/** Still loading: a spinner with the words for what is awaited. */
export function LoadingState(props: { title: string }) {
  return (
    <div className="pos-state" data-tone="loading" aria-busy="true">
      <div className="pos-spinner" aria-hidden="true" />
      <p className="pos-state__title">{props.title}</p>
    </div>
  );
}

function StateText({ title, body, action }: StateViewProps) {
  return (
    <>
      <p className="pos-state__title">{title}</p>
      {body === undefined ? null : <p className="pos-state__body">{body}</p>}
      {action}
    </>
  );
}
