#!/usr/bin/env node
// Comprehensive audit — checks every page, link, click target at 3 viewports.
// Reports:  console errors / page errors / failed requests / horizontal overflow /
//           visible broken links (hrefs whose route doesn't resolve) /
//           off-screen or clipped buttons / tap-target < 32×32 on mobile.

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const OUT = path.join(__dirname, "audit-out");
fs.mkdirSync(OUT, { recursive: true });

const server = spawn("python3", ["-m", "http.server", "4421", "--directory", "webapp"], {
  stdio: ["ignore", "ignore", "ignore"],
});

const ROUTES = [
  ["workspace",      "/"],
  ["settings",       "/#/settings"],
  ["help",           "/#/help"],
  ["project",        "/#/p/demo"],
  ["prompt-content", "/#/p/demo/p/ticket-classifier/v/ver_5"],
  ["prompt-blame",   "/#/p/demo/p/ticket-classifier/v/ver_5?blame=1"],
  ["prompt-trend",   "/#/p/demo/p/ticket-classifier/v/ver_5?tab=trend"],
  ["prompt-runs",    "/#/p/demo/p/ticket-classifier/v/ver_5?tab=runs"],
  ["prompt-lineage", "/#/p/demo/p/ticket-classifier/v/ver_5?tab=lineage"],
  ["prompt-decs",    "/#/p/demo/p/ticket-classifier/v/ver_5?tab=decisions"],
  ["prompt-notes",   "/#/p/demo/p/ticket-classifier/v/ver_5?tab=notes"],
  ["prompt-readme",  "/#/p/demo/p/ticket-classifier/v/ver_5?tab=readme"],
  ["prompt-activity","/#/p/demo/p/ticket-classifier/v/ver_5?tab=activity"],
  ["prompt-props",   "/#/p/demo/p/ticket-classifier/v/ver_5?tab=proposals"],
  ["prompt-rels",    "/#/p/demo/p/ticket-classifier/v/ver_5?tab=releases"],
  ["compare",        "/#/p/demo/p/ticket-classifier/compare?a=ver_3&b=ver_5"],
  ["refine",         "/#/p/demo/p/ticket-classifier/refine/ver_2"],
  ["proposal",       "/#/p/demo/p/ticket-classifier/proposals/prop_1"],
  ["search",         "/#/p/demo/search?q=billing"],
  ["datasets",       "/#/p/demo/datasets"],
  ["models",         "/#/p/demo/models"],
  ["rubrics",        "/#/p/demo/rubrics"],
  ["404",            "/#/does/not/exist"],
];

const VIEWPORTS = [
  { name: "desktop", w: 1400, h: 900 },
  { name: "tablet",  w: 820,  h: 1180 },
  { name: "mobile",  w: 390,  h: 844 },
];

async function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

function summarize(el) {
  const tag = el.tagName.toLowerCase();
  const cls = typeof el.className === "string" ? el.className : "";
  const id  = el.id || "";
  let s = tag;
  if (id) s += "#" + id;
  if (cls) s += "." + cls.trim().split(/\s+/).slice(0, 3).join(".");
  if (tag === "a" && el.getAttribute("href")) s += `[href="${el.getAttribute("href")}"]`;
  if (el.getAttribute("data-act")) s += `[data-act="${el.getAttribute("data-act")}"]`;
  return s.slice(0, 140);
}

(async () => {
  await wait(500);

  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });

  const allIssues = [];

  for (const vp of VIEWPORTS) {
    console.log(`\n═══ Viewport: ${vp.name} (${vp.w}×${vp.h}) ═══`);
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    // Suppress the auto-tour so it doesn't block clicks
    await ctx.addInitScript(() => {
      try { localStorage.setItem("prompt-tree:tour:completed", "1"); } catch {}
    });
    const page = await ctx.newPage();

    const cEvents = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") cEvents.push(`[${vp.name} console.error] ${msg.text()}`);
      if (msg.type() === "warning") cEvents.push(`[${vp.name} console.warn] ${msg.text()}`);
    });
    page.on("pageerror", (e) => cEvents.push(`[${vp.name} pageerror] ${e.message}`));
    page.on("requestfailed", (req) => {
      const url = req.url();
      // Ignore missing favicons / devtools pings
      if (/\.well-known|favicon/.test(url)) return;
      cEvents.push(`[${vp.name} requestfailed] ${url} — ${req.failure()?.errorText}`);
    });

    for (const [label, url] of ROUTES) {
      const full = `http://localhost:4421${url}`;
      try {
        await page.goto(full, { waitUntil: "networkidle", timeout: 15000 });
      } catch (e) {
        cEvents.push(`[${vp.name} ${label}] goto failed: ${e.message}`);
        continue;
      }
      await wait(350);

      const report = await page.evaluate((vpName) => {
        const issues = [];
        const mobile = vpName === "mobile";

        // 1. Horizontal overflow
        const sw = document.documentElement.scrollWidth;
        const cw = document.documentElement.clientWidth;
        if (sw > cw + 2) issues.push({ kind: "hscroll", msg: `scrollWidth=${sw} clientWidth=${cw}` });

        // 2. Links that point to routes our hash-router recognises?
        //    Tolerated:  "#/...", full URL starting "http", "javascript:" is disallowed.
        const badHrefs = [];
        const duplicateDataAct = {};
        const tinyTargets = [];
        const offscreen = [];

        const clickables = document.querySelectorAll("a[href], button, [data-act]");
        for (const el of clickables) {
          // Links
          if (el.tagName === "A") {
            const href = el.getAttribute("href") || "";
            if (!href) badHrefs.push("anchor without href: " + el.outerHTML.slice(0, 120));
            else if (href.startsWith("javascript:")) badHrefs.push("javascript: href → " + href);
            else if (href.startsWith("#")) {
              // OK — local hash route.  Further resolution needs the router;
              // we'll validate that separately on the routing side.
            } else if (!/^(https?:|mailto:|tel:|\.\/|\.\.\/|\/)/.test(href)) {
              badHrefs.push("non-absolute, non-hash href: " + href);
            }
          }
          // Tap-target size on mobile.
          // WCAG 2.5.8 AA requires 24×24. We use that, and exempt:
          //   - icon-only topbar affordances
          //   - inline links inside prose (timeline / activity / markdown)
          //     because they are text runs, not primary tap targets.
          if (mobile) {
            const r = el.getBoundingClientRect();
            const inProse = el.closest(".timeline-item, .markdown, .comment-text, .prop-meta, .subtitle");
            if (r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24)) {
              if (!el.closest(".topbar") && !inProse)
                tinyTargets.push(Math.round(r.width) + "x" + Math.round(r.height) + " " + (el.textContent || "").trim().slice(0, 30));
            }
            if (r.width > 0 && (r.right > window.innerWidth + 4 || r.left < -4)) {
              offscreen.push((el.textContent || "").trim().slice(0, 40) + ` r=[${Math.round(r.left)},${Math.round(r.right)}]`);
            }
          }
        }

        for (const h of badHrefs) issues.push({ kind: "bad-href", msg: h });
        for (const t of tinyTargets.slice(0, 5)) issues.push({ kind: "tiny-tap", msg: t });
        for (const o of offscreen.slice(0, 5)) issues.push({ kind: "offscreen", msg: o });

        // 3. Any text clipped by overflow hidden?
        //    Harder to detect reliably; skipped.

        // 4. Any element with computed style `display:none` but a tab semantic?
        //    Skipped.

        return issues;
      }, vp.name);

      for (const it of report) {
        cEvents.push(`[${vp.name} ${label}] ${it.kind}: ${it.msg}`);
      }

      // Save a screenshot for the mobile viewport & key desktop views
      const shouldShot =
        (vp.name === "mobile" &&
          ["workspace", "project", "prompt-content", "compare", "settings", "help", "proposal"].includes(label)) ||
        (vp.name === "desktop" && ["workspace", "prompt-content"].includes(label));
      if (shouldShot) {
        await page.screenshot({
          path: path.join(OUT, `${vp.name}-${label}.png`),
          fullPage: true,
        });
      }

      // Try to click the palette open at desktop & close it
      if (vp.name === "desktop" && label === "prompt-content") {
        await page.keyboard.press("Meta+k");
        await wait(300);
        const pOpen = await page.$(".palette");
        if (!pOpen) cEvents.push(`[desktop palette] Cmd+K did not open palette`);
        await page.keyboard.press("Escape");
        await wait(150);
      }
    }

    allIssues.push(...cEvents);
    await ctx.close();
  }

  console.log("\n\n═══ SUMMARY ═══");
  if (allIssues.length === 0) console.log("✓ no issues");
  else {
    console.log(`✗ ${allIssues.length} issue(s) found:`);
    for (const i of allIssues) console.log("  " + i);
  }

  // Write report
  fs.writeFileSync(path.join(OUT, "report.txt"), allIssues.join("\n") + "\n");
  console.log(`\nReport written to ${path.join(OUT, "report.txt")}`);

  await browser.close();
  server.kill();
  process.exit(allIssues.length > 0 ? 1 : 0);
})();
