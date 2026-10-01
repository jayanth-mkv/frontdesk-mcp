import { fromIni, fromNodeProviderChain } from "@aws-sdk/credential-providers";

const env = process.env;

export const config = {
  port: Number(env.PORT ?? 8000),
  /** "auto" tries Bedrock and falls back to the offline mock if AWS is unavailable. */
  llmMode: (env.LLM_MODE ?? "auto") as "auto" | "bedrock" | "mock",
  region: env.AWS_REGION ?? "ap-southeast-1",
  modelId: env.BEDROCK_MODEL_ID ?? "global.anthropic.claude-haiku-4-5-20251001-v1:0",
  pollyRegion: env.POLLY_REGION ?? env.AWS_REGION ?? "ap-southeast-1",
  store: (env.STORE ?? "memory") as "memory" | "dynamodb",
  dynamoTable: env.DYNAMO_TABLE ?? "frontdesk-households",
  /** Public URL of the MCP endpoint the simulated Alexa+ host connects to. */
  mcpUrl: env.MCP_URL,
};

export const awsCredentials = env.AWS_PROFILE ? fromIni({ profile: env.AWS_PROFILE }) : fromNodeProviderChain();
