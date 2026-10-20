import type { LocalStoreContractGroup } from "./local-store-contract-harness";
import { DEVICE_BINDING_CONTRACT, OUTBOX_CONTRACT } from "./outbox-contract-cases";
import { DEVICE_SEQ_CONTRACT, REOPEN_CONTRACT } from "./reopen-contract-cases";
import {
  PULLED_PAGE_CONTRACT,
  REPEATED_ANSWER_CONTRACT,
  SERVER_COPY_CONTRACT,
} from "./server-copy-contract-cases";
import { SERVER_RESTORE_CONTRACT } from "./server-restore-contract-cases";

export type {
  ContractStore,
  LocalStoreContractCase,
  LocalStoreContractGroup,
  LocalStoreHarness,
  SqlFault,
} from "./local-store-contract-harness";
export { matchesFault } from "./local-store-contract-harness";

/**
 * What every LocalStore must do, whatever engine and process it runs in: node:sqlite here,
 * SQLite WASM in a browser Worker behind messages, the native plugins of the shells later.
 */
export const LOCAL_STORE_CONTRACT: readonly LocalStoreContractGroup[] = [
  OUTBOX_CONTRACT,
  DEVICE_BINDING_CONTRACT,
  REOPEN_CONTRACT,
  DEVICE_SEQ_CONTRACT,
  SERVER_COPY_CONTRACT,
  PULLED_PAGE_CONTRACT,
  REPEATED_ANSWER_CONTRACT,
  SERVER_RESTORE_CONTRACT,
];

/** The name a case is reported under outside Vitest, e.g. by the browser page. */
export const contractCaseId = (group: LocalStoreContractGroup, caseName: string): string =>
  `${group.name} > ${caseName}`;
