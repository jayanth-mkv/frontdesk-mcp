# Architecture (proposed — confirm during brainstorm)

```
 ┌──────────────────────┐        Streamable HTTP (MCP 2025-11-25)       ┌─────────────────────────────┐
 │  Alexa+ (real, gated) │ ─────────────────────────────────────────────▶│                             │
 │  ── or ──             │                                                │   FrontDesk MCP Server      │
 │  Web Simulator        │◀────── MCP Apps UI (digest card) ──────────────│   (TypeScript, self-hosted) │
 │  (Echo Show mock +    │                                                │                             │
 │   caller panel +      │                                                │  tools / resources / prompts│
 │   ledger)             │                                                │  elicitation for approvals  │
 └──────────┬───────────┘                                                └──────┬───────────┬──────────┘
            │ simulated callers / events                                        │           │
            ▼                                                                   ▼           ▼
 ┌──────────────────────┐                                         ┌────────────────┐  ┌──────────────┐
 │  Event sources       │ ── webhooks ──────────────────────────▶ │ Agent brain    │  │ Store        │
 │  courier, restaurant,│                                         │ Bedrock (Claude)│  │ SQLite local │
 │  salon, doorbell,    │                                         │ via Strands /  │  │ (DynamoDB on │
 │  (stretch) phone     │                                         │ AgentCore      │  │  AWS)        │
 └──────────────────────┘                                         └────────────────┘  └──────────────┘
```

## Components
| Component | Role | Tech |
|---|---|---|
| `server/` | MCP server: the product surface Alexa+ talks to | TypeScript, `@modelcontextprotocol/sdk`, Streamable HTTP |
| `server/agent` | Decides how to reply to an inbound contact using the brief, the expected orders and the guardrails | Amazon Bedrock (Claude), Strands Agents SDK; AgentCore Runtime for deploy |
| `server/guardrails` | Deterministic policy: auto / notify / ask. **The LLM never bypasses it.** | Pure TS, unit-tested |
| `simulator/` | Our Alexa+ stand-in: voice/text box, Echo Show-style screen, "phone" panel for callers, live ledger | Vite + React (or plain web), Web Speech API for voice |
| `store` | Orders, brief, contacts, ledger | SQLite locally (zero setup for judges) |

## MCP surface (draft)
**Tools**
- `set_focus_mode(on, until?)`
- `get_focus_digest()` → text + MCP App UI card
- `list_expected_deliveries()` / `register_order(source, details)`
- `handle_inbound_contact(channel, caller, message)` → reply + actions taken
- `request_booking(kind, constraints)` / `reschedule_booking(id, constraints)`
- `approve_action(id)` / `deny_action(id)` (also offered via **elicitation**)
- `update_house_rules(patch)`

**Resources**
- `frontdesk://brief` (Household Brief) · `frontdesk://ledger` · `frontdesk://orders/{id}`

**Prompts**
- `heads-down` (start focus with sensible defaults) · `what-did-i-miss`

## Principles
- **Judges must run it in one command**: `npm install && npm run dev` starts the server + simulator with seeded demo data. Mock LLM mode works without AWS keys.
- **Policy before LLM**: guardrails are deterministic code, so the demo stays reliable and safe.
- **Every action is written to the ledger.**
