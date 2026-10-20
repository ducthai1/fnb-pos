import type { CSSProperties } from "react";
import { vndText } from "../../lib/format/business-day";
import { type HourBar, busiestHour } from "../../lib/reports/day-figures";
import { vi } from "../../messages/vi";

const T = vi.home;
const D = vi.dailySales;

/** The share of the tallest bar a bar reaches, so the busiest hour fills the chart's height. */
const heightOf = (bar: HourBar, tallest: number) => (tallest === 0 ? 0 : Math.max(2, Math.round((bar.collected / tallest) * 100)));

/**
 * The day's takings hour by hour as columns, drawn with CSS (no chart library): the busiest
 * hour darker with its amount over it. The chart is one image to a screen reader, named by
 * the sentence under it, which says the busiest hour in words for everyone.
 */
export function HourChart({ bars, id }: { bars: readonly HourBar[]; id: string }) {
  const busiest = busiestHour(bars);
  const tallest = busiest?.collected ?? 0;
  const summary =
    busiest === null ? T.hoursEmpty : T.busiest(D.hour(busiest.hour), busiest.orderCount, vndText(busiest.collected));
  return (
    <figure className="bo-hours" aria-labelledby={id}>
      <div className="bo-hours__plot" role="img" aria-label={T.hoursChart(summary)} style={{ "--bars": bars.length } as CSSProperties}>
        {bars.map((bar) => (
          <div key={bar.hour} className="bo-hours__col" data-busiest={bar === busiest || undefined}>
            {bar === busiest && <span className="bo-hours__value">{vndText(bar.collected)}</span>}
            <span
              className="bo-hours__bar"
              style={{ "--h": `${heightOf(bar, tallest)}%` } as CSSProperties}
              title={`${D.hour(bar.hour)}: ${bar.orderCount} · ${vndText(bar.collected)}`}
              data-empty={bar.collected === 0 || undefined}
            />
          </div>
        ))}
      </div>
      <div className="bo-hours__ticks" aria-hidden="true" style={{ "--bars": bars.length } as CSSProperties}>
        {bars.map((bar) => (
          <span key={bar.hour} data-major={bar.hour % 4 === 0 || undefined}>
            {bar.hour % 2 === 0 ? T.hourTick(bar.hour) : ""}
          </span>
        ))}
      </div>
      <figcaption id={id} className="bo-muted bo-wrap">
        {summary}
      </figcaption>
    </figure>
  );
}
