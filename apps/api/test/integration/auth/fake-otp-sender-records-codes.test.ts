import { describe, expect, it } from "vitest";
import { FakeOtpSender } from "../support/fake-otp-sender";

// The fake is what future reset and verification flows will be tested against, so it
// must behave like the port promises: record in order, and fail when told to.
describe("FakeOtpSender", () => {
  it("records each code with its recipient and purpose, newest last", async () => {
    const sender = new FakeOtpSender();
    await sender.send({ to: { phone: "+84912345678" }, code: "111111", purpose: "password-reset" });
    await sender.send({ to: { email: "a@b.vn" }, code: "222222", purpose: "phone-verification" });
    await sender.send({ to: { phone: "+84912345678" }, code: "333333", purpose: "password-reset" });
    expect(sender.sent.map((message) => message.code)).toEqual(["111111", "222222", "333333"]);
    expect(sender.lastCodeFor("password-reset")).toBe("333333");
  });

  it("fails exactly the next send when told to, and records nothing for it", async () => {
    const sender = new FakeOtpSender();
    sender.failNext();
    const message = { to: { email: "a@b.vn" }, code: "1", purpose: "password-reset" } as const;
    await expect(sender.send(message)).rejects.toThrow("unavailable");
    await sender.send(message);
    expect(sender.sent).toHaveLength(1);
  });
});
