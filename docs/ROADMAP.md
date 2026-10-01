# Roadmap — 2026-10-02 → submit by 2026-10-22 (1 day buffer before the Oct 23 12:00 PT deadline)

## Week 1 (Oct 2–8): Foundations
- [ ] Brainstorm sign-off: name, scope, market framing
- [ ] Request AWS credits (**deadline Oct 21**, do it now)
- [ ] Scaffold `server/` with a spec-compliant Streamable HTTP MCP server and a test against MCP Inspector
- [ ] Data model + seeded demo data (orders, brief, contacts)
- [ ] Guardrails engine + unit tests
- [ ] Start `FRICTION_LOG.md` entries as we hit issues

## Week 2 (Oct 9–15): Brain + Simulator
- [ ] `handle_inbound_contact` with Bedrock (+ mock mode)
- [ ] Booking flow + approvals via elicitation
- [ ] Focus Digest + MCP App UI card
- [ ] Simulator: Echo Show screen, caller panel, ledger, voice in/out
- [ ] Scam-caller detection scenario

## Week 3 (Oct 16–22): Polish + Ship
- [ ] Deploy to AgentCore Runtime (AWS Builder mini)
- [ ] Demo script rehearsed; record and edit the < 3 min video
- [ ] README with screenshots, one-command run, architecture
- [ ] Devpost write-up, product feedback, friction logs, feature requests
- [ ] Final check against `docs/research/hackathon-brief.md`

## MVP cut line
Everything in the demo storyboard (STRATEGY §5) is MVP. Real phone line, Ring tie-in and multi-household support are **stretch** goals.
