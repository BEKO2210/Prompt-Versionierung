#!/usr/bin/env node
// Smoke test for the approval gate:
//   1. Proposal page shows "1 of 2 approvals" on the seeded demo.
//   2. Merge button is disabled.
//   3. Click Approve → status becomes "Ready to merge".
//   4. Merge button is now enabled.
//   5. Revoke → gate closes again.
//
// Exits non-zero on any failed assertion or console error.

const { chromium } = require("playwright");
const { spawn } = require("child_process");

const server = spawn("python3", ["-m", "http.server", "4424", "--directory", "webapp"], { stdio: ["ignore","ignore","ignore"] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await wait(500);
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("prompt-tree:tour:completed","1"); localStorage.setItem("prompt-tree:landing-seen","1"); } catch {} });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push(e.message));

  const fail = (msg) => { console.error("FAIL:", msg); process.exit(1); };

  await page.goto("http://localhost:4424/#/p/demo/p/ticket-classifier/proposals/prop_1", { waitUntil: "networkidle" });
  await wait(600);

  // 1. Status text includes "1 of 2 approvals"
  const status = await page.$eval(".approval-title strong", (el) => el.textContent).catch(() => "");
  if (!/1 of 2 approvals/.test(status)) fail(`expected '1 of 2 approvals' — got: ${status}`);

  // 2. Merge button is disabled.
  const disabled = await page.$eval('[data-act="merge-proposal"]', (el) => el.hasAttribute("disabled"));
  if (!disabled) fail("merge button should be disabled initially");

  // 3. Click Approve.
  const approveBtn = await page.$('[data-act="approve-proposal"]');
  if (!approveBtn) fail("approve button not rendered (current actor may be the opener)");
  await approveBtn.click();
  await wait(400);

  // 4. Status is now "Ready to merge — 2 of 2 approvals collected."
  const status2 = await page.$eval(".approval-title strong", (el) => el.textContent).catch(() => "");
  if (!/2 of 2 approvals/.test(status2)) fail(`expected '2 of 2 approvals' — got: ${status2}`);
  const merge2 = await page.$eval('[data-act="merge-proposal"]', (el) => el.hasAttribute("disabled"));
  if (merge2) fail("merge button should be enabled after gate opens");
  // The approval bar should paint with the gate-open class.
  const gateOpen = await page.$(".approval-bar.gate-open");
  if (!gateOpen) fail("gate-open class not applied to .approval-bar");

  // 5. Revoke → gate closes again.
  await page.click('[data-act="unapprove-proposal"]');
  await wait(400);
  const status3 = await page.$eval(".approval-title strong", (el) => el.textContent).catch(() => "");
  if (!/1 of 2 approvals/.test(status3)) fail(`after revoke expected '1 of 2 approvals' — got: ${status3}`);

  if (errs.length) fail("console errors: " + errs.join(" | "));
  console.log("✓ approval-smoke passed");
  await browser.close();
  server.kill();
  process.exit(0);
})();
