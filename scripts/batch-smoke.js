#!/usr/bin/env node
// Smoke test: open the prompt, press B, click Launch, assert runs appear.
// End-to-end confidence that the batch button+service really fan out.

const { chromium } = require("playwright");
const { spawn } = require("child_process");

const server = spawn("python3", ["-m", "http.server", "4423", "--directory", "webapp"], { stdio: ["ignore","ignore","ignore"] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await wait(500);
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("prompt-tree:tour:completed","1"); } catch {} });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push(e.message));

  await page.goto("http://localhost:4423/#/p/demo/p/ticket-classifier/v/ver_5", { waitUntil: "networkidle" });
  await wait(500);
  const initialRuns = await page.evaluate(() => {
    const s = window.__state?.() || {};
    return 0; // sentinel — we'll count via DOM instead
  });
  // Count existing run rows on the Runs tab
  await page.goto("http://localhost:4423/#/p/demo/p/ticket-classifier/v/ver_5?tab=runs", { waitUntil: "networkidle" });
  await wait(300);
  const runsBefore = await page.$$eval(".run-row", (rs) => rs.length);

  // Open Batch via keyboard
  await page.goto("http://localhost:4423/#/p/demo/p/ticket-classifier/v/ver_5", { waitUntil: "networkidle" });
  await wait(300);
  await page.keyboard.press("B");
  await wait(400);
  const modalTitle = await page.$eval(".modal h2", (h) => h.textContent).catch(() => null);
  if (!modalTitle || !modalTitle.includes("Batch run")) {
    console.error("FAIL: B hotkey did not open Batch modal. Got:", modalTitle);
    process.exit(1);
  }
  // Read totals text
  const totals = await page.$eval("[data-batch-totals]", (el) => el.textContent.trim());
  console.log("Totals line:", totals);
  if (!/\d+\s+runs/.test(totals)) {
    console.error("FAIL: totals line does not mention run count.");
    process.exit(1);
  }

  // Click Launch batch
  await page.click('[data-mod="ok"]');
  await wait(1200);

  const runsAfter = await page.$$eval(".run-row", (rs) => rs.length);
  console.log(`Runs before: ${runsBefore}, after: ${runsAfter}, delta: ${runsAfter - runsBefore}`);
  if (runsAfter <= runsBefore) {
    console.error("FAIL: no new runs appeared");
    process.exit(1);
  }

  if (errs.length) {
    console.error("FAIL: console errors:", errs);
    process.exit(1);
  }

  console.log("✓ batch smoke test passed");
  await browser.close();
  server.kill();
  process.exit(0);
})();
