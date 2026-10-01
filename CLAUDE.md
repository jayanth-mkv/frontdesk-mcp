# CLAUDE.md

## Project
**FrontDesk** (working name; Devpost entry "Alexa+ Delivery MCP") is a self-hosted MCP server that turns Alexa+ into a home front desk. It fields delivery calls, doorbell events and booking back-and-forth while the user is focused, then gives one digest.

Entry for the **Amazon "Build, Ship, Shape" hackathon**: Alexa+ track + AWS Builder and Open Source mini challenges. **Hard deadline: 2026-10-23 12:00 PM PT.**

## Read first
- `docs/STATUS.md`: **where things stand**, blockers and next steps. Update it when something ships or unblocks.
- `docs/STRATEGY.md`: the idea, why it wins, the demo storyboard. The **demo script drives scope**.
- `docs/research/hackathon-brief.md`: rules, judging, submission checklist.
- `docs/ARCHITECTURE.md`: components and the MCP surface.
- `docs/ROADMAP.md`: what's next and the MVP cut line.

## Non-negotiables
- MCP spec **≥ 2025-11-25** over **Streamable HTTP** (track requirement).
- Judges must run it locally with one command, with seeded demo data and a **mock LLM mode that needs no AWS keys**.
- Guardrails are deterministic code. The LLM never shares OTPs or door codes, or spends money, without an explicit approval.
- Every action FrontDesk takes is written to the consent ledger.
- Only fictional brands in code, seed data and the video (no Swiggy/Zomato/Uber Eats trademarks).
- Public repo, MIT license.

## Working agreements
- When a tool, SDK or docs page causes friction, add an entry to `docs/FRICTION_LOG.md` right away (it is worth a judging bonus).
- Keep it simple: the smallest thing that makes the demo convincing. Stretch goals stay in `ROADMAP.md` until the MVP is done.
- Update the docs when a decision changes.

## Stack
TypeScript / Node 22 · `@modelcontextprotocol/sdk` · Amazon Bedrock Converse (Claude) · Amazon Polly · DynamoDB · AgentCore Runtime · plain HTML/JS simulator (no build step) · Terraform (`infra/terraform`, AWS profile `me`, region ap-southeast-1).

## Commands
- `npm start`: server + simulator on http://localhost:8000 (MCP at `/mcp`). Set `AWS_PROFILE=me` for Bedrock and Polly; it falls back to offline mock mode without AWS.
- `npm test`: guardrail unit tests. `npx tsc --noEmit`: typecheck.
- `npx tsx scripts/record-video.ts`: records the demo video (server must be running; set `DEMO_NOW=13:05` on the server).
- `terraform -chdir=infra/terraform apply`: deploys to AWS.
