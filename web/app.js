// FrontDesk Alexa+ simulator. Plain JS, no build step.
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const hasDevanagari = (s) => /[ऀ-ॿ]/.test(s);
const fmt = (iso) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const params = new URLSearchParams(location.search);
const VIDEO = params.has("video");

async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

// ---------- Voice (Amazon Polly via /api/tts, browser fallback) ----------
window.__audioLog = [];
let busy = 0;
async function speak(text, role) {
  if (!text) return;
  busy++;
  try {
    const url = `/api/tts?role=${encodeURIComponent(role)}&text=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (res.ok) {
      const blob = await res.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      await new Promise((resolve) => {
        audio.onended = resolve;
        audio.onerror = resolve;
        audio.onplaying = () => window.__audioLog.push({ at: Date.now(), url, duration: audio.duration });
        audio.play().catch(() => resolve());
      });
    } else if ("speechSynthesis" in window) {
      await new Promise((resolve) => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = hasDevanagari(text) ? "hi-IN" : "en-IN";
        u.onend = resolve;
        u.onerror = resolve;
        speechSynthesis.speak(u);
        setTimeout(resolve, 400 + text.length * 70);
      });
    }
  } finally {
    busy--;
  }
}

// ---------- Desk / Alexa ----------
const chat = $("#chat");
function bubble(kind, text, who) {
  const el = document.createElement("div");
  el.className = `msg ${kind}`;
  el.innerHTML = `<div class="who">${esc(who)}</div><div class="t">${esc(text)}</div>`;
  chat.append(el);
  chat.scrollTop = chat.scrollHeight;
  return el;
}

function alexaSpeaking(on, text) {
  $("#lightbar").classList.toggle("on", on);
  const cap = $("#caption");
  if (on && text) cap.textContent = text;
  cap.classList.toggle("show", on && !!text && $("#view-app").hidden);
}

async function say(utterance) {
  if (!utterance.trim()) return;
  bubble("user", utterance, "Arjun");
  busy++;
  const pending = api("/api/alexa", { utterance: utterance.replace(/^alexa,?\s*/i, "") });
  await speak(utterance, "user");
  $("#lightbar").classList.add("on");
  const thinking = bubble("alexa thinking", "…", "Alexa");
  try {
    const { speech } = await pending;
    thinking.classList.remove("thinking");
    $(".t", thinking).textContent = speech;
    chat.scrollTop = chat.scrollHeight;
    alexaSpeaking(true, speech);
    await speak(speech, "alexa");
  } catch (e) {
    $(".t", thinking).textContent = "Sorry, something went wrong.";
  } finally {
    alexaSpeaking(false);
    busy--;
  }
}

$("#say-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("#say").value;
  $("#say").value = "";
  say(v);
});
for (const b of document.querySelectorAll("[data-say]")) b.addEventListener("click", () => say(b.dataset.say));

// Push-to-talk (Chrome Web Speech API)
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR) {
  const rec = new SR();
  rec.lang = "en-IN";
  rec.onresult = (e) => say(e.results[0][0].transcript);
  rec.onend = () => $("#mic").classList.remove("rec");
  $("#mic").addEventListener("click", () => {
    $("#mic").classList.add("rec");
    rec.start();
  });
} else $("#mic").hidden = true;

// ---------- Echo Show screen ----------
let appVisible = false;
function showView(name) {
  for (const v of ["idle", "focus", "app"]) $(`#view-${v}`).hidden = v !== name;
}
let clockOffset = 0;
function tick() {
  $("#clock").textContent = new Date(Date.now() + clockOffset).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }).replace(/\s?[ap]m/i, "");
}
setInterval(tick, 5000);
tick();

// MCP Apps host bridge (ui/* JSON-RPC over postMessage)
const frame = $("#app-frame");
let lastToolResult = null;
window.addEventListener("message", async (e) => {
  if (e.source !== frame.contentWindow) return;
  const m = e.data;
  if (!m || m.jsonrpc !== "2.0") return;
  const reply = (result) => frame.contentWindow.postMessage({ jsonrpc: "2.0", id: m.id, result }, "*");
  if (m.method === "ui/initialize")
    reply({ protocolVersion: "2026-01-26", hostInfo: { name: "alexa-plus-simulator", version: "0.1.0" }, hostCapabilities: { serverTools: {} }, hostContext: { theme: "dark", displayMode: "inline", platform: "echo-show" } });
  else if (m.method === "ui/notifications/initialized" && lastToolResult) postToolResult(lastToolResult);
  else if (m.method === "tools/call") reply(await api("/api/alexa/tool", m.params));
});
function postToolResult(result) {
  lastToolResult = result;
  frame.contentWindow?.postMessage({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: result }, "*");
}

// ---------- Front door line ----------
const calls = $("#calls");
let callCount = 0;
function decisionRow(d) {
  return `<div class="dec"><b class="${d.decision}">${d.decision.toUpperCase()}</b><span><span class="t">${esc(d.type.replaceAll("_", " "))}</span> <span class="r">· ${esc(d.reason)}</span></span></div>`;
}

async function placeCall(sc) {
  $(".empty", calls)?.remove();
  callCount++;
  $("#line-count").textContent = `${callCount} handled`;
  const card = document.createElement("div");
  card.className = "call ringing";
  const initials = sc.callerName.replace(/[^A-Za-z ]/g, "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("") || "?";
  card.innerHTML = `
    <div class="call-h"><div class="avatar">${esc(initials)}</div>
      <div><div class="call-name">${esc(sc.callerName)}</div><div class="call-num">${esc(sc.callerNumber)} · incoming ${esc(sc.channel ?? "call")}</div></div>
      <span class="verify wait">Checking…</span></div>
    <div class="bubble"><div class="who">Caller</div><div class="${hasDevanagari(sc.message) ? "hi" : ""}">${esc(sc.message)}</div>${sc.subtitle ? `<div class="sub-en">${esc(sc.subtitle)}</div>` : ""}</div>
    <div class="decisions"></div>`;
  calls.prepend(card);
  setTicker(`Answering ${sc.callerName}…`);
  busy++;
  try {
    await sleep(VIDEO ? 600 : 300);
    card.classList.remove("ringing");
    const pending = api("/api/caller", sc.key ? { scenario: sc.key } : sc);
    await speak(sc.message, sc.key ?? "frontdeskEn");
    const typing = document.createElement("div");
    typing.className = "typing";
    typing.textContent = "FrontDesk is checking your orders and house rules…";
    card.append(typing);
    const r = await pending;
    typing.remove();
    const v = $(".verify", card);
    v.className = `verify ${r.verified ? "ok" : "bad"}`;
    v.textContent = r.verified ? "✓ Verified caller" : "⚠ Unknown number";
    const decs = $(".decisions", card);
    for (const d of r.decisions) {
      decs.insertAdjacentHTML("beforeend", decisionRow(d));
      await sleep(VIDEO ? 300 : 120);
    }
    const hi = hasDevanagari(r.reply);
    card.insertAdjacentHTML(
      "beforeend",
      `<div class="bubble fd"><div class="who">FrontDesk</div><div class="${hi ? "hi" : ""}">${esc(r.reply)}</div>${hi ? `<div class="sub-en">${esc(r.replyEn)}</div>` : ""}</div>`,
    );
    await speak(r.reply, hi ? "frontdeskHi" : "frontdeskEn");
    setTicker(r.approvals.length ? `Holding 1 item for your OK` : `Handled ${sc.callerName}`);
  } catch (e) {
    card.insertAdjacentHTML("beforeend", `<div class="typing">Error: ${esc(e.message)}</div>`);
  } finally {
    busy--;
  }
}

function setTicker(text) {
  $("#ticker").innerHTML = `<span>${esc(text)}</span>`;
}

// ---------- State + ledger ----------
function renderState({ state, digest, llm, clockOffsetMs }) {
  if (clockOffsetMs !== undefined && clockOffsetMs !== clockOffset) {
    clockOffset = clockOffsetMs;
    tick();
  }
  if (llm) {
    const p = $("#pill-llm");
    p.textContent = llm.mode === "bedrock" ? `LLM: Amazon Bedrock · Claude Haiku 4.5` : "LLM: offline mock";
    p.classList.toggle("live", llm.mode === "bedrock");
  }
  const on = state.focus.on;
  const badge = $("#focus-badge");
  badge.className = `badge ${on ? "on" : "off"}`;
  badge.textContent = on ? `Focus · until ${state.focus.until ? fmt(state.focus.until) : "you're back"}` : "Available";
  if (!appVisible) showView(on ? "focus" : "idle");
  $("#f-handled").textContent = digest.handledCount;
  $("#f-blocked").textContent = digest.blockedCount;
  $("#f-pending").textContent = digest.pendingApprovals.length;
  $("#t-deliveries").textContent = state.orders.filter((o) => o.status !== "delivered").length;
  const next = [...state.bookings].filter((b) => b.status !== "cancelled").sort((a, b) => a.time.localeCompare(b.time))[0];
  if (next) {
    $("#t-next").textContent = fmt(next.time);
    $("#t-next-label").textContent = next.provider;
  }
  if (appVisible) postToolResult({ content: [], structuredContent: digest });
  const rows = $("#ledger");
  rows.innerHTML = state.ledger
    .map(
      (l) =>
        `<div class="lrow"><span class="tm">${fmt(l.at)}</span><span class="ac ${l.actor}">${l.actor}</span><span class="dc">${l.decision ? `<span class="${l.decision}">${l.decision.toUpperCase()}</span>` : ""}</span><span>${esc(l.summary)}</span></div>`,
    )
    .join("");
}

async function refresh() {
  renderState(await api("/api/state"));
}

const es = new EventSource("/api/stream");
es.addEventListener("state", () => refresh());
es.addEventListener("host-tool", (e) => {
  const { name } = JSON.parse(e.data);
  const chip = document.createElement("span");
  chip.className = "tool-chip";
  chip.textContent = `MCP → ${name}()`;
  $("#tools").append(chip);
  setTimeout(() => chip.remove(), 6000);
});
es.addEventListener("host-ui", (e) => {
  const { html, result } = JSON.parse(e.data);
  appVisible = true;
  lastToolResult = result;
  showView("app");
  frame.srcdoc = html;
});
es.addEventListener("host-elicit", (e) => {
  const { message } = JSON.parse(e.data);
  $("#elicit-msg").textContent = message;
  $("#elicit").hidden = false;
  speak(message, "alexa");
});
for (const [id, accept] of [["#elicit-yes", true], ["#elicit-no", false]])
  $(id).addEventListener("click", async () => {
    $("#elicit").hidden = true;
    await api("/api/alexa/elicit", { accept });
  });

// ---------- Director ----------
const scenarios = await api("/api/scenarios");
for (const sc of scenarios) {
  const b = document.createElement("button");
  b.textContent = `📞 ${sc.label}`;
  b.onclick = () => placeCall(sc);
  $("#scenario-buttons").append(b);
}
$("#custom-call").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  placeCall({ ...f, channel: "call" });
});
async function reset() {
  await api("/api/reset", {});
  appVisible = false;
  lastToolResult = null;
  chat.innerHTML = "";
  calls.innerHTML = `<div class="empty">Calls, couriers and doorbells land here.<br/>FrontDesk answers them using your house rules.</div>`;
  callCount = 0;
  $("#line-count").textContent = "No calls yet";
  await refresh();
}
$("#reset").onclick = reset;
document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "d" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") $("#director").hidden = !$("#director").hidden;
});
if (params.has("director")) $("#director").hidden = false;

// ---------- Video helpers: visible cursor + narrator subtitles ----------
let cursor, subtitle;
if (VIDEO) {
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div id="cursor"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M3 2l7 19 2.6-7.4L20 11z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg></div>
     <div id="subtitle"></div>`,
  );
  cursor = $("#cursor");
  subtitle = $("#subtitle");
  cursor.style.left = "960px";
  cursor.style.top = "620px";
}
async function cursorTo(x, y) {
  if (!cursor) return;
  cursor.style.left = `${x}px`;
  cursor.style.top = `${y}px`;
  await sleep(500);
}
async function cursorClickFx() {
  if (!cursor) return;
  cursor.classList.remove("click");
  void cursor.offsetWidth;
  cursor.classList.add("click");
  await sleep(180);
}
async function narrate(text) {
  if (subtitle) {
    subtitle.textContent = text;
    subtitle.classList.add("show");
  }
  await speak(text, "narrator");
  subtitle?.classList.remove("show");
}
async function typeAndSay(text) {
  const input = $("#say");
  const r = input.getBoundingClientRect();
  await cursorTo(r.left + 40, r.top + r.height / 2);
  await cursorClickFx();
  input.focus();
  for (const ch of text) {
    input.value += ch;
    await sleep(30 + Math.random() * 35);
  }
  await sleep(250);
  input.value = "";
  await say(text);
}

// ---------- Automation API (used by the video recorder) ----------
window.demo = {
  narrate,
  typeAndSay,
  cursorTo,
  cursorClickFx,
  say,
  reset,
  call: (key) => placeCall(scenarios.find((s) => s.key === key)),
  idle: async () => {
    while (busy > 0) await sleep(100);
  },
  scenarios,
};

await refresh();
