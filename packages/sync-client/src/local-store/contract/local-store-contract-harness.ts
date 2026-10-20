import type { LocalStore } from "../local-store";
import type { SqlRow } from "../sqlite-driver";

/** Which statements fail while a store's fault is armed: a full disk mid-write, say. */
export interface SqlFault {
  readonly startsWith?: string;
  readonly includes?: string;
}

export const matchesFault = (fault: SqlFault | undefined, sql: string): boolean =>
  fault !== undefined &&
  (fault.startsWith === undefined || sql.startsWith(fault.startsWith)) &&
  (fault.includes === undefined || sql.includes(fault.includes));

/** A store under test, with the two ways a test reaches past the LocalStore interface. */
export interface ContractStore {
  readonly store: LocalStore;
  /** While armed, statements matching the fault the store was opened with throw. */
  setFaultArmed(armed: boolean): Promise<void>;
  /** Runs one statement on the store's database directly, as damage or another tool would. */
  querySql(sql: string): Promise<SqlRow[]>;
}

/**
 * How one LocalStore implementation is opened for the contract. Fault and SQL reach the
 * database wherever it lives (in this process, or in a Worker behind messages), so a fault
 * and its rollback are checked on the real engine.
 */
export interface LocalStoreHarness {
  /** A fresh, empty store. */
  open(options?: { fault?: SqlFault }): Promise<ContractStore>;
  /** A store on a database named `name` that outlives close(): opening it again reopens it. */
  openFile(name: string): Promise<ContractStore>;
}

export interface LocalStoreContractCase {
  readonly name: string;
  run(harness: LocalStoreHarness): Promise<void>;
}

export interface LocalStoreContractGroup {
  readonly name: string;
  readonly cases: readonly LocalStoreContractCase[];
}
