import { describe, expect, it } from "vitest";
import { seedState, todayAt } from "../domain/seed.js";
import type { InboundContact } from "../domain/types.js";
import { decide, verifyCaller } from "./guardrails.js";

const s = seedState();
const contact = (callerNumber: string): InboundContact => ({
  id: "c1",
  at: new Date().toISOString(),
  channel: "call",
  callerName: "x",
  callerNumber,
  language: "en-IN",
  message: "",
});

describe("verifyCaller", () => {
  it("matches a courier number to its order", () => {
    expect(verifyCaller(contact("+91 98450 11223"), s.orders, s.bookings).order?.id).toBe("QB-7781");
  });
  it("matches a booking number", () => {
    expect(verifyCaller(contact("08025550101"), s.orders, s.bookings).booking?.id).toBe("BK-SALON");
  });
  it("rejects unknown numbers", () => {
    expect(verifyCaller(contact("+91 70000 00000"), s.orders, s.bookings).verified).toBe(false);
  });
});

describe("decide", () => {
  const courier = verifyCaller(contact("+91 99000 55210"), s.orders, s.bookings);
  const salon = verifyCaller(contact("+91 80 2555 0101"), s.orders, s.bookings);
  const stranger = verifyCaller(contact("+91 70000 00000"), s.orders, s.bookings);

  it("never shares an OTP with an unverified caller", () => {
    expect(decide({ type: "share_otp", detail: "otp" }, stranger, s.rules).decision).toBe("deny");
  });
  it("asks before sharing an OTP even with the verified courier", () => {
    expect(decide({ type: "share_otp", detail: "otp" }, courier, s.rules).decision).toBe("ask");
  });
  it("never shares secrets", () => {
    expect(decide({ type: "share_secret", detail: "door code" }, courier, s.rules).decision).toBe("deny");
  });
  it("auto-shares directions with a verified courier", () => {
    expect(decide({ type: "share_directions", detail: "" }, courier, s.rules).decision).toBe("auto");
  });
  it("accepts a cheap veg swap", () => {
    expect(decide({ type: "accept_substitution", detail: "Malai Tikka for Paneer Tikka", amountInr: 30 }, courier, s.rules).decision).toBe("notify");
  });
  it("asks about an expensive swap", () => {
    expect(decide({ type: "accept_substitution", detail: "Paneer platter", amountInr: 200 }, courier, s.rules).decision).toBe("ask");
  });
  it("auto-accepts a reschedule inside the window and asks outside it", () => {
    expect(decide({ type: "reschedule_booking", detail: "", newTime: todayAt("16:30") }, salon, s.rules).decision).toBe("notify");
    expect(decide({ type: "reschedule_booking", detail: "", newTime: todayAt("18:30") }, salon, s.rules).decision).toBe("ask");
  });
});
