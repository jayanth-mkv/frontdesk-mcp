data "aws_caller_identity" "me" {}

locals {
  name       = "frontdesk"
  account_id = data.aws_caller_identity.me.account_id
  # Rebuild the image whenever server code changes.
  root      = "${path.module}/../.."
  src_files = sort(concat(tolist(fileset(local.root, "src/**")), tolist(fileset(local.root, "web/**")), ["package.json", "package-lock.json", "Dockerfile"]))
  src_hash  = sha1(join("", [for f in local.src_files : filesha1("${local.root}/${f}")]))
  image    = "${aws_ecr_repository.mcp.repository_url}:${substr(local.src_hash, 0, 12)}"
}

# ---------- Data: household state ----------
resource "aws_dynamodb_table" "households" {
  name         = "${local.name}-households"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  attribute {
    name = "pk"
    type = "S"
  }
}

# ---------- Container registry ----------
resource "aws_ecr_repository" "mcp" {
  name                 = "${local.name}-mcp"
  image_tag_mutability = "MUTABLE"
  force_delete         = true
}

resource "aws_ecr_lifecycle_policy" "keep_few" {
  repository = aws_ecr_repository.mcp.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last 3 images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 3 }
      action       = { type = "expire" }
    }]
  })
}

# Build an ARM64 image (AgentCore Runtime requirement) and push it.
resource "terraform_data" "image" {
  triggers_replace = [local.image]
  provisioner "local-exec" {
    working_dir = "${path.module}/../.."
    interpreter = ["pwsh", "-NoProfile", "-Command"]
    command     = <<-EOT
      $ErrorActionPreference = 'Stop'
      aws ecr get-login-password --region ${var.region} --profile ${var.aws_profile} | docker login --username AWS --password-stdin ${local.account_id}.dkr.ecr.${var.region}.amazonaws.com
      docker buildx build --platform linux/arm64 -t ${local.image} --push .
    EOT
  }
}

# ---------- Runtime role ----------
data "aws_iam_policy_document" "assume_agentcore" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["bedrock-agentcore.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}

resource "aws_iam_role" "runtime" {
  name               = "${local.name}-agentcore-runtime"
  assume_role_policy = data.aws_iam_policy_document.assume_agentcore.json
}

data "aws_iam_policy_document" "runtime" {
  statement {
    sid       = "Bedrock"
    actions   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
    resources = ["*"]
  }
  statement {
    sid       = "Polly"
    actions   = ["polly:SynthesizeSpeech"]
    resources = ["*"]
  }
  statement {
    sid       = "State"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem"]
    resources = [aws_dynamodb_table.households.arn]
  }
  statement {
    sid       = "PullImage"
    actions   = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"]
    resources = [aws_ecr_repository.mcp.arn]
  }
  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams", "logs:DescribeLogGroups"]
    resources = ["arn:aws:logs:${var.region}:${local.account_id}:log-group:/aws/bedrock-agentcore/*"]
  }
  statement {
    sid       = "Observability"
    actions   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords", "cloudwatch:PutMetricData"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "runtime" {
  role   = aws_iam_role.runtime.id
  policy = data.aws_iam_policy_document.runtime.json
}

# ---------- MCP server on Bedrock AgentCore Runtime ----------
resource "aws_bedrockagentcore_agent_runtime" "mcp" {
  agent_runtime_name = "${local.name}_mcp"
  description        = "FrontDesk MCP server (spec 2025-11-25, Streamable HTTP)"
  role_arn           = aws_iam_role.runtime.arn

  agent_runtime_artifact {
    container_configuration {
      container_uri = local.image
    }
  }

  network_configuration {
    network_mode = "PUBLIC"
  }

  protocol_configuration {
    server_protocol = "MCP"
  }

  environment_variables = {
    SIMULATOR        = "off"
    STORE            = "dynamodb"
    DYNAMO_TABLE     = aws_dynamodb_table.households.name
    LLM_MODE         = "bedrock"
    BEDROCK_MODEL_ID = var.model_id
    AWS_REGION       = var.region
  }

  depends_on = [terraform_data.image, aws_iam_role_policy.runtime]
}

# ---------- Cost guardrail ----------
resource "aws_budgets_budget" "cap" {
  count        = var.budget_email == "" ? 0 : 1
  name         = "${local.name}-prototype"
  budget_type  = "COST"
  limit_amount = tostring(var.budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  dynamic "notification" {
    for_each = [50, 80, 100]
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = [var.budget_email]
    }
  }
}
