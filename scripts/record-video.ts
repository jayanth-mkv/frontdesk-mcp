/**
 * Records the demo video end to end:
 *  1. renders title/architecture/closing cards with narration (Amazon Polly),
 *  2. drives the live simulator like a human (cursor, typing, voice) while recording the screen,
 *  3. mixes every voice clip at the exact moment it played, and
 *  4. assembles the final MP4 with ffmpeg.
 *
 * Usage: start the server (npm start), then `npx tsx scripts/record-video.ts`.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Page } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:8000";
const OUT = resolve("video/out");
const TMP = join(OUT, "tmp");
const W = 1920;
const H = 1080;

const NARRATION = {
  title:
    "Nine interruptions in an hour. A rider lost at the gate, a restaurant missing a dish, a salon running late, and one caller who isn't who they say they are. Alexa can place the order. Nobody handles what comes after. Until now.",
  intro: "This is FrontDesk, an Alexa+ add-on built as a self-hosted MCP server. Arjun is about to start deep work.",
  focus: "From now on, every call to the home goes to FrontDesk instead of Arjun's phone.",
  rider: "The rider's number matches an active order, so FrontDesk replies in Hindi with the gate and drop-off instructions.",
  scam: "This number isn't tied to any order. The model may propose sharing the OTP, but a deterministic policy engine denies it and flags the call. The LLM can never override it.",
  salon: "Moving the salon to six thirty breaks Arjun's rules, so FrontDesk holds it for him.",
  digest: "Instead of nine interruptions, one summary, rendered on the Echo Show as an MCP App. One tap approves the salon change.",
  arch: "Under the hood: a TypeScript MCP server on the latest spec over Streamable HTTP, deployed to Amazon Bedrock AgentCore Runtime. Claude on Bedrock proposes, the policy engine decides, Amazon Polly speaks, DynamoDB remembers, and every word lands in a consent ledger.",
  close: "FrontDesk. Focus on your work. Your home's front desk has the rest.",
};

const sh = (cmd: string, args: string[]) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "inherit"] }).toString();
const duration = (file: string) => Number(sh("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).trim());
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchTts(role: string, text: string, file: string) {
  const res = await fetch(`${BASE}/api/tts?role=${role}&text=${encodeURIComponent(text)}`);
  if (!res.ok) throw new Error(`TTS failed (${res.status}). Is Polly reachable?`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

/** A still card + narration → an MP4 segment. */
async function card(page: Page, name: string, text: string, padSec = 1.2) {
  await page.goto(`file://${resolve("video/cards", `${name}.html`)}`);
  await page.waitForLoadState("networkidle");
  const png = join(TMP, `${name}.png`);
  const mp3 = join(TMP, `${name}.mp3`);
  await page.screenshot({ path: png });
  await fetchTts("narrator", text, mp3);
  const len = duration(mp3) + padSec;
  const mp4 = join(TMP, `${name}.mp4`);
  sh("ffmpeg", [
    "-y", "-loop", "1", "-i", png, "-i", mp3,
    "-filter_complex", `[0:v]scale=${W}:${H},zoompan=z='min(zoom+0.0004,1.05)':d=1:s=${W}x${H}:fps=30,fade=t=in:st=0:d=0.5,fade=t=out:st=${(len - 0.5).toFixed(2)}:d=0.5[v];[1:a]adelay=400|400,apad[a]`,
    "-map", "[v]", "-map", "[a]", "-t", len.toFixed(2), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-ar", "48000", "-ac", "2", mp4,
  ]);
  return mp4;
}

/** The live demo, driven like a human. */
async function demo(page: Page) {
  const d = (fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => (window as any).demo[f as string](...(a as unknown[])), [fn, args] as const);
  await d("narrate", NARRATION.intro);
  await sleep(300);
  await d("typeAndSay", "Alexa, I'm going heads-down for two hours.");
  await d("narrate", NARRATION.focus);
  await sleep(700);

  await d("call", "rider");
  await d("narrate", NARRATION.rider);
  await sleep(500);
  await d("call", "kitchen");
  await sleep(500);
  await d("call", "scam");
  await d("narrate", NARRATION.scam);
  await sleep(500);
  await d("call", "salon");
  await d("narrate", NARRATION.salon);
  await sleep(900);

  await d("typeAndSay", "Alexa, what did I miss?");
  await sleep(600);
  // Click "Approve" on the MCP App card, like a person tapping the Echo Show.
  const frameEl = await page.$("#app-frame");
  const box = await frameEl!.boundingBox();
  const yes = page.frameLocator("#app-frame").locator("button.yes").first();
  const yb = await yes.boundingBox().catch(() => null);
  await d("narrate", NARRATION.digest);
  if (yb && box) {
    await d("cursorTo", yb.x + yb.width / 2, yb.y + yb.height / 2);
    await d("cursorClickFx");
    await yes.click();
  }
  await sleep(2500);
}

async function main() {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });

  // Cards
  const cardCtx = await browser.newContext({ viewport: { width: W, height: H } });
  const cardPage = await cardCtx.newPage();
  const title = await card(cardPage, "title", NARRATION.title);
  const arch = await card(cardPage, "arch", NARRATION.arch);
  const close = await card(cardPage, "close", NARRATION.close, 1.8);
  await cardCtx.close();

  // Reset state, then record the live demo.
  await fetch(`${BASE}/api/reset`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  const t0 = Date.now();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: TMP, size: { width: W, height: H } } });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && console.log("[page]", m.text()));
  await page.goto(`${BASE}/?video`);
  await page.waitForFunction(() => (window as any).demo);
  await sleep(1200);
  const demoStart = Date.now() - t0;
  await demo(page);
  const log: { at: number; url: string }[] = await page.evaluate(() => (window as any).__audioLog);
  const demoEnd = Date.now() - t0;
  const videoPath = await page.video()!.path();
  await ctx.close();
  await browser.close();
  const raw = join(TMP, "demo-raw.webm");
  renameSync(videoPath, raw);

  // Mix every clip at the moment it played.
  const inputs: string[] = [];
  const filters: string[] = [];
  log.forEach((e, i) => {
    const f = join(TMP, `clip-${i}.mp3`);
    inputs.push(f);
    filters.push(`[${i + 1}:a]adelay=${Math.max(0, e.at - t0 - demoStart)}|${Math.max(0, e.at - t0 - demoStart)}[a${i}]`);
  });
  for (const [i, e] of log.entries()) writeFileSync(inputs[i], Buffer.from(await (await fetch(`${BASE}${e.url}`)).arrayBuffer()));
  const demoLen = (demoEnd - demoStart) / 1000;
  const demoMp4 = join(TMP, "demo.mp4");
  sh("ffmpeg", [
    "-y", "-ss", (demoStart / 1000).toFixed(2), "-i", raw, ...inputs.flatMap((f) => ["-i", f]),
    "-filter_complex", `${filters.join(";")};${log.map((_, i) => `[a${i}]`).join("")}amix=inputs=${log.length}:normalize=0,apad[a]`,
    "-map", "0:v", "-map", "[a]", "-t", demoLen.toFixed(2), "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-ar", "48000", "-ac", "2", demoMp4,
  ]);

  // Assemble.
  const final = join(OUT, "frontdesk-demo.mp4");
  sh("ffmpeg", [
    "-y", "-i", title, "-i", demoMp4, "-i", arch, "-i", close,
    "-filter_complex", "[0:v][0:a][1:v][1:a][2:v][2:a][3:v][3:a]concat=n=4:v=1:a=1[v][a]",
    "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", final,
  ]);
  const total = duration(final);
  console.log(`\nVideo: ${final}\nLength: ${total.toFixed(1)}s ${total > 180 ? "(OVER 3:00, trim!)" : "(under 3:00)"}`);
  console.log("Segments:", readdirSync(TMP).filter((f) => f.endsWith(".mp4")).map((f) => `${f}=${duration(join(TMP, f)).toFixed(1)}s`).join("  "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
