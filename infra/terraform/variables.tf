variable "region" {
  type    = string
  default = "ap-southeast-1"
}

variable "aws_profile" {
  description = "AWS CLI profile (SSO). Log in first: aws sso login --profile me"
  type        = string
  default     = "me"
}

variable "model_id" {
  type    = string
  default = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
}

variable "budget_usd" {
  type    = number
  default = 100
}

variable "budget_email" {
  description = "Email for budget alerts at 50/80/100%. Empty = no budget."
  type        = string
  default     = ""
}
