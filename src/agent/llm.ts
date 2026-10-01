import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type Message,
  type Tool,
} from "@aws-sdk/client-bedrock-runtime";
import { awsCredentials, config } from "../config.js";

export type { ContentBlock, Message, Tool };

const client = new BedrockRuntimeClient({ region: config.region, credentials: awsCredentials });

let bedrockUsable: boolean | undefined = config.llmMode === "mock" ? false : undefined;

export function llmStatus() {
  return { mode: bedrockUsable === false ? "mock" : "bedrock", model: config.modelId, region: config.region };
}

/**
 * One Bedrock Converse call. Returns null when Bedrock is unavailable so callers can fall back
 * to the deterministic offline mode (judges can run the project with no AWS account).
 */
export async function converse(input: {
  system: string;
  messages: Message[];
  tools?: Tool[];
  maxTokens?: number;
}): Promise<{ content: ContentBlock[]; stopReason?: string } | null> {
  if (bedrockUsable === false) return null;
  try {
    const res = await client.send(
      new ConverseCommand({
        modelId: config.modelId,
        system: [{ text: input.system }],
        messages: input.messages,
        toolConfig: input.tools?.length ? { tools: input.tools } : undefined,
        inferenceConfig: { maxTokens: input.maxTokens ?? 800, temperature: 0.3 },
      }),
    );
    bedrockUsable = true;
    return { content: res.output?.message?.content ?? [], stopReason: res.stopReason };
  } catch (err) {
    const name = (err as Error).name;
    if (config.llmMode === "bedrock") throw err;
    if (bedrockUsable === undefined || /AccessDenied|Credentials|ExpiredToken|UnrecognizedClient|ResourceNotFound/i.test(name)) {
      console.warn(`[llm] Bedrock unavailable (${name}): using offline mock mode.`);
      bedrockUsable = false;
    }
    return null;
  }
}

/** Pull the first JSON object out of a model reply. */
export function extractJson<T>(text: string): T | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
