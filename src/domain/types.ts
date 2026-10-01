export type OrderKind = "food" | "parcel" | "grocery";
export type OrderStatus = "placed" | "preparing" | "out_for_delivery" | "delivered" | "cancelled";

export interface Order {
  id: string;
  kind: OrderKind;
  merchant: string;
  courier?: string;
  items: string[];
  amountInr: number;
  status: OrderStatus;
  eta: string; // ISO time
  /** Handoff OTP. Never shared without an explicit approval. */
  otp?: string;
  /** Phone number(s) the courier/merchant is expected to call from. */
  knownCallers: string[];
}

export type BookingStatus = "confirmed" | "pending_change" | "cancelled";

export interface Booking {
  id: string;
  kind: "salon" | "restaurant" | "home_service";
  provider: string;
  time: string; // ISO time
  partySize?: number;
  status: BookingStatus;
  knownCallers: string[];
}

export interface HouseRules {
  address: {
    society: string;
    tower: string;
    flat: string;
    gate: string;
    landmark: string;
    directions: string;
  };
  dropOff: {
    leaveAtDoor: boolean;
    preferredSpot: string;
    guardPreapproved: boolean;
  };
  substitutions: {
    autoAcceptVegSwaps: boolean;
    maxPriceIncreaseInr: number;
  };
  bookings: {
    /** Changes inside this window are auto-accepted, anything else needs approval. */
    earliest: string; // "HH:MM"
    latest: string; // "HH:MM"
  };
  /** Never shared without approval. Never shared at all with unverified callers. */
  secrets: string[];
  languages: string[];
}

export type Channel = "call" | "doorbell" | "chat";

export interface InboundContact {
  id: string;
  at: string;
  channel: Channel;
  callerName: string;
  callerNumber: string;
  language: string; // BCP-47, e.g. "hi-IN"
  message: string;
}

export type ActionType =
  | "share_directions"
  | "share_dropoff_instructions"
  | "accept_substitution"
  | "decline_substitution"
  | "reschedule_booking"
  | "cancel_booking"
  | "share_otp"
  | "share_secret"
  | "flag_suspicious"
  | "take_message";

export interface ProposedAction {
  type: ActionType;
  refId?: string; // order or booking id
  detail: string;
  amountInr?: number;
  newTime?: string;
}

export type Decision = "auto" | "notify" | "ask" | "deny";

export interface DecidedAction extends ProposedAction {
  decision: Decision;
  reason: string;
}

export interface PendingApproval {
  id: string;
  createdAt: string;
  contactId: string;
  action: DecidedAction;
  summary: string;
  status: "pending" | "approved" | "denied";
}

export interface LedgerEntry {
  id: string;
  at: string;
  actor: "frontdesk" | "user" | "caller";
  kind: "reply" | "action" | "approval" | "focus" | "flag" | "booking";
  summary: string;
  contactId?: string;
  decision?: Decision;
}

export interface DigestItem {
  at: string;
  icon: "delivery" | "food" | "booking" | "shield" | "info";
  text: string;
  needsApproval?: string; // approval id
}

export interface FocusState {
  on: boolean;
  since?: string;
  until?: string;
}

export interface HouseholdState {
  householdId: string;
  ownerName: string;
  focus: FocusState;
  rules: HouseRules;
  orders: Order[];
  bookings: Booking[];
  contacts: InboundContact[];
  approvals: PendingApproval[];
  ledger: LedgerEntry[];
  digest: DigestItem[];
}
