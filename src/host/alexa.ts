import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { Sha256 } from "@aws-crypto/sha256-js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ElicitRequestSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { SignatureV4 } from "@smithy/signature-v4";
import { converse, type Message, type Tool } from "../agent/llm.js";
import { now as clockNow } from "../clock.js";
import { awsCredentials, config } from "../config.js";

/**
 * Simulated Alexa+ host. Alexa+ developer tooling is gated, so this stands in for it:
 * a genuine MCP client (Streamable HTTP) + an LLM tool-use loop on Amazon Bedrock.
 */
export class AlexaHost {
  readonly events = new EventEmitter();
  private client?: Client;
  private history: Message[] = [];
  private pendingElicit?: (v: { action: "accept" | "decline"; content?: Record<string, unknown> }) => void;
  private uiCache = new Map<string, string>();

  constructor(private mcpUrl: string) {}

  private signedFetch(): typeof fetch | undefined {
    if (!this.mcpUrl.includes("bedrock-agentcore")) return undefined;
    const signer = new SignatureV4({ service: "bedrock-agentcore", region: config.region, credentials: awsCredentials, sha256: Sha256 });
    const sessionId = `frontdesk-sim-${randomUUID()}`; // AgentCore needs >= 33 chars
    return async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      const headers: Record<string, string> = { host: url.host, "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id": sessionId };
      new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
      const signed = await signer.sign({
        method: init?.method ?? "GET",
        protocol: url.protocol,
        hostname: url.hostname,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        headers,
        body: init?.body as string | undefined,
      });
      return fetch(url, { ...init, headers: signed.headers });
    };
  }

  async connect() {
    if (this.client) return this.client;
    const client = new Client({ name: "alexa-plus-simulator", version: "0.1.0" }, { capabilities: { elicitation: { form: {} } } });
    client.setRequestHandler(ElicitRequestSchema, async (req) => {
      const params = req.params as { message: string };
      this.events.emit("elicit", { message: params.message });
      return new Promise((resolve) => (this.pendingElicit = resolve));
    });
    await client.connect(new StreamableHTTPClientTransport(new URL(this.mcpUrl), { fetch: this.signedFetch() }));
    this.client = client;
    const v = client.getServerVersion();
    console.log(`[host] connected to MCP server ${v?.name} ${v?.version} at ${this.mcpUrl}`);
    return client;
  }

  answerElicitation(accept: boolean) {
    this.pendingElicit?.({ action: accept ? "accept" : "decline", content: accept ? { confirm: true } : undefined });
    this.pendingElicit = undefined;
  }

  reset() {
    this.history = [];
  }

  async callTool(name: string, args: Record<string, unknown>) {
    const client = await this.connect();
    this.events.emit("tool", { name, args });
    const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
    const uri = (result._meta?.ui as { resourceUri?: string } | undefined)?.resourceUri;
    if (uri) {
      if (!this.uiCache.has(uri)) {
        const r = await client.readResource({ uri });
        this.uiCache.set(uri, (r.contents[0] as { text: string }).text);
      }
      this.events.emit("ui", { uri, html: this.uiCache.get(uri), result });
    }
    return result;
  }

  private static textOf(r: CallToolResult) {
    return r.content.map((c) => (c.type === "text" ? c.text : "")).join("\n");
  }

  /** Handle one user utterance; returns what Alexa says back. */
  async utter(utterance: string): Promise<string> {
    const client = await this.connect();
    const { tools } = await client.listTools();
    const bedrockTools: Tool[] = tools.map((t) => ({
      toolSpec: { name: t.name, description: t.description ?? t.title ?? t.name, inputSchema: { json: t.inputSchema as never } },
    }));
    const system = `You are Alexa+, a voice assistant on an Echo Show, with the FrontDesk add-on connected over MCP.
The user is Arjun, who works from home in Bengaluru. Respond like a great voice assistant: one to three short spoken sentences, warm, no lists, no markdown, no IDs.
When the user says they're going heads-down/focusing, call set_focus_mode. When they ask what they missed, call get_focus_digest and summarize the highlights and anything that needs approval. If the user says "approve"/"yes, do it"/"decline", call resolve_approval.
Current time (IST): ${clockNow().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" })}.`;

    this.history.push({ role: "user", content: [{ text: utterance }] });
    this.history = this.history.slice(-12);
    while (this.history[0] && (this.history[0].role !== "user" || this.history[0].content?.some((c) => c.toolResult))) this.history.shift();

    for (let i = 0; i < 5; i++) {
      const res = await converse({ system, messages: this.history, tools: bedrockTools, maxTokens: 400 });
      if (!res) return this.mockUtter(utterance);
      this.history.push({ role: "assistant", content: res.content });
      const uses = res.content.filter((c) => c.toolUse);
      if (!uses.length) return res.content.map((c) => c.text ?? "").join(" ").trim();
      const results = [];
      for (const u of uses) {
        const r = await this.callTool(u.toolUse!.name!, (u.toolUse!.input ?? {}) as Record<string, unknown>);
        results.push({ toolResult: { toolUseId: u.toolUse!.toolUseId!, content: [{ text: AlexaHost.textOf(r) }], status: r.isError ? ("error" as const) : ("success" as const) } });
      }
      this.history.push({ role: "user", content: results });
    }
    return "Sorry, I got a bit lost there.";
  }

  /** Offline intent router so the demo runs with no AWS account. */
  private async mockUtter(u: string): Promise<string> {
    const m = u.toLowerCase();
    if (/heads[- ]?down|focus|busy|don'?t disturb|deep work/.test(m)) {
      const hours = Number(m.match(/(\d+)\s*hour/)?.[1] ?? (/two|2/.test(m) ? 2 : 0));
      const mins = Number(m.match(/(\d+)\s*min/)?.[1] ?? 0) + hours * 60;
      const r = await this.callTool("set_focus_mode", { on: true, ...(mins ? { minutes: mins } : {}) });
      return `Got it. ${AlexaHost.textOf(r)} I'll only interrupt you if something really needs you.`;
    }
    if (/miss|catch me up|digest|what happened/.test(m)) {
      const r = await this.callTool("get_focus_digest", {});
      const d = r.structuredContent as { headline: string; items: { text: string; needsApproval?: string }[]; pendingApprovals: { summary: string }[] };
      const highlights = d.items.filter((i) => !i.needsApproval).slice(0, 3).map((i) => i.text).join(" ");
      return `${d.headline} ${highlights} ${d.pendingApprovals.length ? `One thing needs your OK: ${d.pendingApprovals[0].summary} Should I approve it?` : ""}`.trim();
    }
    if (/^(yes|yeah|approve|go ahead|do it|ok)/.test(m) || /approve/.test(m)) return AlexaHost.textOf(await this.callTool("resolve_approval", { approve: true }));
    if (/^(no|decline|deny)/.test(m)) return AlexaHost.textOf(await this.callTool("resolve_approval", { approve: false }));
    if (/deliver|expecting|order/.test(m)) return AlexaHost.textOf(await this.callTool("list_expected_deliveries", {}));
    const move = m.match(/move (?:my )?(.+?) (?:booking |reservation |table )?to (\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (move) {
      let h = Number(move[2]);
      if ((move[4] === "pm" || h < 9) && h < 12) h += 12;
      return AlexaHost.textOf(await this.callTool("reschedule_booking", { booking: move[1], newTime: `${String(h).padStart(2, "0")}:${move[3] ?? "00"}` }));
    }
    if (/booking|reservation/.test(m)) return AlexaHost.textOf(await this.callTool("list_bookings", {}));
    if (/stop|i'?m back|focus off/.test(m)) return AlexaHost.textOf(await this.callTool("set_focus_mode", { on: false }));
    return "I can turn on focus mode, tell you what you missed, or manage your deliveries and bookings.";
  }
}
