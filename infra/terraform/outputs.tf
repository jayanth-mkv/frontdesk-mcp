output "agent_runtime_arn" {
  value = aws_bedrockagentcore_agent_runtime.mcp.agent_runtime_arn
}

output "mcp_invoke_url" {
  description = "Streamable HTTP MCP endpoint (SigV4-signed, service bedrock-agentcore)."
  value       = "https://bedrock-agentcore.${var.region}.amazonaws.com/runtimes/${urlencode(aws_bedrockagentcore_agent_runtime.mcp.agent_runtime_arn)}/invocations?qualifier=DEFAULT"
}

output "dynamodb_table" {
  value = aws_dynamodb_table.households.name
}
