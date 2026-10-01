import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fmtTime, type FrontDesk } from "../core/frontdesk.js";
import { todayAt } from "../domain/seed.js";

export const DIGEST_UI_URI = "ui://frontdesk/digest.html";
const MCP_APP_MIME = "text/html;profile=mcp-app";
const digestHtml = () => readFileSync(new URL("../../web/apps/digest.html", import.meta.url), "utf8");

const toIso = (t: string) => (/^\d{1,2}:\d{2}$/.test(t) ? todayAt(t.padStart(5, "0")) : new Date(t).toISOString());
const text = (t: string, structuredContent?: Record<string, unknown>) => ({
  content: [{ type: "text" as const, text: t }],
  ...(structuredContent ? { structuredContent } : {}),
});

/** One MCP server per session. `householdId` scopes all state. */
export function createMcpServer(fd: FrontDesk, householdId = "demo") {
  const server = new McpServer(
    { name: "frontdesk", title: "FrontDesk", version: "0.1.0" },
    {
      capabilities: { logging: {} },
      instructions:
        "FrontDesk is the user's home front desk. It answers delivery/courier/restaurant/booking calls on their behalf under deterministic house rules, " +
        "and keeps a consent ledger. Use set_focus_mode when the user wants to focus or go heads-down. Use get_focus_digest when they ask what they missed. " +
        "Use resolve_approval when they approve or decline something FrontDesk held for them. Keep spoken answers short.",
    },
  );

  // ---------- Tools ----------
  server.registerTool(
    "set_focus_mode",
    {
      title: "Set focus mode",
      description: "Turn focus mode on or off. While on, FrontDesk handles all deliveries, calls and booking changes and only holds what needs approval.",
      inputSchema: { on: z.boolean(), minutes: z.number().int().positive().max(720).optional().describe("How long to stay focused") },
      annotations: { idempotentHint: true },
    },
    async ({ on, minutes }) => {
      const s = await fd.state(householdId);
      const f = await fd.setFocus(householdId, on, minutes);
      const expecting = s.orders.filter((o) => o.status !== "delivered").length;
      const next = [...s.bookings].sort((a, b) => a.time.localeCompare(b.time))[0];
      return text(
        on
          ? `Focus mode is on${minutes ? ` until ${fmtTime(f.until!)}` : ""}. FrontDesk is watching ${expecting} deliveries and ${s.bookings.length} bookings${next ? ` (next: ${next.provider} at ${fmtTime(next.time)})` : ""}.`
          : "Focus mode is off.",
        { focus: f, expectingDeliveries: expecting },
      );
    },
  );

  server.registerTool(
    "get_focus_digest",
    {
      title: "What did I miss?",
      description: "Summary of everything FrontDesk handled during focus mode, including items waiting for approval. Renders a card on screen devices.",
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: DIGEST_UI_URI } },
    },
    async () => {
      const s = await fd.state(householdId);
      const d = fd.digest(s);
      const lines = [d.headline, ...d.items.filter((i) => !i.needsApproval).map((i) => `- ${i.text}`), ...d.pendingApprovals.map((p) => `- NEEDS OK [${p.id}]: ${p.summary}`)];
      return { ...text(lines.join("\n"), d), _meta: { ui: { resourceUri: DIGEST_UI_URI } } };
    },
  );

  server.registerTool(
    "resolve_approval",
    {
      title: "Approve or decline",
      description: "Approve or decline something FrontDesk is holding. If approvalId is omitted and exactly one item is pending, that one is used.",
      inputSchema: { approve: z.boolean(), approvalId: z.string().optional() },
    },
    async ({ approve, approvalId }) => {
      const s = await fd.state(householdId);
      const pending = s.approvals.filter((a) => a.status === "pending");
      const target = approvalId ? pending.find((p) => p.id === approvalId || p.id.endsWith(approvalId)) : pending.length === 1 ? pending[0] : undefined;
      if (!target) return text(pending.length ? `Which one? Pending: ${pending.map((p) => `[${p.id}] ${p.summary}`).join(" ")}` : "Nothing is waiting for approval.");
      const p = await fd.resolveApproval(householdId, target.id, approve);
      return text(`${approve ? "Approved" : "Declined"}: ${p.summary} FrontDesk has let them know.`, { approval: p });
    },
  );

  server.registerTool(
    "list_expected_deliveries",
    { title: "Expected deliveries", description: "Orders FrontDesk is expecting today.", annotations: { readOnlyHint: true } },
    async () => {
      const s = await fd.state(householdId);
      const active = s.orders.filter((o) => o.status !== "delivered" && o.status !== "cancelled");
      return text(active.map((o) => `${o.merchant}: ${o.items.join(", ")} (${o.status.replaceAll("_", " ")}, ETA ${fmtTime(o.eta)})`).join("\n"), {
        orders: active.map(({ otp: _otp, ...o }) => o),
      });
    },
  );

  server.registerTool(
    "list_bookings",
    { title: "Bookings", description: "Today's bookings and reservations.", annotations: { readOnlyHint: true } },
    async () => {
      const s = await fd.state(householdId);
      return text(s.bookings.filter((b) => b.status !== "cancelled").map((b) => `[${b.id}] ${b.provider} at ${fmtTime(b.time)}${b.partySize ? ` for ${b.partySize}` : ""}`).join("\n"), {
        bookings: s.bookings,
      });
    },
  );

  server.registerTool(
    "reschedule_booking",
    {
      title: "Reschedule a booking",
      description: "Move a booking. If the new time is outside the user's house rules, FrontDesk asks for confirmation first.",
      inputSchema: {
        booking: z.string().describe("Booking id or provider name, e.g. 'Glow Studio'"),
        newTime: z.string().describe("HH:MM (24h, IST, today) or ISO-8601"),
        confirmed: z.boolean().optional().describe("Set true only after the user explicitly confirmed an out-of-rules time"),
      },
    },
    async ({ booking, newTime, confirmed }) => {
      const s = await fd.state(householdId);
      const b = s.bookings.find((x) => x.id === booking || x.provider.toLowerCase().includes(booking.toLowerCase()));
      if (!b) return text(`I couldn't find a booking for "${booking}".`);
      const iso = toIso(newTime);
      let res = await fd.rescheduleBooking(householdId, b.id, iso, !!confirmed);
      if (!res.ok) {
        // Prefer a native MCP elicitation when the client supports it.
        const caps = server.server.getClientCapabilities();
        if (caps?.elicitation) {
          const answer = await server.server.elicitInput({
            mode: "form",
            message: `${fmtTime(iso)} is ${res.reason.toLowerCase()} Move ${b.provider} anyway?`,
            requestedSchema: { type: "object", properties: { confirm: { type: "boolean", title: "Move it anyway" } }, required: ["confirm"] },
          });
          if (answer.action === "accept" && answer.content?.confirm) res = await fd.rescheduleBooking(householdId, b.id, iso, true);
          else return text(`Okay, ${b.provider} stays at ${fmtTime(b.time)}.`);
        } else {
          return text(`That's ${res.reason.toLowerCase()} Ask the user to confirm, then call again with confirmed=true.`, { needsConfirmation: true });
        }
      }
      return text(`Done. ${b.provider} moved to ${fmtTime(iso)} and confirmed with them.`, { booking: res.booking });
    },
  );

  server.registerTool(
    "create_booking",
    {
      title: "Make a booking",
      description: "Book a table, salon slot or home service.",
      inputSchema: {
        kind: z.enum(["salon", "restaurant", "home_service"]),
        provider: z.string(),
        time: z.string().describe("HH:MM (24h, IST, today) or ISO-8601"),
        partySize: z.number().int().positive().optional(),
      },
    },
    async ({ kind, provider, time, partySize }) => {
      const b = await fd.createBooking(householdId, { kind, provider, time: toIso(time), partySize });
      return text(`Booked ${b.provider} at ${fmtTime(b.time)}${partySize ? ` for ${partySize}` : ""}.`, { booking: b });
    },
  );

  server.registerTool(
    "handle_inbound_contact",
    {
      title: "Contact the household",
      description:
        "For couriers, restaurants and service providers (brand integrations): reach the household without a phone call. FrontDesk verifies you against active orders/bookings and replies under the house rules.",
      inputSchema: {
        callerName: z.string(),
        callerNumber: z.string().describe("Registered number for the order/booking"),
        message: z.string(),
        language: z.string().default("en-IN"),
        channel: z.enum(["call", "doorbell", "chat"]).default("chat"),
      },
      annotations: { openWorldHint: true },
    },
    async (args) => {
      const r = await fd.handleInbound(householdId, args);
      return text(r.reply, { reply: r.reply, replyEn: r.replyEn, verified: r.verified, decisions: r.decisions.map(({ type, decision }) => ({ type, decision })) });
    },
  );

  server.registerTool(
    "update_house_rules",
    {
      title: "Update house rules",
      description: "Change how FrontDesk handles things, e.g. drop-off spot or which booking times are auto-accepted.",
      inputSchema: {
        preferredSpot: z.string().optional(),
        leaveAtDoor: z.boolean().optional(),
        maxPriceIncreaseInr: z.number().int().min(0).optional(),
        bookingEarliest: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        bookingLatest: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      },
    },
    async (p) => {
      const s = await fd.updateRules(householdId, p);
      return text("House rules updated.", { rules: s });
    },
  );

  // ---------- Resources ----------
  server.registerResource(
    "household-brief",
    "frontdesk://brief",
    { title: "Household brief", description: "Address, drop-off rules, swap rules, booking window. What FrontDesk tells verified callers.", mimeType: "application/json" },
    async (uri) => {
      const s = await fd.state(householdId);
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(s.rules, null, 2) }] };
    },
  );

  server.registerResource(
    "consent-ledger",
    "frontdesk://ledger",
    { title: "Consent ledger", description: "Everything FrontDesk said and did on the household's behalf.", mimeType: "application/json" },
    async (uri) => {
      const s = await fd.state(householdId);
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(s.ledger, null, 2) }] };
    },
  );

  server.registerResource(
    "digest-card",
    DIGEST_UI_URI,
    { title: "Focus digest card", description: "MCP App UI for screen devices (Echo Show).", mimeType: MCP_APP_MIME },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: MCP_APP_MIME, text: digestHtml() }] }),
  );

  // ---------- Prompts ----------
  server.registerPrompt(
    "heads-down",
    { title: "Go heads-down", description: "Start focus mode and let FrontDesk take over.", argsSchema: { minutes: z.string().optional() } },
    ({ minutes }) => ({
      messages: [{ role: "user", content: { type: "text", text: `I'm going heads-down${minutes ? ` for ${minutes} minutes` : ""}. Turn on focus mode and handle everything you can.` } }],
    }),
  );

  server.registerPrompt("what-did-i-miss", { title: "What did I miss?", description: "Catch up after focus mode." }, () => ({
    messages: [{ role: "user", content: { type: "text", text: "What did I miss? Summarize briefly and tell me what needs my OK." } }],
  }));

  return server;
}
