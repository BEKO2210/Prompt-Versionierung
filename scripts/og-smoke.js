#!/usr/bin/env node
// OpenGraph smoke — verifies the link preview metadata is present,
// correct, and that the referenced PNG is actually reachable.
//
// Crawlers like WhatsApp / Reddit / Twitter / Telegram / Discord /
// Slack / LinkedIn fetch the raw HTML and read these tags verbatim —
// no JS executes. So the checks are also static: HTTP-GET the page,
// grep the HTML, GET the PNG.

const http = require("http");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const PORT = 4541;
const BASE = `http://localhost:${PORT}`;
const server = spawn("python3", ["-m", "http.server", String(PORT), "--directory", "webapp"],
  { stdio: ["ignore", "ignore", "ignore"] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function fetchText(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    }).on("error", reject);
  });
}
function fetchBin(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, len: Buffer.concat(chunks).length }));
    }).on("error", reject);
  });
}
function fail(msg) { console.error("FAIL:", msg); process.exit(1); }

(async () => {
  await wait(400);

  // ───── 1. index.html carries every required OG + Twitter tag ─────
  const { status, body } = await fetchText(`${BASE}/`);
  if (status !== 200) fail(`index.html HTTP ${status}`);

  const requireTag = (pattern, desc) => {
    if (!pattern.test(body)) fail(`missing tag: ${desc}`);
  };

  // Core OG
  requireTag(/<meta property="og:type" content="website"\s*\/?>/,                              "og:type");
  requireTag(/<meta property="og:title" content="Prompt Tree/,                                  "og:title");
  requireTag(/<meta property="og:description" content="The offline-first/,                       "og:description");
  requireTag(/<meta property="og:url" content="https:\/\/[^"]+"/,                                "og:url (absolute)");
  requireTag(/<meta property="og:image" content="https:\/\/[^"]+\/assets\/og-card\.png"/,        "og:image (absolute PNG)");
  requireTag(/<meta property="og:image:width" content="1200"/,                                    "og:image:width=1200");
  requireTag(/<meta property="og:image:height" content="630"/,                                    "og:image:height=630");
  requireTag(/<meta property="og:site_name" content="Prompt Tree"/,                               "og:site_name");

  // Twitter fallback
  requireTag(/<meta name="twitter:card" content="summary_large_image"/,                           "twitter:card=summary_large_image");
  requireTag(/<meta name="twitter:image" content="https:\/\/[^"]+\/assets\/og-card\.png"/,        "twitter:image");

  // Basic description tag (legacy crawlers)
  requireTag(/<meta name="description" content="[^"]+git-style[^"]+"/,                            "description mentions 'git-style'");

  console.log("✓ test 1: index.html carries every required OG + Twitter tag");

  // ───── 2. og-card.png is reachable AND actually a PNG of the right size ─────
  const png = await fetchBin(`${BASE}/assets/og-card.png`);
  if (png.status !== 200) fail(`og-card.png HTTP ${png.status}`);
  if ((png.headers["content-type"] || "").indexOf("image/png") < 0) {
    fail(`og-card.png content-type is not image/png: ${png.headers["content-type"]}`);
  }
  if (png.len < 10_000) fail(`og-card.png suspiciously tiny: ${png.len} bytes`);

  // Quick byte-level sanity on the on-disk file: PNG signature + IHDR.
  const buf = fs.readFileSync(path.resolve("webapp/assets/og-card.png"));
  const sig = buf.slice(0, 8);
  if (!(sig[0] === 0x89 && sig[1] === 0x50 && sig[2] === 0x4e && sig[3] === 0x47)) {
    fail("og-card.png is not a valid PNG (signature mismatch)");
  }
  // IHDR width / height are at bytes 16-23 (big-endian).
  const width  = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width !== 1200 || height !== 630) fail(`og-card.png is ${width}x${height}, want 1200x630`);

  console.log(`✓ test 2: og-card.png reachable, image/png, 1200x630, ${png.len.toLocaleString()} bytes`);

  // ───── 3. og-card.svg (vector fallback) is also reachable ─────
  const svg = await fetchText(`${BASE}/assets/og-card.svg`);
  if (svg.status !== 200) fail(`og-card.svg HTTP ${svg.status}`);
  if (!/viewBox="0 0 1200 630"/.test(svg.body)) fail("og-card.svg missing 1200x630 viewBox");
  if (!/Prompt Tree/.test(svg.body)) fail("og-card.svg missing brand title text");
  console.log("✓ test 3: og-card.svg reachable with expected viewBox + brand text");

  console.log("\nAll OG smoke tests passed.");
  server.kill(); process.exit(0);
})();
