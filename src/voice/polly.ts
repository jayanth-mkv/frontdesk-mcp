import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PollyClient, SynthesizeSpeechCommand, type Engine, type LanguageCode, type VoiceId } from "@aws-sdk/client-polly";
import { awsCredentials, config } from "../config.js";

const polly = new PollyClient({ region: config.pollyRegion, credentials: awsCredentials });
const CACHE = join(process.cwd(), ".cache", "tts");
let pollyUsable: boolean | undefined;

export interface VoiceSpec {
  voice: string;
  lang: string;
  engine: "neural" | "generative" | "standard";
}

/** Voices used by the simulator. All Amazon Polly. */
export const VOICES = {
  alexa: { voice: "Ruth", lang: "en-US", engine: "generative" },
  frontdeskEn: { voice: "Kajal", lang: "en-IN", engine: "generative" },
  frontdeskHi: { voice: "Kajal", lang: "hi-IN", engine: "generative" },
  user: { voice: "Matthew", lang: "en-US", engine: "generative" },
  narrator: { voice: "Brian", lang: "en-GB", engine: "generative" },
} satisfies Record<string, VoiceSpec>;

/** Synthesize to MP3, cached on disk so repeated demo runs cost nothing. Returns null if Polly is unavailable. */
export async function tts(text: string, v: VoiceSpec): Promise<Buffer | null> {
  const key = createHash("sha1").update(JSON.stringify([text, v])).digest("hex");
  const file = join(CACHE, `${key}.mp3`);
  if (existsSync(file)) return readFileSync(file);
  if (pollyUsable === false) return null;
  try {
    const out = await polly.send(
      new SynthesizeSpeechCommand({
        Text: text,
        VoiceId: v.voice as VoiceId,
        LanguageCode: v.lang as LanguageCode,
        Engine: v.engine as Engine,
        OutputFormat: "mp3",
        SampleRate: "24000",
      }),
    );
    const buf = Buffer.from(await out.AudioStream!.transformToByteArray());
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(file, buf);
    pollyUsable = true;
    return buf;
  } catch (err) {
    console.warn(`[polly] unavailable (${(err as Error).name}): browser speech fallback.`);
    if (pollyUsable === undefined) pollyUsable = false;
    return null;
  }
}
