import type { TableLayout } from "./floor-occupancy";

/** The part of the floor editor's plane an area's tables stand in. */
export interface PlanBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** A table's place in its area's box, each side as a percentage of the box. */
export interface PlanSpot {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The smallest box holding every table of an area, so the plan is drawn from its first
 * table rather than from the editor's corner; null when there is no table, or one has no
 * place (the till then lists the area in a grid instead of guessing where it stands).
 */
export function planBoxOf(
  tables: readonly { readonly layout: TableLayout | null }[],
): PlanBox | null {
  if (tables.length === 0) return null;
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = 0;
  let bottom = 0;
  for (const { layout } of tables) {
    if (layout === null) return null;
    left = Math.min(left, layout.x);
    top = Math.min(top, layout.y);
    right = Math.max(right, layout.x + layout.width);
    bottom = Math.max(bottom, layout.y + layout.height);
  }
  return { left, top, width: right - left, height: bottom - top };
}

/** How many tables side by side a plan may span and still be read at a till's width. */
const READABLE_SPAN = 10;

/**
 * Whether the plan can be read when drawn to the screen's width: no table narrower or
 * shorter than a tenth of the plan. One table far from the rest shrinks every table to a
 * dot, so such a floor opens as a grid (the plan is still one tap away).
 */
export function planReadable(
  box: PlanBox,
  tables: readonly { readonly layout: TableLayout | null }[],
): boolean {
  return tables.every(
    ({ layout }) =>
      layout !== null &&
      layout.width * READABLE_SPAN >= box.width &&
      layout.height * READABLE_SPAN >= box.height,
  );
}

export function spotIn(box: PlanBox, layout: TableLayout): PlanSpot {
  const percent = (part: number, whole: number) => (part / whole) * 100;
  return {
    left: percent(layout.x - box.left, box.width),
    top: percent(layout.y - box.top, box.height),
    width: percent(layout.width, box.width),
    height: percent(layout.height, box.height),
  };
}
