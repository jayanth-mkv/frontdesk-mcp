import { now } from "../clock.js";
import type { HouseholdState } from "./types.js";

/** Today (IST calendar day, per the demo clock) at HH:MM IST, as an ISO string. */
export function todayAt(hhmm: string, base = now()): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ist = new Date(base.getTime() + 330 * 60_000);
  const midnightIstUtc = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 330 * 60_000;
  return new Date(midnightIstUtc + (h * 60 + m) * 60_000).toISOString();
}

/** Fictional demo household. All brands are made up. */
export function seedState(): HouseholdState {
  return {
    householdId: "demo",
    ownerName: "Arjun",
    focus: { on: false },
    rules: {
      address: {
        society: "Palm Grove Residency",
        tower: "Tower B",
        flat: "1204",
        gate: "Gate 2 (service gate, Outer Ring Road side)",
        landmark: "opposite the Sunrise Bakery",
        directions:
          "Enter via Gate 2, go straight past the clubhouse, Tower B is the second tower on the left. Lift to the 12th floor, flat 1204 is to the right.",
      },
      dropOff: {
        leaveAtDoor: true,
        preferredSpot: "on the shoe rack outside the door",
        guardPreapproved: true,
      },
      substitutions: { autoAcceptVegSwaps: true, maxPriceIncreaseInr: 50 },
      bookings: { earliest: "10:00", latest: "18:00" },
      secrets: ["delivery OTPs", "door lock code", "bank or UPI details"],
      languages: ["en-IN", "hi-IN"],
    },
    orders: [
      {
        id: "QB-7781",
        kind: "food",
        merchant: "Saffron Table (via QuickBite)",
        courier: "QuickBite",
        items: ["Paneer Tikka", "Dal Makhani", "2 x Butter Naan"],
        amountInr: 640,
        status: "out_for_delivery",
        eta: todayAt("13:15"),
        knownCallers: ["+91 98450 11223", "+91 80 4040 7781"],
      },
      {
        id: "PG-55210",
        kind: "parcel",
        merchant: "ParcelGo",
        courier: "ParcelGo",
        items: ["Noise-cancelling headphones"],
        amountInr: 7999,
        status: "out_for_delivery",
        eta: todayAt("16:00"),
        otp: "4821",
        knownCallers: ["+91 99000 55210"],
      },
      {
        id: "FC-3090",
        kind: "grocery",
        merchant: "FreshCart",
        courier: "FreshCart",
        items: ["Milk", "Eggs", "Spinach", "Bananas"],
        amountInr: 412,
        status: "preparing",
        eta: todayAt("14:00"),
        knownCallers: ["+91 97400 30900"],
      },
    ],
    bookings: [
      {
        id: "BK-SALON",
        kind: "salon",
        provider: "Glow Studio",
        time: todayAt("17:00"),
        status: "confirmed",
        knownCallers: ["+91 80 2555 0101"],
      },
      {
        id: "BK-DINNER",
        kind: "restaurant",
        provider: "The Courtyard Kitchen",
        time: todayAt("20:00"),
        partySize: 4,
        status: "confirmed",
        knownCallers: ["+91 80 2777 0202"],
      },
    ],
    contacts: [],
    approvals: [],
    ledger: [],
    digest: [],
  };
}
