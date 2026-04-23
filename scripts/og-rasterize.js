#!/usr/bin/env node
// Rasterise webapp/assets/og-card.svg → webapp/assets/og-card.png via
// a headless Chromium. Re-run whenever the SVG changes so the PNG
// ships in lockstep. Crawlers (Facebook, WhatsApp, Twitter, Reddit,
// LinkedIn, Discord, Slack, Telegram) prefer PNG for link previews and
// we ship both files so the meta tags can point at whichever works.

const { chromium } = require("playwright");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const server = spawn("python3", ["-m", "http.server", "4540", "--directory", "webapp"],
  { stdio: ["ignore", "ignore", "ignore"] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await wait(500);
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });
  const ctx = await browser.newContext({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.goto("http://localhost:4540/assets/og-card.svg", { waitUntil: "networkidle" });
  await wait(400);
  const buf = await page.screenshot({ omitBackground: false, type: "png" });
  fs.writeFileSync(path.resolve("webapp/assets/og-card.png"), buf);
  await browser.close(); server.kill();
  console.log(`wrote webapp/assets/og-card.png (${buf.length.toLocaleString()} bytes)`);
  process.exit(0);
})();
