import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { composeReply, proposeActions } from "../agent/inbound.js";
import type {
  Booking,
  DecidedAction,
  DigestItem,
  HouseholdState,
  InboundContact,
  LedgerEntry,
  PendingApproval,
} from "../domain/types.js";
import type { Store } from "../store/store.js";
import { now as clockNow } from "../clock.js";
import { decide, verifyCaller } from "./guardrails.js";

const id = (p: string) => `${p}-${randomUUID().slice(0, 8)}`;
const now = () => clockNow().toISOString();
export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });

export interface InboundResult {
  contact: InboundContact;
  verified: boolean;
  decisions: DecidedAction[];
  reply: string;
  replyEn: string;
  approvals: PendingApproval[];
}

/** Everything FrontDesk does. MCP tools and the HTTP API are thin wrappers around this. */
export class FrontDesk {
  readonly events = new EventEmitter();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private store: Store) {}

  /** Serialize writes per process so concurrent callers can't clobber state. */
  private tx<T>(householdId: string, fn: (s: HouseholdState) => Promise<T> | T): Promise<T> {
    const run = this.queue.then(async () => {
      const s = await this.store.load(householdId);
      const out = await fn(s);
      await this.store.save(s);
      this.events.emit("state", s);
      return out;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private log(s: HouseholdState, e: Omit<LedgerEntry, "id" | "at">) {
    const entry = { id: id("L"), at: now(), ...e };
    s.ledger.unshift(entry);
    this.events.emit("ledger", entry);
  }

  private addDigest(s: HouseholdState, item: Omit<DigestItem, "at">) {
    s.digest.unshift({ at: now(), ...item });
  }

  state(householdId: string) {
    return this.store.load(householdId);
  }

  reset(householdId: string) {
    return this.tx(householdId, (s) => {
      const fresh = { ...s, focus: { on: false }, contacts: [], approvals: [], ledger: [], digest: [] };
      Object.assign(s, fresh);
      return s;
    });
  }

  setFocus(householdId: string, on: boolean, minutes?: number) {
    return this.tx(householdId, (s) => {
      s.focus = on ? { on, since: now(), until: minutes ? new Date(clockNow().getTime() + minutes * 60_000).toISOString() : undefined } : { on: false };
      if (on) s.digest = [];
      this.log(s, {
        actor: "user",
        kind: "focus",
        summary: on ? `Focus mode on${minutes ? ` for ${minutes} min` : ""}. FrontDesk is handling calls.` : "Focus mode off.",
      });
      return s.focus;
    });
  }

  async handleInbound(householdId: string, input: Omit<InboundContact, "id" | "at">): Promise<InboundResult> {
    const contact: InboundContact = { id: id("C"), at: now(), ...input };
    // Read-only LLM work happens outside the write lock.
    const snapshot = await this.store.load(householdId);
    const v = verifyCaller(contact, snapshot.orders, snapshot.bookings);
    this.events.emit("contact", { contact, verified: v.verified });

    const proposed = await proposeActions(contact, snapshot, v);
    const decisions = proposed.map((a) => decide({ ...a, refId: a.refId ?? v.order?.id ?? v.booking?.id }, v, snapshot.rules));
    this.events.emit("decisions", { contactId: contact.id, decisions });
    const { reply, replyEn, digest } = await composeReply(contact, snapshot, v, decisions);

    return this.tx(householdId, (s) => {
      s.contacts.unshift(contact);
      this.log(s, { actor: "caller", kind: "reply", contactId: contact.id, summary: `${contact.callerName} (${contact.channel}): "${contact.message}"` });
      const approvals: PendingApproval[] = [];
      for (const a of decisions) {
        if (a.decision === "auto" || a.decision === "notify") this.apply(s, a);
        if (a.decision === "ask") {
          const p: PendingApproval = { id: id("A"), createdAt: now(), contactId: contact.id, action: a, summary: this.describe(s, a, contact), status: "pending" };
          s.approvals.unshift(p);
          approvals.push(p);
        }
        this.log(s, {
          actor: "frontdesk",
          kind: a.type === "flag_suspicious" ? "flag" : "action",
          contactId: contact.id,
          decision: a.decision,
          summary: `${a.type.replaceAll("_", " ")}: ${a.decision.toUpperCase()}. ${a.reason}`,
        });
      }
      this.log(s, { actor: "frontdesk", kind: "reply", contactId: contact.id, summary: `Replied: "${replyEn}"` });

      const flagged = decisions.some((d) => d.type === "flag_suspicious" || (d.decision === "deny" && /otp|secret/.test(d.type)));
      const icon: DigestItem["icon"] = flagged ? "shield" : v.booking ? "booking" : v.order?.kind === "food" ? "food" : v.order ? "delivery" : "info";
      // A call that only produced approvals is already covered by its approval item.
      if (!(approvals.length && decisions.every((d) => d.decision === "ask"))) this.addDigest(s, { icon, text: digest });
      for (const p of approvals) this.addDigest(s, { icon: "info", text: p.summary, needsApproval: p.id });
      return { contact, verified: v.verified, decisions, reply, replyEn, approvals };
    });
  }

  private describe(s: HouseholdState, a: DecidedAction, c: InboundContact) {
    const booking = s.bookings.find((b) => b.id === a.refId);
    if (a.type === "reschedule_booking" && booking && a.newTime)
      return `${booking.provider} wants to move your ${fmtTime(booking.time)} booking to ${fmtTime(a.newTime)}.`;
    if (a.type === "share_otp") return `${c.callerName} is at the door and needs the OTP for order ${a.refId}.`;
    if (a.type === "accept_substitution") return `${c.callerName} suggests ${a.detail} (₹${a.amountInr ?? 0} more).`;
    return `${c.callerName}: ${a.detail}`;
  }

  /** Execute an allowed action against the household state. */
  private apply(s: HouseholdState, a: DecidedAction) {
    if (a.type === "reschedule_booking" && a.newTime) {
      const b = s.bookings.find((x) => x.id === a.refId);
      if (b) b.time = a.newTime;
    }
    if (a.type === "accept_substitution") {
      const o = s.orders.find((x) => x.id === a.refId);
      if (o && !o.items.includes(a.detail)) o.items.push(`${a.detail} (substitute)`);
    }
    if (a.type === "cancel_booking") {
      const b = s.bookings.find((x) => x.id === a.refId);
      if (b) b.status = "cancelled";
    }
  }

  resolveApproval(householdId: string, approvalId: string, approve: boolean) {
    return this.tx(householdId, (s) => {
      const p = s.approvals.find((x) => x.id === approvalId || x.id.endsWith(approvalId));
      if (!p) throw new Error(`No approval ${approvalId}`);
      if (p.status !== "pending") return p;
      p.status = approve ? "approved" : "denied";
      if (approve) this.apply(s, p.action);
      const followUp =
        p.action.type === "share_otp"
          ? approve
            ? "Sent the OTP to the verified courier by SMS."
            : "Told the courier to leave it with the guard."
          : approve
            ? "Confirmed with the caller."
            : "Politely declined with the caller.";
      this.log(s, { actor: "user", kind: "approval", decision: p.action.decision, summary: `${approve ? "Approved" : "Denied"}: ${p.summary} ${followUp}` });
      s.digest = s.digest.map((d) => (d.needsApproval === p.id ? { ...d, needsApproval: undefined, text: `${d.text} ${approve ? "Approved." : "Declined."}` } : d));
      return p;
    });
  }

  digest(s: HouseholdState) {
    const pending = s.approvals.filter((a) => a.status === "pending");
    const blocked = s.digest.filter((d) => d.icon === "shield").length;
    return {
      focus: s.focus,
      handledCount: s.contacts.length,
      blockedCount: blocked,
      items: s.digest,
      pendingApprovals: pending.map((p) => ({ id: p.id, summary: p.summary })),
      headline: s.contacts.length
        ? `FrontDesk handled ${s.contacts.length} interruption${s.contacts.length > 1 ? "s" : ""}${blocked ? `, blocked ${blocked} suspicious` : ""}${pending.length ? `, ${pending.length} need${pending.length > 1 ? "" : "s"} your OK` : ""}.`
        : "All quiet. Nothing needed you.",
    };
  }

  /** User-initiated booking change (from Alexa). */
  rescheduleBooking(householdId: string, bookingId: string, newTime: string, force: boolean) {
    return this.tx(householdId, (s) => {
      const b = s.bookings.find((x) => x.id === bookingId);
      if (!b) throw new Error(`No booking ${bookingId}`);
      const decision = decide({ type: "reschedule_booking", refId: b.id, detail: "Requested by owner", newTime }, { verified: true, booking: b }, s.rules);
      if (decision.decision === "ask" && !force) return { ok: false as const, needsConfirmation: true, reason: decision.reason, booking: b };
      const old = b.time;
      b.time = newTime;
      this.log(s, { actor: "user", kind: "booking", summary: `Moved ${b.provider} from ${fmtTime(old)} to ${fmtTime(newTime)}; FrontDesk confirmed with ${b.provider}.` });
      return { ok: true as const, booking: b };
    });
  }

  updateRules(
    householdId: string,
    p: { preferredSpot?: string; leaveAtDoor?: boolean; maxPriceIncreaseInr?: number; bookingEarliest?: string; bookingLatest?: string },
  ) {
    return this.tx(householdId, (s) => {
      const r = s.rules;
      if (p.preferredSpot !== undefined) r.dropOff.preferredSpot = p.preferredSpot;
      if (p.leaveAtDoor !== undefined) r.dropOff.leaveAtDoor = p.leaveAtDoor;
      if (p.maxPriceIncreaseInr !== undefined) r.substitutions.maxPriceIncreaseInr = p.maxPriceIncreaseInr;
      if (p.bookingEarliest) r.bookings.earliest = p.bookingEarliest;
      if (p.bookingLatest) r.bookings.latest = p.bookingLatest;
      this.log(s, { actor: "user", kind: "action", summary: `House rules updated: ${Object.keys(p).join(", ")}.` });
      return r;
    });
  }

  createBooking(householdId: string, booking: Omit<Booking, "id" | "status" | "knownCallers">) {
    return this.tx(householdId, (s) => {
      const b: Booking = { ...booking, id: id("BK"), status: "confirmed", knownCallers: [] };
      s.bookings.push(b);
      this.log(s, { actor: "frontdesk", kind: "booking", summary: `Booked ${b.provider} for ${fmtTime(b.time)}${b.partySize ? `, party of ${b.partySize}` : ""}.` });
      return b;
    });
  }
}
