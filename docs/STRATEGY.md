# Strategy — How We Win the Alexa+ Track

## 1. Why the original idea needs a pivot

Original pitch: *"An MCP that connects to Alexa, gets bookings and food/delivery calls automated and replied to while I'm working."*

| Part of the idea | Status in Oct 2026 | Verdict |
|---|---|---|
| "Order food via Alexa" | **Already native** in Alexa+ (Uber Eats + Grubhub, Mar 2026). OpenTable/Yelp booking also native. | ❌ Judges will see a clone |
| "Generic home helper with memory" | Many public repos already do this | ❌ Crowded |
| **"Handle the calls, doorbells and back-and-forth *after* I order, while I'm focused"** | Nobody owns this. Alexa+ places the order, then leaves you alone with 4 driver calls, an OTP, a "which tower?" and a reservation change. | ✅ **This is the gap** |

**The insight:** agentic commerce solved *placing* orders. Nobody solved the **last 100 metres** — the interruptions that come *after*. That's the real pain in the original pitch ("replied effectively when I'm working on something else").

## 2. The pitch

> **FrontDesk** — Alexa+ becomes your home's front desk.
> Focus on your work; FrontDesk fields every delivery call, doorbell and booking back-and-forth using your house rules, and only interrupts you when it truly matters.

(Working name. Alternatives: *Doorstep*, *Porchside*, *Concierge Mode*. Must be trademark-safe — no "Alexa" in the product name.)

### Three pillars
1. **Inbound handling** — a driver calls ("I'm at the gate, which block?"), a courier needs a drop spot, a restaurant says an item is out of stock. FrontDesk answers from your **Household Brief** (address details, gate instructions, leave-at-door rules, substitutes you accept), matched to the **orders it knows you're expecting**.
2. **Outbound bookings** — "Move my 7pm table to 8", "book the plumber for any slot after 3". FrontDesk negotiates within your constraints and confirms.
3. **Focus Digest** — instead of 9 interruptions, one card on the Echo Show / one spoken summary:
   *"While you were heads-down: 2 deliveries left at the door, the restaurant swapped Coke for Diet Coke (you allow that), the salon moved you to 4:30 — approve?"*

### Trust layer (our answer to "only 14% trust AI to act for them")
- **Guardrails engine**: every action is classified *auto / notify / ask*. Spending money, sharing OTPs or door codes, and accepting unknown callers are **ask** by default.
- **Consent ledger**: a readable log of everything FrontDesk said and did on your behalf, with one-tap undo/dispute.
- **Verified-caller matching**: only talks details with callers tied to an expected order (order ID, courier, time window). Unknown caller → polite deflection + logged. This also handles scam "delivery" calls.

## 3. Why this scores on every judging axis

| Criterion | How we win it |
|---|---|
| **Tech Implementation** | Spec-current MCP (2025-11-25, Streamable HTTP) used deeply, not just tools: **resources** (Household Brief, ledger), **prompts**, **elicitation** for approvals, **MCP Apps UI** for the Echo Show digest card, OAuth-ready. Clean TypeScript, tests, one-command local run. Agent brain on **Amazon Bedrock** via **Strands/AgentCore**. |
| **Design** | One coherent loop: Focus ON → things happen → one digest → approve with a word or tap. A polished simulator that shows the Echo Show screen, the caller side and the ledger at the same time. |
| **Potential Impact** | Universal pain (WFH workers, parents, people with accessibility needs, elderly users who get scam "courier" calls). A clear **brand angle**: couriers and restaurants plug into the same MCP to reach customers without a phone call → fits the *"Brand experiences via MCP"* priority. |
| **Quality of Idea** | Builds *on* Alexa+'s native ordering instead of duplicating it — shows we understand the ecosystem. Picks the unloved moment after checkout. |
| **+10% bonus** | We keep a **real friction log** from day 1 (`docs/FRICTION_LOG.md`). Free points most teams skip. |

## 4. Prize stacking
- **Alexa+ track** (primary).
- **AWS Builder mini**: agent on Bedrock + AgentCore Runtime (+ Strands SDK); optional Amazon Connect / Nova Sonic for a real phone line.
- **Open Source mini**: public repo, MIT, clean README, contribution guide.
Each project may win one track prize + one mini prize, so being eligible for both minis raises our odds.

## 5. Demo is king (judged on the first 3 minutes only)
Storyboard (target 2:45):
1. **0:00–0:15 Hook.** Split screen: developer in deep work, phone buzzing nonstop. "9 interruptions in an hour, all for one dinner and two parcels."
2. **0:15–0:30** "Alexa, I'm going heads-down for 2 hours." → FrontDesk focus mode ON (Echo Show card).
3. **0:30–1:20 Live chaos, handled.** In the simulator: a driver calls (lost at the gate → answered from the brief), a restaurant reports an out-of-stock item (auto-substitute per rules), an **unknown "courier" asks for an OTP → refused and flagged as a likely scam**.
4. **1:20–1:50 Booking.** Salon proposes a new time → FrontDesk accepts within constraints; a request outside the rules is held for approval.
5. **1:50–2:20 Focus Digest.** "Alexa, what did I miss?" → one spoken summary + MCP App card → "approve the 4:30" by voice.
6. **2:20–2:45 Under the hood + impact.** Architecture in 10s (MCP spec, Bedrock, AgentCore), consent ledger, the brand-side MCP, close with the tagline.

## 6. Risks & mitigations
| Risk | Mitigation |
|---|---|
| No real Alexa+ access (gated) | FAQ explicitly allows our own simulator. Make the simulator gorgeous and Echo Show-like. MCP server is spec-compliant, so it can plug into any MCP host (also demo it in Claude Desktop to prove it is real). |
| Real phone calls are hard | Core demo uses simulated callers. Stretch: one real phone number via Amazon Connect/Twilio for a 10-second "this is real" moment. |
| Scope creep with ~3 weeks left | Strict MVP in `ROADMAP.md`; the demo script drives scope. |
| Trademarks in video | Fictional brands ("QuickBite", "ParcelGo"). No Swiggy/Zomato/Uber logos. |

## 7. Open questions for brainstorming
- Final name? (FrontDesk / Doorstep / other)
- Solo or team? Who records and edits the video?
- Market framing: India (OTP culture, gated societies, delivery partners calling) vs US (doorstep porch drop). **Recommendation:** India-flavoured hero story (sharper pain, very visual) but generic product.
- Real phone line as a stretch goal: yes or no?
- Should we add a Ring tie-in (doorbell events) as flavour? We can only win one track, but it strengthens the story.
