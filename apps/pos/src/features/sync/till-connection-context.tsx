import { type ReactNode, createContext, useContext } from "react";
import type { TillConnection } from "./till-sync-status";

const Context = createContext<TillConnection>("online");

/** What the till knows of its link to the server, for the screens below the signed-in till. */
export function TillConnectionProvider(props: { value: TillConnection; children: ReactNode }) {
  return <Context.Provider value={props.value}>{props.children}</Context.Provider>;
}

export const useTillConnection = (): TillConnection => useContext(Context);

/**
 * Whether what the till holds about the server's rows (a QR still waiting) may be out of
 * date: its last pass with the server failed. Before the first pass it is not yet known,
 * which is not worth a warning; a till with no provider above it reads as online.
 */
export const connectionIsDown = (connection: TillConnection): boolean =>
  connection !== "online" && connection !== "checking";
