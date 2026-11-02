// Renders the three.js short in headless Chromium (WebGL via SwiftShader) frame by frame.
//   node tools/render.mjs stills out/stills 0,45,90 [scale]   -> PNG stills
//   node tools/render.mjs video out/video_noaudio.mp4 [scale] -> H.264 (frames piped into ffmpeg)
//   node tools/render.mjs events out/events.json              -> sound event table
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(path.join(process.env.NPM_GLOBAL ?? "/usr/local/lib/node_modules", "playwright"))); }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".png": "image/png", ".webp": "image/webp" };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(p)] ?? "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const [mode = "stills", out = "out/stills", a3, a4] = process.argv.slice(2);
const scale = Number(mode === "stills" ? a4 ?? 0.5 : a3 ?? 1);
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: Math.round(1080 * scale), height: Math.round(1920 * scale) } });
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("[page]", m.text()); });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(`http://127.0.0.1:${port}/src/index.html?scale=${scale}`);
await page.waitForFunction(() => window.READY === true, null, { timeout: 120000 });
const meta = await page.evaluate(() => window.META);

const grab = async (i) => Buffer.from((await page.evaluate((i) => window.renderFrame(i), i)).split(",")[1], "base64");
const t0 = Date.now();
if (mode === "events") {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ fps: meta.FPS, frames: meta.FRAMES, events: await page.evaluate(() => window.EVENTS) }, null, 1));
} else if (mode === "stills") {
  fs.mkdirSync(out, { recursive: true });
  for (const f of a3.split(",").map(Number)) fs.writeFileSync(path.join(out, `f${String(f).padStart(3, "0")}.png`), await grab(f));
} else {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(meta.FPS), "-c:v", "png", "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
  for (let i = 0; i < meta.FRAMES; i++) {
    const buf = await grab(i);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % 10 === 0) console.log(`frame ${i}/${meta.FRAMES} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end(); await new Promise((r) => ff.on("close", r));
}
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await browser.close(); server.close();
