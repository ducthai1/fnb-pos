import type { WalletPaymentAnswer, WalletPaymentBody } from "@fnb/contracts";
import { type ReactNode, createContext, useContext } from "react";
import type { ApiResult } from "../api/api-result";
import type { TillAuthority } from "./till-authority";

export interface TillPermissions {
  readonly authority: TillAuthority;
  /** The server no longer knows the staff session: back to the PIN screen. */
  onSessionExpired(): void;
  /** Opens an e-wallet payment on the server, as the staff member signed in. */
  openWalletPayment?(body: WalletPaymentBody): Promise<ApiResult<WalletPaymentAnswer>>;
}

const Context = createContext<TillPermissions | null>(null);

/** Who is at the till and what they may do, for every screen of the signed-in till. */
export function TillPermissionsProvider(props: { value: TillPermissions; children: ReactNode }) {
  return <Context.Provider value={props.value}>{props.children}</Context.Provider>;
}

export function useTillPermissions(): TillPermissions {
  const permissions = useContext(Context);
  if (permissions === null) throw new Error("useTillPermissions outside a signed-in till");
  return permissions;
}
