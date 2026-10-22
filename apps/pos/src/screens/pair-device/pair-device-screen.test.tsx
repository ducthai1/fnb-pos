import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ApiResult } from "../../features/api/api-result";
import { vi as text } from "../../messages/vi";
import type { DeviceCredential } from "../../shell-bridge/device-credential-store";
import { CREDENTIAL, refusal } from "../../test-support/fake-pos-server";
import { PairDeviceScreen } from "./pair-device-screen";
import { takePairingCodeFromAddress } from "./pairing-link";

function pairScreen(answer: ApiResult<DeviceCredential>, linkedCode?: string) {
  const sent: { code: string; deviceName: string }[] = [];
  const paired: DeviceCredential[] = [];
  render(
    <PairDeviceScreen
      pair={async (input) => (sent.push(input), answer)}
      onPaired={async (credential) => void paired.push(credential)}
      linkedCode={linkedCode ?? null}
    />,
  );
  const submit = (code: string, deviceName?: string) => {
    fireEvent.change(screen.getByLabelText(text.pairing.codeLabel), { target: { value: code } });
    if (deviceName !== undefined) {
      fireEvent.change(screen.getByLabelText(text.pairing.deviceNameLabel), {
        target: { value: deviceName },
      });
    }
    fireEvent.click(screen.getByRole("button", { name: text.pairing.submit }));
  };
  return { sent, paired, submit };
}

describe("pairing a till with its shop", () => {
  it("sends the code as generated, whatever case and dashes it was typed with, and hands on the credential", async () => {
    const till = pairScreen({ ok: true, value: CREDENTIAL });
    till.submit(" abcd-efgh ", "  Quầy 1 ");
    await waitFor(() => expect(till.paired).toEqual([CREDENTIAL]));
    expect(till.sent).toEqual([{ code: "ABCDEFGH", deviceName: "Quầy 1" }]);
  });

  it("refuses a code that is not 8 characters without sending it", async () => {
    const till = pairScreen({ ok: true, value: CREDENTIAL });
    till.submit("ABCD-EFG");
    expect((await screen.findByRole("alert")).textContent).toBe(text.pairing.codeIncomplete);
    till.submit("ABCDEFGHJ");
    expect(screen.getByRole("alert").textContent).toBe(text.pairing.codeIncomplete);
    expect(till.sent).toEqual([]);
  });

  it("refuses a blank till name without sending it", async () => {
    const till = pairScreen({ ok: true, value: CREDENTIAL });
    till.submit("ABCDEFGH", "   ");
    expect((await screen.findByRole("alert")).textContent).toBe(text.pairing.deviceNameMissing);
    expect(till.sent).toEqual([]);
  });

  it("says the code was not accepted when the server refuses it, and stays on the screen", async () => {
    const till = pairScreen(refusal(401, "API_DEVICE_PAIRING_CODE_INVALID"));
    till.submit("ABCDEFGH");
    expect((await screen.findByRole("alert")).textContent).toBe(
      text.errors.API_DEVICE_PAIRING_CODE_INVALID,
    );
    expect(till.paired).toEqual([]);
    expect(screen.getByRole("button", { name: text.pairing.submit })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("says the server could not be reached when nothing answered", async () => {
    const till = pairScreen(refusal(null, null));
    till.submit("ABCDEFGH");
    expect((await screen.findByRole("alert")).textContent).toBe(text.errors.network);
    expect(till.paired).toEqual([]);
  });

  it("fills in and sends the code of a pairing link once, without a tap", async () => {
    const till = pairScreen({ ok: true, value: CREDENTIAL }, "abcd-efgh");
    expect(screen.getByLabelText(text.pairing.codeLabel)).toHaveProperty("value", "abcd-efgh");
    await waitFor(() => expect(till.paired).toEqual([CREDENTIAL]));
    expect(till.sent).toEqual([{ code: "ABCDEFGH", deviceName: text.pairing.deviceNameDefault }]);
  });

  it("leaves a refused link code on screen to be corrected by hand", async () => {
    const till = pairScreen(refusal(401, "API_DEVICE_PAIRING_CODE_INVALID"), "ABCD-EFGH");
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(till.sent).toHaveLength(1);
    expect(screen.getByLabelText(text.pairing.codeLabel)).toHaveProperty("value", "ABCD-EFGH");
  });
});

describe("a pairing link in the address bar", () => {
  const address = (href: string) => {
    const replaced: string[] = [];
    const history = {
      state: null,
      replaceState: (_: unknown, __: string, url: string) => void replaced.push(url),
    };
    return { code: takePairingCodeFromAddress({ href }, history), replaced };
  };

  it("hands over the code and takes it out of the address, keeping the rest", () => {
    expect(address("http://127.0.0.1:5173/?pair=ABCD-EFGH&x=1#top")).toEqual({
      code: "ABCD-EFGH",
      replaced: ["/?x=1#top"],
    });
  });

  it("leaves an address without a code untouched", () => {
    expect(address("http://127.0.0.1:5173/")).toEqual({ code: null, replaced: [] });
  });
});
