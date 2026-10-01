// Drives the simulator through the demo flow and saves screenshots (quick visual QA).
import { chromium } from "playwright";

const base = process.env.BASE_URL ?? "http://localhost:8000";
const out = process.env.OUT_DIR ?? ".cache/shots";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on("console", (m) => m.type() === "error" && console.log("[page]", m.text()));
await page.goto(`${base}/?video`);
await page.waitForFunction(() => (window as any).demo);
await page.evaluate(() => (window as any).demo.reset());
await page.screenshot({ path: `${out}/1-idle.png` });
await page.evaluate(() => (window as any).demo.say("Alexa, I'm going heads-down for two hours."));
await page.screenshot({ path: `${out}/2-focus.png` });
for (const k of ["rider", "kitchen", "scam", "salon"]) await page.evaluate((key) => (window as any).demo.call(key), k);
await page.screenshot({ path: `${out}/3-calls.png` });
await page.evaluate(() => (window as any).demo.say("Alexa, what did I miss?"));
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/4-digest.png` });
await page.evaluate(() => (window as any).demo.say("Yes, approve it."));
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/5-approved.png` });
await browser.close();
console.log("shots saved to", out);
