#!/usr/bin/env node
// Headless UI test — walks through the webapp like a user would,
// captures screenshots of every view, and reports console errors,
// missing assets, overlaps and broken selectors.

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const OUT = path.join(__dirname, "screenshots");
fs.mkdirSync(OUT, { recursive: true });

// Start static server
const server = spawn("python3", ["-m", "http.server", "4420", "--directory", "webapp"], {
  stdio: ["ignore", "ignore", "ignore"],
});

async function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  await wait(400);
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push("[console.error] " + msg.text());
    if (msg.type() === "warning") errors.push("[console.warn] " + msg.text());
  });
  page.on("pageerror", (e) => errors.push("[pageerror] " + e.message));
  page.on("requestfailed", (req) => errors.push("[requestfailed] " + req.url() + " — " + req.failure()?.errorText));

  async function snap(name) {
    await wait(250);
    await page.screenshot({ path: path.join(OUT, name + ".png"), fullPage: true });
    console.log(" snap", name);
  }

  async function checkOverlaps(label) {
    const issues = await page.evaluate(() => {
      const problems = [];
      // Horizontal overflow?
      if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 2) {
        problems.push(`horizontal scroll: scrollWidth=${document.documentElement.scrollWidth}, clientWidth=${document.documentElement.clientWidth}`);
      }
      // Any element breaking out of viewport horizontally?
      for (const el of document.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > window.innerWidth + 4) {
          const selector = el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.split(" ").join(".").slice(0, 60) : "");
          problems.push(`overflow-right: ${selector} r.right=${Math.round(r.right)} w=${window.innerWidth}`);
          if (problems.length > 10) break;
        }
      }
      return problems;
    });
    if (issues.length) {
      console.log(" ⚠", label, "-", issues.length, "layout problems:");
      issues.forEach((x) => console.log("   ·", x));
    }
  }

  try {
    console.log("=== Workspace ===");
    // Pre-mark the tour completed so the first paint doesn't auto-open
    // the spotlight; we'll snap it explicitly below.
    await page.addInitScript(() => {
      try { localStorage.setItem("prompt-tree:tour:completed", "1"); } catch {}
    });
    await page.goto("http://localhost:4420/", { waitUntil: "networkidle" });
    await wait(500);
    await snap("01-workspace");
    await checkOverlaps("workspace");

    console.log("=== Tutorial spotlight ===");
    await page.evaluate(() => window.__startTour && window.__startTour());
    await wait(700);
    await snap("25-tour-step1");
    await page.click('[data-act="tour-next"]').catch(() => {});
    await wait(700);
    await snap("26-tour-step2");
    await page.click('[data-act="tour-skip"]').catch(() => {});
    await wait(300);

    console.log("=== Settings ===");
    await page.goto("http://localhost:4420/#/settings", { waitUntil: "networkidle" });
    await wait(400);
    await snap("23-settings");
    await checkOverlaps("settings");

    console.log("=== Help ===");
    await page.goto("http://localhost:4420/#/help", { waitUntil: "networkidle" });
    await wait(500);
    await snap("27-help");
    await checkOverlaps("help");

    console.log("=== Project dashboard ===");
    await page.goto("http://localhost:4420/#/p/demo", { waitUntil: "networkidle" });
    await wait(300);
    await snap("02-project");
    await checkOverlaps("project");

    console.log("=== Prompt view (screenshot target) ===");
    await page.goto("http://localhost:4420/#/p/demo/p/ticket-classifier/v/ver_5", { waitUntil: "networkidle" });
    await wait(400);
    await snap("03-prompt-content");
    await checkOverlaps("prompt-content");

    console.log("=== Blame view ===");
    await page.goto("http://localhost:4420/#/p/demo/p/ticket-classifier/v/ver_5?blame=1", { waitUntil: "networkidle" });
    await wait(500);
    await snap("28-blame");
    await checkOverlaps("blame");

    console.log("=== Runs tab ===");
    await page.goto("http://localhost:4420/#/p/demo/p/ticket-classifier/v/ver_5?tab=runs", { waitUntil: "networkidle" });
    await wait(300);
    await snap("04-prompt-runs");
    await checkOverlaps("runs");

    console.log("=== Run drawer ===");
    await page.click(".run-row").catch(() => {});
    await wait(400);
    await snap("24-run-drawer");
    await checkOverlaps("run-drawer");
    await page.keyboard.press("Escape");
    await wait(250);

    console.log("=== Lineage tab ===");
    await page.goto("http://localhost:4420/#/p/demo/p/ticket-classifier/v/ver_5?tab=lineage", { waitUntil: "networkidle" });
    await wait(300);
    await snap("05-prompt-lineage");
    await checkOverlaps("lineage");

    console.log("=== Decisions tab ===");
    await page.goto("http://localhost:4420/#/p/demo/p/ticket-classifier/v/ver_5?tab=decisions", { waitUntil: "networkidle" });
    await wait(300);
    await snap("06-prompt-decisions");

    console.log("=== Notes tab ===");
    await page.goto("http://localhost:4420/#/p/demo/p/ticket-classifier/v/ver_5?tab=notes", { waitUntil: "networkidle" });
    await wait(300);
    await snap("07-prompt-notes");

    console.log("=== Compare ===");
    await page.goto("http://localhost:4420/#/p/demo/p/ticket-classifier/compare?a=ver_3&b=ver_5", { waitUntil: "networkidle" });
    await wait(300);
    await snap("08-compare");
    await checkOverlaps("compare");

    console.log("=== Refine ===");
    await page.goto("http://localhost:4420/#/p/demo/p/ticket-classifier/refine/ver_2", { waitUntil: "networkidle" });
    await wait(300);
    // Click Re-analyze
    await page.click('[data-act="analyze"]').catch(() => {});
    await wait(400);
    await snap("09-refine");
    await checkOverlaps("refine");

    console.log("=== README tab ===");
    await page.goto("http://localhost:4420/#/p/demo/p/ticket-classifier/v/ver_5?tab=readme", { waitUntil: "networkidle" });
    await wait(300);
    await snap("18-readme");
    await checkOverlaps("readme");

    console.log("=== Activity tab ===");
    await page.goto("http://localhost:4420/#/p/demo/p/ticket-classifier/v/ver_5?tab=activity", { waitUntil: "networkidle" });
    await wait(300);
    await snap("19-activity");
    await checkOverlaps("activity");

    console.log("=== Proposals tab ===");
    await page.goto("http://localhost:4420/#/p/demo/p/ticket-classifier/v/ver_5?tab=proposals", { waitUntil: "networkidle" });
    await wait(300);
    await snap("20-proposals-tab");

    console.log("=== Releases tab ===");
    await page.goto("http://localhost:4420/#/p/demo/p/ticket-classifier/v/ver_5?tab=releases", { waitUntil: "networkidle" });
    await wait(300);
    await snap("21-releases-tab");

    console.log("=== Proposal detail ===");
    await page.goto("http://localhost:4420/#/p/demo/p/ticket-classifier/proposals/prop_1", { waitUntil: "networkidle" });
    await wait(400);
    await snap("22-proposal-detail");
    await checkOverlaps("proposal");

    console.log("=== Search ===");
    await page.goto("http://localhost:4420/#/p/demo/search?q=billing", { waitUntil: "networkidle" });
    await wait(300);
    await snap("10-search");

    console.log("=== Datasets ===");
    await page.goto("http://localhost:4420/#/p/demo/datasets", { waitUntil: "networkidle" });
    await wait(300);
    await snap("11-datasets");

    console.log("=== Models ===");
    await page.goto("http://localhost:4420/#/p/demo/models", { waitUntil: "networkidle" });
    await wait(300);
    await snap("12-models");

    console.log("=== Command palette ===");
    await page.goto("http://localhost:4420/#/p/demo/p/ticket-classifier/v/ver_5", { waitUntil: "networkidle" });
    await wait(300);
    await page.keyboard.press("Meta+k");
    await wait(200);
    await snap("13-palette");
    await page.keyboard.press("Escape");

    console.log("=== Edit modal ===");
    await page.click('[data-act="edit"]').catch(() => {});
    await wait(300);
    await snap("14-edit-modal");
    await page.keyboard.press("Escape");

    console.log("=== Fork modal ===");
    await page.click('[data-act="fork"]').catch(() => {});
    await wait(300);
    await snap("15-fork-modal");
    await page.keyboard.press("Escape");

    console.log("=== Run modal ===");
    await page.click('[data-act="run"]').catch(() => {});
    await wait(300);
    await snap("16-run-modal");
    await page.keyboard.press("Escape");

    console.log("=== Promote modal ===");
    await page.click('[data-act="promote"]').catch(() => {});
    await wait(300);
    await snap("17-promote-modal");
    await page.keyboard.press("Escape");

  } finally {
    console.log("\n=== ERRORS ===");
    if (errors.length === 0) console.log("(no console errors)");
    errors.forEach((e) => console.log(" ·", e));
    await browser.close();
    server.kill();
  }
})();
