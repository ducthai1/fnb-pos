import { type ReactNode, createContext, useContext } from "react";
import type { TillAuthority } from "./till-authority";

export interface TillPermissions {
  readonly authority: TillAuthority;
  /** The server no longer knows the staff session: back to the PIN screen. */
  onSessionExpired(): void;
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
