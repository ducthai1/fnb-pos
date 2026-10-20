import type { DeviceCredential } from "../shell-bridge/device-credential-store";

/** The paired till of every test; kept apart so browser pages can use it without node:sqlite. */
export const CREDENTIAL: DeviceCredential = {
  deviceId: "0199f000-0000-7000-8000-00000000d001",
  branchId: "0199f000-0000-7000-8000-00000000b001",
  deviceToken: "0199f000-0000-7000-8000-00000000a001.secret",
};
