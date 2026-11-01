/**
 * Builds the Kilosmith brand assets from one geometry:
 * the weight ladder — three bars, each shorter and more colourful than the last.
 *
 *   node scripts/brand-assets.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const PAPER = "#fff9ee";
const INK = "#221139";
const ACCENT = "#ff5ca8";
const SUN = "#ffd23f";
const MINT = "#7be0b8";
const SKY = "#a9c7ff";

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Kilosmith">
  <rect width="64" height="64" fill="${PAPER}"/>
  <rect x="12" y="16" width="40" height="10" rx="5" fill="${SUN}"/>
  <rect x="12" y="29" width="28" height="10" rx="5" fill="${SKY}"/>
  <rect x="12" y="42" width="15" height="10" rx="5" fill="${ACCENT}"/>
</svg>`;

fs.writeFileSync("src/app/icon.svg", iconSvg);
fs.writeFileSync("public/icon.svg", iconSvg);

const png = (size) =>
  sharp(Buffer.from(iconSvg)).resize(size, size, { kernel: "lanczos3" }).png().toBuffer();

const outputs = [
  [16, "src/app/favicon-16.png"],
  [32, "src/app/favicon-32.png"],
  [48, "src/app/favicon-48.png"],
  [180, "src/app/apple-icon.png"],
  [180, "public/apple-icon.png"],
  [192, "public/icon-192.png"],
  [512, "public/icon-512.png"],
  [1024, "public/icon-1024.png"],
];

const buffers = {};
for (const [size, file] of outputs) {
  const buf = await png(size);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  buffers[size] = buf;
}

// ICO container with PNG payloads (16, 32, 48).
const icoSizes = [16, 32, 48];
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icoSizes.length, 4);
let offset = 6 + 16 * icoSizes.length;
const entries = [];
for (const size of icoSizes) {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size, 0);
  entry.writeUInt8(size, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(buffers[size].length, 8);
  entry.writeUInt32LE(offset, 12);
  entries.push(entry);
  offset += buffers[size].length;
}
const ico = Buffer.concat([header, ...entries, ...icoSizes.map((size) => buffers[size])]);
fs.writeFileSync("src/app/favicon.ico", ico);
fs.writeFileSync("public/favicon.ico", ico);

// Open Graph card: the same ladder, as a candy sticker on cream.
const mona = fs.readFileSync("public/fonts/MonaSans-latin.woff2").toString("base64");
const fredoka = fs.readFileSync("src/app/fonts/Fredoka-latin.woff2").toString("base64");
const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @font-face {
    font-family: Mona;
    src: url(data:font/woff2;base64,${mona}) format("woff2");
    font-weight: 200 900;
    font-stretch: 75% 125%;
  }
  @font-face {
    font-family: Fredoka;
    src: url(data:font/woff2;base64,${fredoka}) format("woff2");
    font-weight: 300 700;
  }
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1200px; height: 630px; }
  body {
    background: ${PAPER};
    background-image: radial-gradient(#f7d9a8 2.2px, transparent 2.2px);
    background-size: 30px 30px;
    color: ${INK};
    font-family: Mona, sans-serif;
    padding: 56px 68px 48px;
    position: relative;
    overflow: hidden;
  }
  .blob { position: absolute; border-radius: 999px; }
  .blob.one { right: -70px; top: -80px; width: 300px; height: 300px; background: ${MINT}; opacity: .55; }
  .blob.two { left: 300px; bottom: -120px; width: 240px; height: 240px; background: ${SKY}; opacity: .5; }
  .top { display: flex; align-items: center; justify-content: space-between; position: relative; }
  .brand { display: flex; align-items: center; gap: 14px; font-family: Fredoka, sans-serif; font-size: 30px; font-weight: 600; }
  .mark { width: 46px; height: 46px; background: #fff; border: 3px solid ${INK}; border-radius: 14px; padding: 9px; display: grid; gap: 4px; align-content: center; box-shadow: 4px 4px 0 ${INK}; }
  .mark i { display: block; height: 6px; border-radius: 3px; background: ${SUN}; }
  .mark i:nth-child(2) { width: 68%; background: ${SKY}; }
  .mark i:nth-child(3) { width: 38%; background: ${ACCENT}; }
  .meta { font-family: Fredoka, sans-serif; font-size: 19px; background: ${SUN}; border: 3px solid ${INK}; border-radius: 999px; padding: 7px 18px; box-shadow: 4px 4px 0 ${INK}; }
  h1 {
    margin-top: 66px;
    font-family: Fredoka, sans-serif;
    font-size: 116px;
    line-height: 0.94;
    font-weight: 700;
    letter-spacing: -0.03em;
    position: relative;
  }
  h1 em { font-style: normal; color: ${ACCENT}; text-decoration: underline wavy ${ACCENT} 6px; text-underline-offset: 10px; }
  .lede { margin-top: 26px; max-width: 560px; font-size: 24px; line-height: 1.45; color: #3f2b5e; position: relative; }
  .figure {
    position: absolute; right: 68px; top: 210px; width: 268px;
    background: #fff; border: 3px solid ${INK}; border-radius: 24px;
    box-shadow: 8px 8px 0 ${ACCENT}; padding: 26px 26px 22px;
    transform: rotate(-3deg);
  }
  .figure .n { font-family: Fredoka, sans-serif; font-size: 128px; line-height: 0.82; font-weight: 700; }
  .figure .u { margin-top: 12px; font-size: 19px; line-height: 1.3; color: #3f2b5e; font-weight: 600; }
  .foot {
    position: absolute; left: 68px; right: 68px; bottom: 42px;
    border: 3px solid ${INK}; border-radius: 999px; background: #fff;
    padding: 14px 22px; box-shadow: 4px 4px 0 ${INK};
    display: flex; justify-content: space-between; align-items: center;
    font-family: Fredoka, sans-serif; font-size: 18px;
  }
  .foot b { color: ${ACCENT}; font-weight: 600; }
</style></head>
<body>
  <div class="blob one"></div>
  <div class="blob two"></div>
  <div class="top">
    <div class="brand"><span class="mark"><i></i><i></i><i></i></span>Kilosmith</div>
    <div class="meta">8 tools · 0 uploads</div>
  </div>
  <h1>Heavy files,<br><em>made light.</em></h1>
  <p class="lede">Resize, squash and convert photos and video right here in your browser. Your laptop does the work; nothing ever leaves it.</p>
  <div class="figure"><div class="n">0</div><div class="u">bytes uploaded.<br>Not one. Ever.</div></div>
  <div class="foot">
    <span>Resize · Crop · Compress · Convert · Video · GIF · Meme · Favicon</span>
    <b>kilosmith.app</b>
  </div>
</body></html>`;

const { createRequire: cr } = await import("node:module");
const req2 = cr("/home/anos/Documents/cynbit_patch/package.json");
const puppeteer = req2("puppeteer-core");

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cache = path.join(process.env.HOME || "", ".cache/puppeteer/chrome");
  if (!fs.existsSync(cache)) return undefined;
  const versions = fs.readdirSync(cache).sort().reverse();
  for (const version of versions) {
    const candidate = path.join(cache, version, "chrome-linux64/chrome");
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: true,
  args: ["--no-sandbox", "--font-render-hinting=none"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: "public/og.png" });
await browser.close();

fs.rmSync("src/app/favicon-16.png", { force: true });
fs.rmSync("src/app/favicon-32.png", { force: true });
fs.rmSync("src/app/favicon-48.png", { force: true });

console.log("wrote icon.svg, favicon.ico, apple-icon.png, icon-192/512/1024.png, og.png");
