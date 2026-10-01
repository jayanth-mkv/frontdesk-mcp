# Project Status: FrontDesk for Alexa+

**As of:** 2026-10-02 · **Deadline:** 2026-10-23 12:00 PM PT (21 days left) · **Target:** Alexa+ track 1st place, plus the AWS Builder and Open Source mini challenges

## At a glance

| Area | Status | Notes |
|---|---|---|
| Idea and strategy | ✅ Done | Pivoted from "Alexa orders food" (already native in Alexa+) to **FrontDesk**: handles the interruptions *after* the order. See [STRATEGY.md](STRATEGY.md). |
| MCP server | ✅ Working | Spec 2025-11-25, Streamable HTTP, 8 tools, 3 resources, 2 prompts, elicitation, MCP Apps UI |
| Guardrails (policy engine) | ✅ Working | Deterministic; 10/10 unit tests pass |
| Alexa+ simulator (web) | ✅ Working | Echo Show screen, call panel, consent ledger, voice |
| Offline mock mode | ✅ Working | Full demo runs with no AWS account (judges' path) |
| Amazon Polly voices | ✅ Working | Generative Hindi and English voices, disk-cached |
| Amazon Bedrock (Claude) | ⛔ Blocked by AWS | Account verification hold, see [Blockers](#blockers) |
| AWS infra (Terraform) | 🟡 Partly deployed | DynamoDB, ECR, IAM and the image are live; the AgentCore runtime is blocked by quota |
| Demo video | 🟡 Pipeline built, test take ran | Automated recorder works, but the take is about 4:35 and must be under 3:00 |
| README, Devpost write-up | ⬜ Not started | |
| Public GitHub repo | ✅ Done | [jayanth-mkv/frontdesk-mcp](https://github.com/jayanth-mkv/frontdesk-mcp), MIT |
| Friction log | 🟡 Ongoing | 5 entries, see [FRICTION_LOG.md](FRICTION_LOG.md) |

**Overall: about 60% done.** The product works end to end. What's left is mostly unblocking AWS, real-LLM polish, the final video, and the submission materials.

---

## What we built

### The product
FrontDesk turns Alexa+ into a home front desk. While the user is in focus mode, it:
1. **Answers inbound calls** (delivery riders, restaurants, salons) using the household's house rules and the orders it knows are coming. It replies in the caller's language, including Hindi.
2. **Runs every proposed action through a deterministic policy engine**: auto / notify / ask / deny. The LLM proposes; code decides. OTPs, door codes and payment details are never shared without approval, and never with unverified callers.
3. **Gives one Focus Digest** instead of many interruptions, as voice plus an Echo Show card. Approvals take one word or one tap.
4. **Logs everything** to a consent ledger.

### Code map
| Path | What it does |
|---|---|
| [src/mcp/server.ts](../src/mcp/server.ts) | MCP server: tools `set_focus_mode`, `get_focus_digest`, `resolve_approval`, `list_expected_deliveries`, `list_bookings`, `reschedule_booking` (uses **elicitation**), `create_booking`, `handle_inbound_contact` (the brand-integration entry point), `update_house_rules`; resources `frontdesk://brief`, `frontdesk://ledger`, `ui://frontdesk/digest.html` (an **MCP App**); prompts `heads-down`, `what-did-i-miss` |
| [src/core/guardrails.ts](../src/core/guardrails.ts) | Caller verification and policy decisions (+ [tests](../src/core/guardrails.test.ts)) |
| [src/core/frontdesk.ts](../src/core/frontdesk.ts) | Engine: verify → propose → decide → apply → reply → ledger → digest |
| [src/agent/inbound.ts](../src/agent/inbound.ts) | Two-step LLM flow (propose actions, then write the reply under the decisions), with an offline fallback |
| [src/agent/llm.ts](../src/agent/llm.ts) | Bedrock Converse wrapper; switches to mock mode automatically if AWS is unavailable |
| [src/host/alexa.ts](../src/host/alexa.ts) | **Simulated Alexa+ host**: a real MCP client (Streamable HTTP, SigV4 for AgentCore) plus a Bedrock tool-use loop |
| [src/voice/polly.ts](../src/voice/polly.ts) | Amazon Polly text-to-speech with a disk cache |
| [src/sim/scenarios.ts](../src/sim/scenarios.ts) | Four scripted demo callers: Hindi rider, out-of-stock kitchen, fake OTP courier, salon reschedule |
| [src/main.ts](../src/main.ts) | HTTP: `/mcp` (stateful locally, stateless on AgentCore), `/ping`, simulator API, live updates |
| [web/](../web/) | Simulator UI and the MCP App digest card ([web/apps/digest.html](../web/apps/digest.html)) |
| [infra/terraform/](../infra/terraform/) | DynamoDB, ECR, ARM64 image build and push, IAM runtime role, AgentCore Runtime (MCP protocol), $100 budget |
| [infra/iam-policy-frontdesk-dev.json](../infra/iam-policy-frontdesk-dev.json) | Developer permission set for the SSO role (applied by the user) |
| [scripts/record-video.ts](../scripts/record-video.ts) | Automated video: title/architecture/closing cards, human-like demo run (cursor, typing), Polly narration, ffmpeg mix and assembly |
| [video/cards/](../video/cards/) | Title, architecture and closing cards |

### Decisions made
| Decision | Choice | Why |
|---|---|---|
| Product name | FrontDesk | Clear; avoids the "Alexa" trademark in the product name |
| Demo setting | India (Bengaluru, Hindi rider) | Sharper pain (gated societies, OTPs, constant rider calls); multilingual is a strong demo moment |
| Language/runtime | TypeScript on Node 22 | Official MCP SDK; one codebase for server and simulator |
| LLM | Claude Haiku 4.5 on Bedrock (Sonnet 4.5 for the Alexa conversation once unlocked) | Fast and cheap for call handling; Sonnet for on-camera polish |
| Hosting | Bedrock AgentCore Runtime (MCP protocol) | Native AWS MCP hosting; counts for the AWS Builder mini challenge |
| State | One DynamoDB item per household (in-memory store locally) | Tiny state; zero setup for judges |
| Voices | Amazon Polly generative: Kajal (FrontDesk, Hindi and English), Aditi (rider), Ruth (Alexa), Matthew (Arjun), Brian (narrator), Jasmine, Stephen and Danielle (callers) | Every voice distinct; all AWS |
| Infra as code | Terraform with the `me` SSO profile, region ap-southeast-1 | User request |
| Real phone line | Not doing it | Cost and risk; simulated callers are enough |
| Demo clock | `DEMO_NOW=13:05` | The video reads like a workday whenever it's recorded |

These differ from the original plan in [ARCHITECTURE.md](ARCHITECTURE.md): no Strands SDK (direct Bedrock Converse is simpler in TypeScript), no SQLite (the in-memory and DynamoDB stores are enough), and no Vite (plain HTML/JS, no build step).

---

## Verified so far
- `npx tsc --noEmit`: clean.
- `npx vitest run`: **10/10 guardrail tests pass**. They cover OTP denial for unknown callers, ask-before-OTP for verified couriers, never sharing secrets, swap rules, and the booking window.
- **End-to-end smoke test through real MCP calls** (offline mode):
  - Hindi rider → verified → `share_directions: AUTO` → directions given
  - Fake courier asking for an OTP → unverified → `share_otp: DENY` + `flag_suspicious: AUTO`
  - Salon move to 6:30 PM → `reschedule_booking: ASK` → held, then approved by voice
  - "What did I miss?" → digest: 4 handled, 1 blocked, 1 needs approval
- **Polly**: all voices synthesize, including Hindi (Devanagari) with the Kajal generative voice.
- **Video test take**: the cards render, the live demo records at 1920×1080, and all 18 audio clips were captured. It was interrupted before the final mix.

## AWS resources (ap-southeast-1)
| Resource | Name | State |
|---|---|---|
| DynamoDB table | `frontdesk-households` | ✅ Created (on-demand) |
| ECR repository | `frontdesk-mcp` (keeps the last 3 images) | ✅ Created, ARM64 image pushed |
| IAM role and policy | `frontdesk-agentcore-runtime` | ✅ Created (least privilege) |
| AgentCore Runtime | `frontdesk_mcp` | ⛔ `maxAgents limit exceeded` (quota is 0) |
| Budget alert ($100) | `frontdesk-prototype` | ⬜ Waiting on the alert email (`budget_email` variable) |

**Spend so far: under $1** (Polly test clips plus a few cents of ECR storage). Projected total for the hackathon: **under $10**.

---

## Blockers

| # | Blocker | Evidence | Owner | Fix |
|---|---|---|---|---|
| 1 | **Bedrock blocked at the account level** | `ValidationException: Operation not allowed` for all models, including Amazon Nova, in ap-southeast-1 and ap-south-1; ap-south-1 earlier said *"Your account is currently being verified."* IAM is fine and SCPs are disabled. | **User → AWS Support** | Open a case: Account and billing → account verification / Bedrock access. Check the payment method is valid. |
| 2 | **Anthropic use-case form not submitted** | `GetUseCaseForModelAccess`: "You have not filled out the request form" | **User** | Bedrock console → Model catalog → Claude Haiku 4.5 → submit the form |
| 3 | **AgentCore quota is 0** | `CreateAgentRuntime: ServiceQuotaExceededException: maxAgents limit exceeded` with no runtimes | **User → AWS** | Service Quotas → Bedrock AgentCore → request 5, or add it to the support case |
| 4 | **Video too long** | Raw demo 225 s + cards 50 s ≈ 4:35 | **Claude** | Trim plan below |
| 5 | ~~GitHub repo name~~ | Resolved: `frontdesk-mcp` (keeps "Alexa" out of the name per trademark guidelines) | | Done |
| 6 | Budget alert email | Needed to turn on the $100 budget | **User** | Give the email address |

### Video trim plan (target ≤ 2:50)
- Shorten the title narration (18 s → 8 s) and the architecture narration (24 s → 14 s).
- Run the four calls with shorter gaps, and drop the narration after the kitchen and salon calls. Let the on-screen decision chips speak.
- Shorten the caller lines and FrontDesk replies (Claude will also be more concise than the offline templates).
- Speed up the typing and cursor moves slightly.

---

## Next steps

**While AWS is blocked (Claude):**
1. Trim the video script and re-run the test take to get under 3:00 with good audio sync.
2. Write the README (one-command run, screenshots, architecture, judges' guide).
3. Draft the Devpost write-up and product feedback.
4. Add a small integration test for the MCP server (initialize → list tools → call tools).

**Once AWS unblocks:**
5. Smoke-test with Claude on Bedrock; tune the prompts for short, natural replies.
6. `terraform apply` → AgentCore Runtime live; test the simulator against the deployed MCP endpoint.
7. Record the final video with Claude and Polly, then upload it to YouTube (user).

**Before the deadline:**
8. Push final changes to the public repo and submit on Devpost with the friction logs and feature requests.

## Submission checklist
- [x] Working MCP server, spec ≥ 2025-11-25 over Streamable HTTP
- [x] Simulated Alexa+ experience (allowed by the FAQ)
- [x] Mock mode so judges can run it without AWS
- [ ] Bedrock in use (AWS Builder mini)
- [ ] AgentCore deployment (AWS Builder mini)
- [x] Public repo with MIT license (Open Source mini)
- [ ] Demo video < 3:00 on YouTube
- [ ] Devpost text description
- [ ] Product feedback on each AWS tool used
- [ ] Friction logs (up to +10%)
- [ ] Track and mini-challenge selection
