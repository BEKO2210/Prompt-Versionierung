#!/usr/bin/env node
// Share-link smoke test — verifies that:
//   1. Clicking "Share" on the prompt view produces a `#/share?d=…` URL
//   2. Opening that URL in a fresh context renders the read-only view
//      with the correct version title + body, and zero console errors
//   3. A tampered payload surfaces the error banner instead of crashing
//
// Runs against the seeded demo (fresh IDB per test). Exits non-zero on
// any assertion failure OR any console/page error.

const { chromium } = require("playwright");
const { spawn } = require("child_process");
const server = spawn("python3", ["-m", "http.server", "4491", "--directory", "webapp"],
  { stdio: ["ignore", "ignore", "ignore"] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function freshPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("prompt-tree:tour:completed", "1"); localStorage.setItem("prompt-tree:landing-seen", "1"); } catch {} });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.errs = errs;
  return page;
}

function fail(msg) { console.error("FAIL:", msg); process.exit(1); }

(async () => {
  await wait(500);
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });

  // ───────────────── Test 1: round-trip a share link end-to-end ─────────
  let shareUrl;
  let expectedTitle;
  let expectedBody;
  {
    const page = await freshPage(browser);
    await page.goto("http://localhost:4491/#/p/demo/p/ticket-classifier", { waitUntil: "networkidle" });
    await wait(400);

    expectedTitle = await page.$eval(".main-head h1", (el) => el.textContent.trim());
    expectedBody  = await page.$eval(".code-frame pre", (el) => el.textContent);

    // Click the new Share button in the action bar.
    await page.click('button[data-act="share"]');
    await wait(300);

    shareUrl = await page.$eval("textarea[data-share-url]", (el) => el.value.trim());
    if (!shareUrl || !shareUrl.includes("#/share?d=")) {
      fail(`share URL missing or malformed: ${shareUrl}`);
    }
    if (page.errs.length) fail("test 1 (produce) console errors: " + page.errs.join(" | "));
    console.log("✓ test 1: Share button opens modal with a #/share?d=… URL");
    await page.context().close();
  }

  // ───────────────── Test 2: opening the link in a fresh context paints ─
  {
    const page = await freshPage(browser);
    // Replace the origin with our local server — preserve the hash payload.
    const local = shareUrl.replace(/^https?:\/\/[^/]+/, "http://localhost:4491");
    await page.goto(local, { waitUntil: "networkidle" });
    await wait(500);

    const topbarBadge = await page.$eval(".topbar-counters", (el) => el.textContent.toLowerCase()).catch(() => "");
    if (!/read-only share/.test(topbarBadge)) fail(`share view topbar missing 'read-only share' badge: ${topbarBadge}`);

    const title = await page.$eval(".main-head h1", (el) => el.textContent.trim());
    if (title !== expectedTitle) fail(`shared title mismatch: ${JSON.stringify(title)} vs ${JSON.stringify(expectedTitle)}`);

    const body = await page.$eval(".code-frame pre", (el) => el.textContent);
    if (body !== expectedBody) fail(`shared body mismatch`);

    if (page.errs.length) fail("test 2 (consume) console errors: " + page.errs.join(" | "));
    console.log("✓ test 2: opening the share URL renders the same title + body read-only");
    await page.context().close();
  }

  // ───────────────── Test 3: malformed payload → friendly error, no crash ─
  {
    const page = await freshPage(browser);
    await page.goto("http://localhost:4491/#/share?d=raw.not-valid-base64!!!", { waitUntil: "networkidle" });
    await wait(500);

    const msg = await page.$eval(".empty", (el) => el.textContent.toLowerCase()).catch(() => "");
    if (!/can't be opened|unsupported|invalid|payload/.test(msg)) {
      fail(`tampered payload: expected friendly error, got: ${msg.slice(0, 120)}`);
    }
    // We expect the decode to throw and surface a visible message; we
    // tolerate the console error that accompanies that rejection.
    console.log("✓ test 3: tampered share payload surfaces a friendly error");
    await page.context().close();
  }

  console.log("\nAll share-link tests passed.");
  await browser.close();
  server.kill();
  process.exit(0);
})();
