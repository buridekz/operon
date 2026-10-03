// Render video.html to JPEG frames with headless Chrome.
//   node render.mjs stills 1.5 4 6.5 ...   -> stills/t_<time>.jpg
//   node render.mjs frames                 -> frames/f_00000.jpg ... at 30 fps
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const FPS = 30;
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const [mode, ...args] = process.argv.slice(2);

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--hide-scrollbars", "--force-device-scale-factor=1"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(here, "video.html")).href, { waitUntil: "networkidle0" });
await page.evaluate(() => window.ready);
const duration = await page.evaluate(() => window.DURATION);

async function shot(t, file) {
  await page.evaluate((t) => window.render(t), t);
  await page.screenshot({ path: file, type: "jpeg", quality: 93 });
}

if (mode === "stills") {
  mkdirSync(path.join(here, "stills"), { recursive: true });
  for (const a of args) await shot(Number(a), path.join(here, "stills", `t_${a}.jpg`));
} else {
  mkdirSync(path.join(here, "frames"), { recursive: true });
  const n = Math.round(duration * FPS);
  for (let i = 0; i < n; i++) {
    await shot(i / FPS, path.join(here, "frames", `f_${String(i).padStart(5, "0")}.jpg`));
    if (i % 60 === 0) console.log(`frame ${i}/${n}`);
  }
}
await browser.close();
