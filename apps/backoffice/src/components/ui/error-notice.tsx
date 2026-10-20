/** A refusal or failure, read out by screen readers when it appears. Nothing when null. */
export function ErrorNotice({ message, id }: { message: string | null; id?: string }) {
  if (message === null) return null;
  return (
    <p className="bo-notice bo-notice--error bo-wrap" role="alert" {...(id === undefined ? {} : { id })}>
      {message}
    </p>
  );
}

/** A confirmation that something worked, announced politely. */
export function SuccessNotice({ message }: { message: string | null }) {
  if (message === null) return null;
  return (
    <p className="bo-notice bo-notice--ok bo-wrap" role="status">
      {message}
    </p>
  );
}
