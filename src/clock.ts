/**
 * Demo clock. DEMO_NOW=HH:MM (IST) pins "now" to that time of day, so the demo reads like a workday
 * whenever it is recorded. Unset = real time.
 */
const demo = process.env.DEMO_NOW?.match(/^(\d{1,2}):(\d{2})$/);
let offsetMs = 0;
if (demo) {
  const real = new Date();
  const istMin = (real.getUTCHours() * 60 + real.getUTCMinutes() + 330) % 1440;
  offsetMs = (Number(demo[1]) * 60 + Number(demo[2]) - istMin) * 60_000 - real.getUTCSeconds() * 1000;
}
export const now = () => new Date(Date.now() + offsetMs);
export const clockOffsetMs = () => offsetMs;
