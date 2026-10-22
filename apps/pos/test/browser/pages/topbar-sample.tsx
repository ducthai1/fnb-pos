import { ScreenFrame } from "../../../src/screens/shared/screen-frame";
import { SellingModeSwitch } from "../../../src/screens/till/selling-mode-switch";
import { TillBarNav } from "../../../src/screens/till/till-bar-nav";
import { TillHeader } from "../../../src/screens/till/till-header";
import { TillTools } from "../../../src/screens/till/till-tools";

/**
 * The selling screen's bar with the shop's name as asked (`?bar=`), everything else as a
 * shop usually is: online, all sent (or `?pending=` commands waiting), an open shift. The bar's layout test reads it.
 */
export function TopBarSample({ brandName, pending = 0 }: { brandName: string; pending?: number }) {
  return (
    <TillBarNav
      nav={
        <div className="pos-navbar">
          <SellingModeSwitch mode="counter" onChange={() => {}} />
          <TillTools onOpen={() => {}} />
        </div>
      }
    >
      <ScreenFrame title="Bán hàng" titleHidden wide>
        <TillHeader
          brandName={brandName}
          branchName="Quận 1"
          deviceName="Quầy 1"
          staffName="Lan"
          shiftDate="2026-10-22"
          status={{ connection: "online", pending, needsAttention: 0 }}
          onOpenNeedsAttention={() => {}}
          onSwitchStaff={() => {}}
          onSignOut={() => {}}
        />
      </ScreenFrame>
    </TillBarNav>
  );
}
