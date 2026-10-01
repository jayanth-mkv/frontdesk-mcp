import type { Booking, DecidedAction, HouseRules, InboundContact, Order, ProposedAction } from "../domain/types.js";

export interface Verification {
  verified: boolean;
  order?: Order;
  booking?: Booking;
}

const normalize = (n: string) => n.replace(/[^\d]/g, "").slice(-10);

/** A caller is verified only if their number belongs to an active order or booking. */
export function verifyCaller(contact: InboundContact, orders: Order[], bookings: Booking[]): Verification {
  const num = normalize(contact.callerNumber);
  const order = orders.find(
    (o) => o.status !== "delivered" && o.status !== "cancelled" && o.knownCallers.some((k) => normalize(k) === num),
  );
  if (order) return { verified: true, order };
  const booking = bookings.find((b) => b.status !== "cancelled" && b.knownCallers.some((k) => normalize(k) === num));
  if (booking) return { verified: true, booking };
  return { verified: false };
}

function minutesOfDayIST(iso: string): number {
  const d = new Date(iso);
  return (d.getUTCHours() * 60 + d.getUTCMinutes() + 330) % (24 * 60);
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Deterministic policy. The LLM proposes, this decides. The LLM cannot override it.
 * auto   = do it silently (logged)
 * notify = do it and put it in the digest
 * ask    = hold until the user approves
 * deny   = never do it
 */
export function decide(action: ProposedAction, v: Verification, rules: HouseRules): DecidedAction {
  const d = (decision: DecidedAction["decision"], reason: string): DecidedAction => ({ ...action, decision, reason });

  if (action.type === "flag_suspicious" || action.type === "take_message") return d("auto", "Always safe.");
  if (action.type === "share_secret") return d("deny", `House rule: never share ${rules.secrets.join(", ")}.`);
  if (!v.verified) return d("deny", "Caller is not linked to any active order or booking.");

  switch (action.type) {
    case "share_directions":
    case "share_dropoff_instructions":
      return v.order ? d("auto", "Verified courier for an active order.") : d("ask", "Directions requested outside a delivery.");

    case "share_otp":
      if (!v.order?.otp) return d("deny", "No OTP exists for this caller's order.");
      if (v.order.status !== "out_for_delivery") return d("deny", "Order is not out for delivery yet.");
      return d("ask", "OTPs are only released with your approval.");

    case "accept_substitution": {
      const increase = action.amountInr ?? 0;
      if (rules.substitutions.autoAcceptVegSwaps && increase <= rules.substitutions.maxPriceIncreaseInr && /veg|paneer|malai|dal/i.test(action.detail))
        return d("notify", `Within your swap rule (veg, up to ₹${rules.substitutions.maxPriceIncreaseInr} more).`);
      return d("ask", "Substitution is outside your swap rule.");
    }

    case "decline_substitution":
      return d("notify", "Declining is always allowed.");

    case "reschedule_booking": {
      if (!v.booking) return d("ask", "No booking linked to this caller.");
      if (!action.newTime) return d("ask", "No new time given.");
      const t = minutesOfDayIST(action.newTime);
      const ok = t >= hhmmToMinutes(rules.bookings.earliest) && t <= hhmmToMinutes(rules.bookings.latest);
      return ok
        ? d("notify", `Inside your ${rules.bookings.earliest}–${rules.bookings.latest} window.`)
        : d("ask", `Outside your ${rules.bookings.earliest}–${rules.bookings.latest} window.`);
    }

    case "cancel_booking":
      return d("ask", "Cancellations always need your approval.");
  }
  return d("ask", "Unknown action type.");
}
