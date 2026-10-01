# Hackathon Brief — Build, Ship, Shape: Amazon Developer Hackathon

Scraped 2026-10-02 from https://amazonappdev2026.devpost.com/ (+ /rules, /resources, /details/faqs).

## Key dates
| What | When |
|---|---|
| Submission deadline | **2026-10-23, 12:00 PM PT** (= 00:30 IST Oct 24) |
| AWS credits request deadline | 2026-10-21, 12:00 PM PT ($150/person) |
| Judging | 2026-11-09 → 11-20 |
| Winners | 2026-12-03 |

~30,000 registered participants.

## Our target
- **Primary track: Alexa+** — 1st $25K + $15K AWS credits · 2nd $15K + $5K · 3rd $4K + $1K
- **Mini challenge: AWS Builder** — $5K + $5K credits (Bedrock, AgentCore, Strands SDK, Kiro, SageMaker…)
- **Mini challenge: Open Source** — $5K + $5K credits (new public OSS repo during the window)
- A project can win **one track prize + one mini-challenge prize**.
- Alexa+ priority category: **"Brand experiences via MCP integrations."**

## Alexa+ track technical requirements
- A working **Agent Skill** or a **self-hosted MCP server** implementing MCP spec **≥ 2025-11-25** over **Streamable HTTP**.
- Gated Alexa+ tools (Category SDK, MCP Toolkit, CLI, Web Simulator) are **NOT available** to participants → demo via **our own web-based Alexa+ simulator / frontend**.
- No physical device needed. Hosting not required: "a locally runnable public repo plus your demo video is enough."

## Submission checklist
- [ ] Text description (features + how it works)
- [ ] GitHub repo — public w/ OSS license (preferred: also qualifies Open Source mini)
- [ ] Demo video **< 3 min**, public YouTube/Vimeo, English. **Judged on the first 3 minutes only.** Must show project working.
- [ ] Product feedback for every tool/API/SDK used (effectiveness + onboarding)
- [ ] Track + mini-challenge selection
- [ ] **Friction logs** (optional, **up to +10% score bonus**): task, steps, expected vs actual, severity, workaround, actionable suggestion
- [ ] Feature requests (optional, urgency: critical / important / nice-to-have)
- [ ] No third-party trademarks/copyrighted material without permission (careful with Swiggy/Zomato/Uber Eats logos in video!)

Private-repo collaborators (only if private): chris-trag, knmeiss, giolaq, anishamalde, mosesroth, emersonsklar + testing@devpost.com.

## Judging (equally weighted)
1. **Tech Implementation** — code quality, effective use of required tech/APIs
2. **Design** — complete, coherent product experience; intuitive interaction model
3. **Potential Impact** — credible case for real customer needs; realistic audience beyond the hackathon
4. **Quality of the Idea** — creative tool usage; genuine understanding of the ecosystem and end users

## Competitive landscape (public repos already exist)
Home-ops agents (Northbridge, HomeOps), fitness memory (FitLog), smart-home multi-step (Aura+), bounty workflow (BountyPilot), macro data, etc.
→ "Generic home assistant" and "Alexa remembers X" are crowded. Food *ordering* itself is already native in Alexa+ (Uber Eats & Grubhub, launched 2026-03-31).

## Sources
- https://amazonappdev2026.devpost.com/ · /rules · /resources · /details/faqs
- MCP Streamable HTTP: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http
- Agent Skills: https://modelcontextprotocol.io/docs/2026-07-28/develop/build-with-agent-skills
- MCP Apps (UI extension): https://apps.extensions.modelcontextprotocol.io
- Alexa+ food ordering: https://www.techcrunch.com/2026/03/31/alexa-plus-new-food-ordering-experiences-with-uber-eats-and-grubhub/
- Alexa+ MCP partners (Priceline, Lyft, Canva…): https://www.aichatdaily.com/ai-tools/amazon-expands-alexa-plus-mcp-support-new-smart-home
- Agentic commerce trust gap (14% trust AI to order): https://joinhexagon.com/blogs/agentic-commerce-statistics-2026-every-number-you-need-to-kn-mmi9bzwl-pjzd
