import type { OtpPurpose, OtpSender } from "../../../src/auth/otp-sender";

export type SentOtp = Parameters<OtpSender["send"]>[0];

/**
 * Stands in for the SMS/Zalo/email provider: records every code instead of sending it,
 * so a test can read the code a user would have received. `failNext` simulates the
 * provider being down for one call.
 */
export class FakeOtpSender implements OtpSender {
  readonly sent: SentOtp[] = [];
  private failures = 0;

  async send(message: SentOtp): Promise<void> {
    if (this.failures > 0) {
      this.failures--;
      throw new Error("otp provider unavailable");
    }
    this.sent.push(message);
  }

  failNext(): void {
    this.failures++;
  }

  lastCodeFor(purpose: OtpPurpose): string | undefined {
    return this.sent.filter((message) => message.purpose === purpose).at(-1)?.code;
  }
}
