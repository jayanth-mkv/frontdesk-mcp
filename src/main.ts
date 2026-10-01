import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { llmStatus } from "./agent/llm.js";
import { clockOffsetMs } from "./clock.js";
import { config } from "./config.js";
import { FrontDesk } from "./core/frontdesk.js";
import { AlexaHost } from "./host/alexa.js";
import { createMcpServer } from "./mcp/server.js";
import { SCENARIOS } from "./sim/scenarios.js";
import { createStore } from "./store/store.js";
import { tts, VOICES, type VoiceSpec } from "./voice/polly.js";

const HOUSEHOLD = "demo";
const stateless = process.env.MCP_STATELESS === "1" || config.store === "dynamodb";
const fd = new FrontDesk(createStore());
const app = express();
app.use(express.json({ limit: "1mb" }));

// ---------- MCP (spec 2025-11-25, Streamable HTTP) ----------
const sessions = new Map<string, StreamableHTTPServerTransport>();

async function handleMcp(req: Request, res: Response) {
  if (stateless) {
    // AgentCore Runtime: one server + transport per request, state lives in DynamoDB.
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    const server = createMcpServer(fd, HOUSEHOLD);
    res.on("close", () => void transport.close().then(() => server.close()));
    await server.connect(transport);
    return transport.handleRequest(req, res, req.body);
  }
  const sid = req.header("mcp-session-id");
  let transport = sid ? sessions.get(sid) : undefined;
  if (!transport) {
    if (req.method !== "POST" || !isInitializeRequest(req.body)) {
      return res.status(sid ? 404 : 400).json({ jsonrpc: "2.0", error: { code: -32000, message: sid ? "Unknown session" : "Initialize first" }, id: null });
    }
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => void sessions.set(id, transport!),
    });
    transport.onclose = () => transport!.sessionId && sessions.delete(transport!.sessionId);
    await createMcpServer(fd, HOUSEHOLD).connect(transport);
  }
  return transport.handleRequest(req, res, req.body);
}

app.all("/mcp", (req, res) => {
  handleMcp(req, res).catch((err) => {
    console.error("[mcp]", err);
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
  });
});
app.get("/ping", (_req, res) => res.json({ status: "Healthy", time_of_last_update: Math.floor(Date.now() / 1000) }));

// ---------- Simulator (our stand-in for the gated Alexa+ tools) ----------
if (process.env.SIMULATOR !== "off") {
  const host = new AlexaHost(config.mcpUrl ?? `http://127.0.0.1:${config.port}/mcp`);
  const clients = new Set<Response>();
  const send = (type: string, data: unknown) => {
    const line = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of clients) c.write(line);
  };
  for (const ev of ["state", "ledger", "contact", "decisions"]) fd.events.on(ev, (d) => send(ev, d));
  for (const ev of ["tool", "ui", "elicit"]) host.events.on(ev, (d) => send(`host-${ev}`, d));

  const snapshot = async () => {
    const s = await fd.state(HOUSEHOLD);
    return { state: s, digest: fd.digest(s), llm: llmStatus(), mcp: config.mcpUrl ?? "local", clockOffsetMs: clockOffsetMs() };
  };

  app.get("/api/stream", (req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write(": hi\n\n");
    clients.add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 15000);
    req.on("close", () => (clearInterval(ping), clients.delete(res)));
  });
  app.get("/api/state", async (_req, res) => res.json(await snapshot()));
  app.get("/api/scenarios", (_req, res) => res.json(SCENARIOS));

  app.post("/api/reset", async (_req, res) => {
    await fd.reset(HOUSEHOLD);
    host.reset();
    res.json(await snapshot());
  });

  app.post("/api/alexa", async (req, res) => {
    try {
      const speech = await host.utter(String(req.body.utterance ?? ""));
      send("alexa-speech", { speech });
      res.json({ speech });
    } catch (err) {
      console.error("[alexa]", err);
      res.status(500).json({ error: (err as Error).message });
    }
  });
  // MCP Apps bridge: the digest card calls tools through the host, like a real MCP App would.
  app.post("/api/alexa/tool", async (req, res) => {
    try {
      res.json(await host.callTool(String(req.body.name), req.body.arguments ?? {}));
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });
  app.post("/api/alexa/elicit", (req, res) => {
    host.answerElicitation(!!req.body.accept);
    res.json({ ok: true });
  });

  app.post("/api/caller", async (req, res) => {
    try {
      const sc = SCENARIOS.find((s) => s.key === req.body.scenario);
      const input = sc
        ? { callerName: sc.callerName, callerNumber: sc.callerNumber, channel: sc.channel, language: sc.language, message: sc.message }
        : { callerName: req.body.callerName, callerNumber: req.body.callerNumber, channel: req.body.channel ?? "call", language: req.body.language ?? "en-IN", message: req.body.message };
      const r = await fd.handleInbound(HOUSEHOLD, input);
      res.json(r);
    } catch (err) {
      console.error("[caller]", err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/tts", async (req, res) => {
    const role = String(req.query.role ?? "");
    const v: VoiceSpec =
      (VOICES as Record<string, VoiceSpec>)[role] ??
      SCENARIOS.find((s) => s.key === role)?.voice ?? { voice: String(req.query.voice ?? "Kajal"), lang: String(req.query.lang ?? "en-IN"), engine: "neural" };
    const audio = await tts(String(req.query.text ?? "").slice(0, 1500), v);
    if (!audio) return res.status(503).json({ fallback: "browser" });
    res.type("audio/mpeg").send(audio);
  });

  app.use(express.static(fileURLToPath(new URL("../web", import.meta.url))));
}

app.listen(config.port, "0.0.0.0", () => {
  console.log(`FrontDesk MCP on http://localhost:${config.port}/mcp (${stateless ? "stateless" : "stateful"}, store=${config.store}, llm=${config.llmMode})`);
  if (process.env.SIMULATOR !== "off") console.log(`Alexa+ simulator on http://localhost:${config.port}`);
});
