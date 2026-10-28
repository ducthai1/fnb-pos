import type { PosProduct } from "@fnb/contracts";
import { formatVnd, measureUnitOf, vnd } from "@fnb/domain";
import { useState } from "react";
import { unitPriceOf } from "../features/menu/menu-prices";
import type { TillMenu } from "../features/menu/till-menu";
import { type CartLine, withEntry } from "../features/order/counter-order";
import type { EntryKind } from "../features/order/line-entry-input";
import type { WeighingScale } from "../features/order/weighing-scale";
import { useApprovalGate } from "../features/permissions/use-approval-gate";
import { useTillPermissions } from "../features/permissions/till-permissions-context";
import { vi } from "../messages/vi";
import { LineEntryDrawer } from "../screens/sale/line-entry-drawer";
import { CoverLayer } from "../screens/shared/under-layer";

/** A line waiting for its price or weight: a product just tapped, or a line typed again. */
export interface PendingEntry {
  readonly kind: EntryKind;
  readonly product: PosProduct;
  /** The line as it will be added (or as it is on the order, when `editing`). */
  readonly line: CartLine;
  readonly editing: boolean;
}

export interface LineEntryFlowProps {
  menu: TillMenu;
  now: number;
  /** The order the line goes on: a typed price's approval is for this order and line only. */
  orderId: string;
  pending: PendingEntry;
  scale?: WeighingScale | undefined;
  onCancel(): void;
  /** The line with what was typed: added to the order, or put in place of the one edited. */
  onDone(line: CartLine): void;
}

/**
 * Takes the price or the weight of a line in a drawer over the order. A typed price the
 * staff member may not type alone goes to a manager first, for exactly that price on this
 * line of this order (the server checks the same three); a weight needs nobody.
 */
export function LineEntryFlow(props: LineEntryFlowProps) {
  const { pending, menu } = props;
  const { line, product } = pending;
  const gate = useApprovalGate();
  const { authority } = useTillPermissions();
  const [typed, setTyped] = useState(() => initialDigits(line));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (gate.sheet !== null) return <CoverLayer>{gate.sheet}</CoverLayer>;

  const unit = measureUnitOf(product);
  const per = perUnit(menu, product, line, props.now);
  const actionFor = (price: number) =>
    ({
      key: "open_price",
      enteredPrice: vnd(price),
      subject: { orderId: props.orderId, lineId: line.lineId },
    }) as const;
  const needsManager =
    pending.kind === "price" && authority.decide(actionFor(0)) === "needs_approval";

  async function confirm(value: number) {
    setError(null);
    if (pending.kind === "weight") return props.onDone(withEntry(line, { kind: "weight", grams: value }));
    const price = vnd(value);
    // The same price again is no new price: nothing to approve, nothing changes.
    if (pending.editing && line.enteredPrice === price) return props.onCancel();
    setBusy(true);
    const outcome = await gate.require(
      actionFor(value),
      vi.sale.entry.approvalFor(product.name, formatVnd(price)),
    );
    setBusy(false);
    if (outcome.kind === "denied") return setError(vi.approval.denied);
    if (outcome.kind === "cancelled") return;
    const approvalId = outcome.kind === "approved" ? outcome.approvalId : null;
    props.onDone(withEntry(line, { kind: "price", price, approvalId }));
  }

  return (
    <LineEntryDrawer
      product={product}
      kind={pending.kind}
      per={unit === null || per === null ? undefined : { price: per, unit }}
      typed={typed}
      onType={setTyped}
      editing={pending.editing}
      needsManager={needsManager}
      error={error}
      busy={busy}
      scale={props.scale}
      onConfirm={(value) => void confirm(value)}
      onClose={props.onCancel}
    />
  );
}

/** What a line typed again starts from: its price or its grams; empty for a new line. */
function initialDigits(line: CartLine): string {
  if (line.grams !== undefined) return String(line.grams);
  return line.enteredPrice === undefined ? "" : String(line.enteredPrice);
}

/** A weighed product's price per unit for the line's size, as the domain resolves it now. */
function perUnit(menu: TillMenu, product: PosProduct, line: CartLine, at: number) {
  if (product.pricingMode !== "weighed") return null;
  try {
    return unitPriceOf(menu, product, line.variantId, at).unitPrice;
  } catch {
    return null;
  }
}
