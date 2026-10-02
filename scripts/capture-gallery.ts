/**
 * Captures 3:2 screenshots of the simulator for the Devpost gallery and the README.
 *
 * Usage: start the server (DEMO_NOW=13:05 npm start), then `npx tsx scripts/capture-gallery.ts`.
 */
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:8000";
const OUT = resolve("docs/media");
const W = 1920;
const H = 1280;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const shot = (name: string) => page.screenshot({ path: join(OUT, `${name}.jpg`), type: "jpeg", quality: 90 });
  const d = (fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => (window as any).demo[f as string](...(a as unknown[])), [fn, args] as const);

  await page.goto(`${BASE}/`);
  await page.waitForFunction(() => (window as any).demo);
  await d("reset");
  await d("say", "Alexa, I'm going heads-down for two hours.");
  await shot("1-focus-mode");

  await d("call", "rider");
  await shot("2-hindi-rider");
  await d("call", "kitchen");
  await d("call", "scam");
  await shot("3-otp-scam-blocked");
  await d("call", "salon");

  await d("say", "Alexa, what did I miss?");
  await page.waitForTimeout(800);
  await shot("4-focus-digest");

  await page.frameLocator("#app-frame").locator("button.yes").first().click();
  await page.waitForTimeout(1200);
  await shot("5-approved-ledger");

  await page.goto(`file://${resolve("video/cards/arch.html")}`);
  await page.waitForLoadState("networkidle");
  await shot("6-architecture");

  await browser.close();
  console.log(`Saved to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
