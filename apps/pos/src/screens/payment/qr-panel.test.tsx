import type { PaymentAccount } from "@fnb/contracts";
import { formatVnd, vnd } from "@fnb/domain";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { QrPhase } from "../../features/payment/qr-intent-phase";
import { vi as text } from "../../messages/vi";
import { QrPanel } from "./qr-panel";

const Q = text.qr;
const money = (n: number) => formatVnd(vnd(n));
const account: PaymentAccount = {
  bankBin: "970436",
  accountNumber: "0011004455667",
  accountName: "QUAN CA PHE",
};

function panelAt(phase: QrPhase) {
  const calls = { cashForRest: 0, qrForRest: 0, left: 0 };
  render(
    <QrPanel
      amount={vnd(50_000)}
      account={account}
      qr={{ contentCode: "FNB12345678", payload: "000201" }}
      phase={phase}
      error={null}
      busy={false}
      onLeave={() => void calls.left++}
      onRenew={() => undefined}
      onRetryPay={() => undefined}
      onCloseWithSettledQr={() => undefined}
      onCashForRest={() => void calls.cashForRest++}
      onQrForRest={() => void calls.qrForRest++}
    />,
  );
  return calls;
}

describe("the QR panel when the bank brought too little", () => {
  it("offers the rest in cash or a QR for exactly the rest", () => {
    const calls = panelAt({ kind: "short", gap: vnd(5_000) });
    expect(screen.getByRole("status").textContent).toContain(Q.phases.short(money(5_000)));
    fireEvent.click(screen.getByRole("button", { name: Q.cashForRest(money(5_000)) }));
    fireEvent.click(screen.getByRole("button", { name: Q.qrForRest(money(5_000)) }));
    expect(calls).toMatchObject({ cashForRest: 1, qrForRest: 1 });
    expect(screen.getByRole("button", { name: Q.otherMethod })).toBeTruthy();
  });

  it("offers neither while the QR waits or once it was paid exactly", () => {
    panelAt({ kind: "waiting", secondsLeft: 600 });
    expect(screen.queryByRole("button", { name: /Thu nốt/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /QR cho phần còn lại/ })).toBeNull();
  });
});
