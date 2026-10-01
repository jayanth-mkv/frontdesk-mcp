# Friction Log (worth up to a +10% judging bonus)

Log every snag with Amazon/AWS/MCP tooling **as it happens**. Be specific and actionable.

## Template
### FL-XXX: <short title>
- **Tool/API:**
- **Task:**
- **Steps taken:**
- **Expected:**
- **Actual:**
- **Severity:** critical / major / minor
- **Workaround:**
- **Suggestion:**

---

### FL-001: Alexa+ developer tools are gated for hackathon participants
- **Tool/API:** Alexa+ Category SDK / MCP Toolkit / CLI / Web Simulator
- **Task:** Test our MCP server against real Alexa+.
- **Steps taken:** Read the hackathon resources and FAQ.
- **Expected:** A sandbox or simulator to validate an MCP server end to end.
- **Actual:** The tools are preview-only for select partners, so we must build our own simulator.
- **Severity:** major
- **Workaround:** Custom web simulator + MCP Inspector + a generic MCP host.
- **Suggestion:** Offer a time-boxed hackathon sandbox, or publish a conformance test suite for Alexa+ MCP hosts.

### FL-002: Bedrock returns a misleading "ValidationException" during account verification
- **Tool/API:** Amazon Bedrock Runtime `Converse` (ap-southeast-1, ap-south-1)
- **Task:** First model call (Claude Haiku 4.5, then Amazon Nova Lite) from a new account.
- **Steps taken:** Granted `bedrock:*` via IAM, confirmed SCPs are disabled, tried 5 model IDs across 3 regions.
- **Expected:** A clear error naming the real cause and how to fix it.
- **Actual:** `ValidationException: Operation not allowed` in most regions; only ap-south-1 once said *"Your account is currently being verified."* A ValidationException suggests a bad request, so we first spent time debugging IAM, model IDs, inference profiles and SCPs.
- **Severity:** critical (blocks the whole Alexa+ AI path)
- **Workaround:** Offline mock mode; support case to finish verification.
- **Suggestion:** Return `AccessDeniedException` with the account-verification message and a link in every region, and show a banner in the Bedrock console while the account is under review.

### FL-003: AgentCore Runtime quota of 0 shows up as "maxAgents limit exceeded"
- **Tool/API:** Bedrock AgentCore Control `CreateAgentRuntime` (via Terraform `aws_bedrockagentcore_agent_runtime`)
- **Task:** Deploy the MCP server container to AgentCore Runtime.
- **Steps taken:** Built and pushed an ARM64 image to ECR, then created the runtime with `server_protocol = "MCP"`.
- **Expected:** First runtime creates fine (the account has zero runtimes).
- **Actual:** `ServiceQuotaExceededException: maxAgents limit exceeded for account ... Please contact AWS Support.` No hint that the quota is 0 because of account status, or which quota to raise.
- **Severity:** major
- **Workaround:** Run the MCP server locally; requested a quota increase.
- **Suggestion:** Name the Service Quotas quota code in the error, and give new accounts a default of at least 1 runtime so a "hello world" works.

### FL-004: IAM prefix `bedrock-agentcore-control:*` looks valid but isn't
- **Tool/API:** IAM policy editor / AgentCore docs
- **Task:** Write a permission set for AgentCore.
- **Steps taken:** Used the CLI service name (`aws bedrock-agentcore-control ...`) as the IAM action prefix.
- **Expected:** The IAM prefix matches the CLI namespace, as it does for most services.
- **Actual:** `Invalid Service In Action: bedrock-agentcore-control:*`. Both control-plane and data-plane actions live under `bedrock-agentcore:*`.
- **Severity:** minor
- **Workaround:** Use `bedrock-agentcore:*` only.
- **Suggestion:** Say this explicitly at the top of the AgentCore IAM page ("one IAM prefix for both CLIs").

### FL-005: AgentCore service-linked role ARNs are hard to find when writing a least-privilege policy
- **Tool/API:** IAM policy validator + AgentCore service-linked roles
- **Task:** Allow `iam:CreateServiceLinkedRole` for AgentCore without a wildcard.
- **Steps taken:** The policy validator warned "Create SLR With Star In Resource"; searched the docs for the exact role ARNs.
- **Expected:** The CreateAgentRuntime docs say which SLR gets created and give the exact ARN and `iam:AWSServiceName`.
- **Actual:** The info sits on a separate SLR page listing 5 roles; the runtime identity role (`runtime-identity.bedrock-agentcore.amazonaws.com`) is created implicitly for runtimes made after 2025-10-13.
- **Severity:** minor
- **Workaround:** Copied the exact statements from the SLR page.
- **Suggestion:** Link the SLR statements from the Runtime quickstart and from the `BedrockAgentCoreFullAccess` policy page.
