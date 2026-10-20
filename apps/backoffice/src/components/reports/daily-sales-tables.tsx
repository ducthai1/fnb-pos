import type { DailySalesReport } from "../../lib/api/reports-api";
import { quantityText, vndText } from "../../lib/format/business-day";
import { vi } from "../../messages/vi";
import { SimpleTable, type TableRow } from "../ui/simple-table";

const T = vi.dailySales;
const rateText = (rate: number) => String(rate / 100).replace(".", ",");

/**
 * The day's totals exactly as the server added them up: every figure is the report's own,
 * written with the domain's money format; nothing is summed or derived on the page.
 */
function SummaryTable({ report }: { report: DailySalesReport }) {
  const { sales, refunds, voids } = report;
  const line = (key: string, label: string, value: string): TableRow => ({
    key,
    cells: [label, value],
    data: { "data-figure": key },
  });
  const rows: TableRow[] = [
    line("orderCount", T.rows.orderCount, String(sales.orderCount)),
    line("gross", T.rows.gross, vndText(sales.gross)),
    line("discount", T.rows.discount, vndText(sales.discount)),
    line("net", T.rows.net, vndText(sales.net)),
    line("serviceCharge", T.rows.serviceCharge, vndText(sales.serviceCharge)),
    line("netExcludingTax", T.rows.netExcludingTax, vndText(sales.netExcludingTax)),
    ...sales.taxByRate.map((group) =>
      line(`tax-${group.rate}`, `${T.taxRate(rateText(group.rate))} ${T.taxRow(vndText(group.base))}`, vndText(group.tax)),
    ),
    line("tax", T.rows.tax, vndText(sales.tax)),
    line("collected", T.rows.collected, vndText(sales.collected)),
    line("refundCount", T.rows.refundCount, String(refunds.orderCount)),
    line("refundCollected", T.rows.refundCollected, vndText(refunds.collected)),
    line("refundTax", T.rows.refundTax, vndText(refunds.tax)),
    line("cancelledOrders", T.rows.cancelledOrders, String(report.cancelledOrders)),
    line("voidCount", T.rows.voidCount, String(voids.count)),
    line("voidValue", T.rows.voidValue, vndText(voids.value)),
  ];
  return (
    <SimpleTable
      caption={T.summaryTitle}
      columns={[{ label: T.summaryColumns.figure }, { label: T.summaryColumns.value, numeric: true }]}
      rows={rows}
      empty={T.empty}
    />
  );
}

/** The report's tables: totals, by payment method, by hour, by item. */
export function DailySalesTables({ report }: { report: DailySalesReport }) {
  const P = T.paymentColumns;
  const H = T.hourColumns;
  const I = T.itemColumns;
  return (
    <div className="bo-stack">
      {report.sales.orderCount === 0 && report.refunds.orderCount === 0 && <p className="bo-muted">{T.emptyDay}</p>}
      <div className="bo-card">
        <SummaryTable report={report} />
        <p className="bo-muted bo-wrap">{T.definitions}</p>
      </div>
      <div className="bo-card">
        <SimpleTable
          caption={T.paymentsTitle}
          columns={[{ label: P.method }, { label: P.sales, numeric: true }, { label: P.refunds, numeric: true }, { label: P.net, numeric: true }]}
          rows={report.payments.map((payment) => ({
            key: payment.method,
            cells: [T.methods[payment.method] ?? payment.method, vndText(payment.sales), vndText(payment.refunds), vndText(payment.net)],
            data: { "data-method": payment.method },
          }))}
          empty={T.empty}
        />
      </div>
      <div className="bo-card">
        <SimpleTable
          caption={T.hoursTitle}
          columns={[{ label: H.hour }, { label: H.orderCount, numeric: true }, { label: H.collected, numeric: true }]}
          rows={report.byHour.map((hour) => ({
            key: String(hour.hour),
            cells: [T.hour(hour.hour), String(hour.orderCount), vndText(hour.collected)],
          }))}
          empty={T.empty}
        />
      </div>
      <div className="bo-card">
        <SimpleTable
          caption={T.itemsTitle}
          columns={[
            { label: I.name },
            { label: I.quantity, numeric: true },
            { label: I.gross, numeric: true },
            { label: I.discount, numeric: true },
            { label: I.net, numeric: true },
            { label: I.tax, numeric: true },
          ]}
          rows={report.items.map((item, index) => ({
            key: `${index}`,
            cells: [
              T.lineTypes[item.lineType] === undefined ? item.name : `${item.name} (${T.lineTypes[item.lineType]})`,
              quantityText(item.quantity),
              vndText(item.gross),
              vndText(item.discount),
              vndText(item.net),
              vndText(item.tax),
            ],
          }))}
          empty={T.empty}
        />
      </div>
    </div>
  );
}
