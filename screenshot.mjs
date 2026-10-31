// Usage: node screenshot.mjs <url> [label] [--width=1440] [--height=900] [--viewport]
// Saves full-page screenshots to ./temporary screenshots/screenshot-N[-label].png
import { createRequire } from 'node:module';
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const PUPPETEER_DIR = process.env.PUPPETEER_DIR ||
  '/private/tmp/claude-501/-Users-ivan-Downloads------------car-Franko/8ef0f686-d13b-4473-8423-91173a97b7e3/scratchpad/pp/';
const CHROME = process.env.CHROME_PATH || join(homedir(),
  '.cache/puppeteer/chrome/mac_arm-156.0.8078.47/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');

const require = createRequire(PUPPETEER_DIR);
const puppeteer = require('puppeteer');

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const [url = 'http://localhost:3000', label] = args.filter(a => !a.startsWith('--'));
const width = Number(flags.width || 1440), height = Number(flags.height || 900);

const dir = join(fileURLToPath(new URL('.', import.meta.url)), 'temporary screenshots');
await mkdir(dir, { recursive: true });
const nums = (await readdir(dir)).map(f => Number(f.match(/^screenshot-(\d+)/)?.[1])).filter(Boolean);
const n = (nums.length ? Math.max(...nums) : 0) + 1;
const out = join(dir, `screenshot-${n}${label ? '-' + label : ''}.png`);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
// trigger scroll-reveal animations, then return to top
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 140)); }
  window.scrollTo(0, Number(new URLSearchParams(location.search).get('y') || 0));
});
await new Promise(r => setTimeout(r, 1200));
await page.screenshot({ path: out, fullPage: !flags.viewport });
await browser.close();
console.log(out);
