/**
 * Delivers one-time codes (SMS, Zalo, email). Only the port exists so far: flows that
 * need a code (password reset, phone verification) depend on this interface, and tests
 * pass a fake that records what would have been sent.
 */
export interface OtpSender {
  send(message: {
    to: { email: string } | { phone: string };
    code: string;
    purpose: OtpPurpose;
  }): Promise<void>;
}

export type OtpPurpose = "password-reset" | "phone-verification";
