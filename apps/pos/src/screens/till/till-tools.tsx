import { vi } from "../../messages/vi";

/** The till's own tools beside selling: the day's orders (more come with the shift's). */
export function TillTools(props: { onHistory(): void }) {
  return (
    <nav className="pos-till-tools" aria-label={vi.history.title}>
      <button type="button" className="pos-button" onClick={props.onHistory}>
        {vi.history.open}
      </button>
    </nav>
  );
}
