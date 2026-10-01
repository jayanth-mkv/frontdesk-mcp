import type { Verification } from "../core/guardrails.js";
import type { DecidedAction, HouseholdState, InboundContact, ProposedAction } from "../domain/types.js";
import { now as clockNow } from "../clock.js";
import { todayAt } from "../domain/seed.js";
import { converse, extractJson } from "./llm.js";

const ACTION_TYPES =
  "share_directions | share_dropoff_instructions | accept_substitution | decline_substitution | reschedule_booking | cancel_booking | share_otp | share_secret | flag_suspicious | take_message";

function context(state: HouseholdState, v: Verification) {
  const fmt = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
  return JSON.stringify(
    {
      now: fmt(clockNow().toISOString()),
      owner: state.ownerName,
      ownerIsInFocusMode: state.focus.on,
      callerVerified: v.verified,
      linkedOrder: v.order && { id: v.order.id, merchant: v.order.merchant, items: v.order.items, status: v.order.status, eta: fmt(v.order.eta) },
      linkedBooking: v.booking && { id: v.booking.id, provider: v.booking.provider, time: fmt(v.booking.time), partySize: v.booking.partySize },
      address: v.verified ? state.rules.address : "(withheld: caller not verified)",
      dropOff: state.rules.dropOff,
      substitutionRule: state.rules.substitutions,
      bookingWindowIST: state.rules.bookings,
    },
    null,
    1,
  );
}

/** Step 1: the model reads the contact and proposes actions. It never executes anything. */
export async function proposeActions(contact: InboundContact, state: HouseholdState, v: Verification): Promise<ProposedAction[]> {
  const res = await converse({
    system: `You are FrontDesk, the home front desk for ${state.ownerName}'s household. A caller has contacted the home.
Propose the actions needed to resolve their request. You do NOT decide whether actions are allowed; a separate policy engine does.
Action types: ${ACTION_TYPES}.
- If the caller asks for an OTP, PIN, door code or payment details, propose share_otp or share_secret honestly (the policy engine will decide).
- If the caller is not verified and asks for sensitive info, also propose flag_suspicious.
- For reschedules, include newTime as an ISO-8601 timestamp with +05:30 offset for today.
- For substitutions, include amountInr = price increase in INR (0 if none) and put the new item name in detail.
Reply with JSON only: {"actions":[{"type":"...","refId":"...","detail":"...","amountInr":0,"newTime":"..."}]}`,
    messages: [{ role: "user", content: [{ text: `Context:\n${context(state, v)}\n\nCaller (${contact.callerName}, ${contact.callerNumber}, via ${contact.channel}, language ${contact.language}) says:\n"${contact.message}"` }] }],
    maxTokens: 500,
  });
  const text = res?.content.map((c) => c.text ?? "").join("") ?? "";
  const parsed = extractJson<{ actions: ProposedAction[] }>(text);
  return parsed?.actions ?? mockPropose(contact, state, v);
}

/** Step 2: after the policy engine decided, the model writes the reply in the caller's language. */
export async function composeReply(
  contact: InboundContact,
  state: HouseholdState,
  v: Verification,
  decided: DecidedAction[],
): Promise<{ reply: string; replyEn: string; digest: string }> {
  const res = await converse({
    system: `You are FrontDesk, speaking on the phone/doorbell on behalf of ${state.ownerName}'s household. ${state.ownerName} is busy and will not be interrupted.
Write a short, warm, natural spoken reply (max 3 sentences) in the caller's language (${contact.language}; for hi-IN write natural conversational Hindi in Devanagari script).
Strictly follow the policy decisions:
- auto/notify: you did it; tell the caller (e.g. give directions or confirm the swap/new time).
- ask: say you will check with ${state.ownerName} and get back shortly. Do not reveal the information.
- deny: politely decline. Never reveal OTPs, codes, addresses or details that were denied.
Never mention "policy engine" or internal terms. Do not invent facts not in the context.
Also write "digest": one short line for ${state.ownerName}'s catch-up summary (English, past tense, under 20 words).
Reply with JSON only: {"reply":"...","replyEn":"English translation of reply","digest":"..."}`,
    messages: [
      {
        role: "user",
        content: [
          {
            text: `Context:\n${context(state, v)}\n\nCaller (${contact.callerName}) said: "${contact.message}"\n\nDecisions:\n${JSON.stringify(decided.map(({ type, detail, decision, reason, newTime, amountInr }) => ({ type, detail, decision, reason, newTime, amountInr })), null, 1)}`,
          },
        ],
      },
    ],
    maxTokens: 500,
  });
  const text = res?.content.map((c) => c.text ?? "").join("") ?? "";
  return extractJson<{ reply: string; replyEn: string; digest: string }>(text) ?? mockReply(contact, state, v, decided);
}

// ---------- Offline mock mode (no AWS needed) ----------

function parseTime(msg: string): string | undefined {
  const m = msg.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|baje)?/i);
  if (!m) return undefined;
  let h = Number(m[1]);
  if (/pm/i.test(m[3] ?? "") && h < 12) h += 12;
  if (!m[3] && h < 9) h += 12;
  return todayAt(`${String(h).padStart(2, "0")}:${m[2] ?? "00"}`);
}

export function mockPropose(contact: InboundContact, _state: HouseholdState, v: Verification): ProposedAction[] {
  const m = contact.message.toLowerCase();
  const out: ProposedAction[] = [];
  const ref = v.order?.id ?? v.booking?.id;
  if (/otp|pin|code/.test(m)) out.push({ type: "share_otp", refId: ref, detail: "Caller asked for the delivery OTP" });
  if (/bank|upi|card|password/.test(m)) out.push({ type: "share_secret", detail: "Caller asked for payment details" });
  if (/gate|tower|where|kidhar|kahan|address|rasta|flat|lift|गेट|टावर|किधर|कहाँ/.test(m) && v.order)
    out.push({ type: "share_directions", refId: ref, detail: "Directions to the flat" });
  if (/out of|replace|substitute|nahi hai/.test(m)) {
    const item = contact.message.match(/send (.+?) instead/i)?.[1] ?? "the suggested substitute";
    const rupees = Number(m.match(/(\d+)\s*(rupees|rs|₹)/)?.[1] ?? (/twenty/.test(m) ? 20 : 0));
    out.push({ type: "accept_substitution", refId: ref, detail: item, amountInr: rupees });
  }
  if (/move|reschedule|late|shift|instead of/.test(m) && v.booking) out.push({ type: "reschedule_booking", refId: ref, detail: "Provider asked to move the booking", newTime: parseTime(m.replace(/^.*?(to|at|for)\s/, "")) });
  if (!v.verified && out.some((a) => a.type === "share_otp" || a.type === "share_secret")) out.push({ type: "flag_suspicious", detail: "Unverified caller asked for sensitive information" });
  if (!out.length) out.push({ type: "take_message", refId: ref, detail: contact.message });
  return out;
}

export function mockReply(contact: InboundContact, state: HouseholdState, v: Verification, decided: DecidedAction[]) {
  const hi = contact.language.startsWith("hi");
  const parts: string[] = [];
  const en: string[] = [];
  const digest: string[] = [];
  const who = v.order?.merchant ?? v.booking?.provider ?? contact.callerName;
  for (const a of decided) {
    if (a.type === "share_directions" && a.decision === "auto") {
      const r = state.rules.address;
      en.push(`${r.gate}. ${r.directions} Please leave it ${state.rules.dropOff.preferredSpot}.`);
      parts.push(hi ? `${r.society} के गेट 2 से आइए, क्लबहाउस के आगे बाएं तरफ़ दूसरा टावर, टावर B है। बारहवीं मंज़िल, फ़्लैट 1204, खाना दरवाज़े के बाहर शू रैक पर रख दीजिए।` : en[en.length - 1]);
      digest.push(`Guided the ${who} rider to the door.`);
    } else if (a.decision === "deny") {
      en.push("Sorry, I can't share that. Thank you.");
      parts.push(hi ? "माफ़ कीजिए, मैं वो जानकारी नहीं दे सकती। धन्यवाद।" : en[en.length - 1]);
      if (a.type === "share_otp" || a.type === "share_secret") digest.push(`Blocked an unverified caller asking for ${a.type === "share_otp" ? "an OTP" : "payment details"}.`);
    } else if (a.decision === "ask") {
      en.push(`I'll check with ${state.ownerName} and get right back to you.`);
      parts.push(hi ? `मैं ${state.ownerName} से पूछकर अभी बताती हूँ।` : en[en.length - 1]);
      digest.push(`${who}: ${a.detail}. Needs your approval.`);
    } else if (a.type === "accept_substitution") {
      en.push(`Yes, ${a.detail} is fine, please go ahead.`);
      parts.push(hi ? `हाँ, ${a.detail} चलेगा, भेज दीजिए।` : en[en.length - 1]);
      digest.push(`${who} swapped an item: ${a.detail} (fits your rules).`);
    } else if (a.type === "reschedule_booking") {
      en.push("That new time works, thank you for letting us know.");
      parts.push(en[en.length - 1]);
      digest.push(`${who} moved your booking (inside your window).`);
    } else if (a.type === "take_message") {
      en.push(`Thanks, I'll pass that on to ${state.ownerName}.`);
      parts.push(hi ? `धन्यवाद, मैं ${state.ownerName} को बता दूँगी।` : en[en.length - 1]);
      digest.push(`Message from ${who}: "${contact.message.slice(0, 60)}"`);
    }
  }
  return { reply: [...new Set(parts)].join(" "), replyEn: [...new Set(en)].join(" "), digest: digest.join(" ") || `Handled a ${contact.channel} from ${who}.` };
}
