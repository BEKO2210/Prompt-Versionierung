// tour.js — first-run onboarding spotlight.
//
// Walks a new user through the real demo data. No fake screens; every
// step is anchored to a real DOM element by selector. Steps may
// optionally navigate to a different hash route first; the engine waits
// for the target selector to appear before painting the spotlight.
//
// Persistence:
//   localStorage["prompt-tree:tour:completed"] = "1"   when finished or skipped
//
// Public API:
//   start({ force }?)          — opens the tour. `force` re-runs even if completed.
//   maybeAutoStart()           — opens automatically on first visit only.

import { navigate } from "./router.js";

const KEY = "prompt-tree:tour:completed";

// ---------------------------------------------------------------------------
// The script — small enough to maintain by reading.
// ---------------------------------------------------------------------------
const STEPS = [
  {
    route: "/",
    selector: ".cards-grid .card",
    title: "Welcome to Prompt Tree",
    body:
      "Every prompt lives inside a <strong>project</strong> — your workspace. " +
      "We've seeded one called <em>Demo</em> so you can poke at a real example. " +
      "Click <em>Next</em> and we'll go in.",
    placement: "right",
  },
  {
    route: "/p/demo",
    selector: ".timeline",
    title: "A live activity feed",
    body:
      "Every change a teammate makes — a new version, a fork, a run, a proposal — " +
      "lands here. Think of it as the project's commit log, but for prompts.",
    placement: "left",
  },
  {
    route: "/p/demo/p/ticket-classifier/v/ver_5",
    selector: ".rail .tree",
    title: "The version tree",
    body:
      "Every edit creates a <strong>new permanent version</strong>. Branches diverge " +
      "but never disappear. Same branch shares a column; a fork to a new branch " +
      "steps right by one.",
    placement: "right",
  },
  {
    route: "/p/demo/p/ticket-classifier/v/ver_5?tab=proposals",
    selector: '.tab[data-tab="proposals"]',
    title: "Proposed changes (PR for prompts)",
    body:
      "Instead of promoting a candidate directly to <code>main</code>, open a " +
      "proposal: a title, a description, a diff, paired run-evidence and a " +
      "discussion thread — including <strong>line-anchored review comments</strong>. " +
      "There's already one open here.",
    placement: "bottom",
  },
  {
    route: "/p/demo/p/ticket-classifier/v/ver_5",
    selector: '[data-act="run"]',
    title: "Run, with cost preview",
    body:
      "Test a version against a model and a test case. The run modal shows you " +
      "the input-token count <strong>before</strong> you call the API, so a " +
      "$10 prompt is visible before it leaves the browser.",
    placement: "bottom",
  },
  {
    route: "/",
    selector: 'a[href="#/settings"]',
    title: "Bring your own keys",
    body:
      "Add your Anthropic / OpenAI / Gemini key in <em>Settings</em>. They're stored " +
      "locally, encrypted at rest, and <strong>never exported</strong>. Without a key " +
      "the run still works — it falls back to the deterministic mock.",
    placement: "bottom",
  },
  {
    route: "/",
    selector: ".cards-grid",
    title: "You're set",
    body:
      "<strong>⌘K / Ctrl-K</strong> jumps to any prompt or version. <strong>E / F / R</strong> " +
      "edit / fork / run on the prompt view. Re-run this tour any time from the " +
      "<em>Tutorial</em> link in the top bar.",
    placement: "auto",
  },
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let active = false;
let stepIdx = 0;

export function isCompleted() {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}
function markCompleted() {
  try { localStorage.setItem(KEY, "1"); } catch {}
}
export function clearCompleted() {
  try { localStorage.removeItem(KEY); } catch {}
}

export function maybeAutoStart() {
  if (isCompleted()) return;
  // Wait one frame so the initial render has happened.
  requestAnimationFrame(() => start({ force: false }));
}

export function start({ force = true } = {}) {
  if (active) return;
  if (!force && isCompleted()) return;
  active = true;
  stepIdx = 0;
  ensureRoot();
  renderStep();
  document.addEventListener("keydown", onKey);
  window.addEventListener("resize", reflow);
}

function close({ completed = true } = {}) {
  if (!active) return;
  active = false;
  document.removeEventListener("keydown", onKey);
  window.removeEventListener("resize", reflow);
  const root = document.getElementById("tour-root");
  if (root) root.innerHTML = "";
  if (completed) markCompleted();
}

function onKey(e) {
  if (!active) return;
  if (e.key === "Escape")    { e.preventDefault(); close({ completed: true }); }
  if (e.key === "ArrowRight") { e.preventDefault(); next(); }
  if (e.key === "ArrowLeft")  { e.preventDefault(); prev(); }
}

function next() {
  if (stepIdx >= STEPS.length - 1) return close({ completed: true });
  stepIdx++;
  renderStep();
}
function prev() {
  if (stepIdx === 0) return;
  stepIdx--;
  renderStep();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function ensureRoot() {
  if (document.getElementById("tour-root")) return;
  const r = document.createElement("div");
  r.id = "tour-root";
  document.body.appendChild(r);
}

async function renderStep() {
  const step = STEPS[stepIdx];
  if (!step) return close({ completed: true });

  // 1. Navigate if needed (the route may differ from the current one).
  if (step.route) {
    const want = "#" + (step.route.startsWith("/") ? step.route : "/" + step.route);
    if (location.hash !== want) {
      navigate(step.route);
      // Wait for the route handler to repaint.
      await waitFrames(2);
    }
  }
  // 2. Wait for the target selector to exist.
  const el = await waitForSelector(step.selector, 1500);
  paintOverlay(step, el);
}

function waitFrames(n) {
  return new Promise((res) => {
    const tick = () => (--n <= 0) ? res() : requestAnimationFrame(tick);
    requestAnimationFrame(tick);
  });
}

function waitForSelector(sel, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const probe = () => {
      const el = document.querySelector(sel);
      if (el) return resolve(el);
      if (performance.now() - t0 > timeoutMs) return resolve(null);
      requestAnimationFrame(probe);
    };
    probe();
  });
}

function paintOverlay(step, el) {
  const root = document.getElementById("tour-root");
  if (!root) return;

  const total = STEPS.length;
  const isLast = stepIdx === total - 1;
  const isFirst = stepIdx === 0;

  const tooltip = `
    <div class="tour-tooltip" role="dialog" aria-live="polite">
      <div class="tour-tooltip-step">${stepIdx + 1} / ${total}</div>
      <div class="tour-tooltip-title">${step.title || ""}</div>
      <div class="tour-tooltip-body">${step.body || ""}</div>
      <div class="tour-tooltip-actions">
        <button class="btn ghost" data-act="tour-skip">Skip</button>
        <span style="flex:1"></span>
        <button class="btn" data-act="tour-prev" ${isFirst ? "disabled" : ""}>← Back</button>
        <button class="btn accent" data-act="tour-next">${isLast ? "Done" : "Next →"}</button>
      </div>
    </div>`;

  if (el) {
    const r = el.getBoundingClientRect();
    // 8 px padding around the element.
    const pad = 8;
    const top    = Math.max(0, r.top - pad);
    const left   = Math.max(0, r.left - pad);
    const width  = r.width + pad * 2;
    const height = r.height + pad * 2;

    root.innerHTML = `
      <div class="tour-backdrop"></div>
      <div class="tour-spotlight" style="top:${top}px;left:${left}px;width:${width}px;height:${height}px"></div>
      ${tooltip}
    `;
    positionTooltip(step, root.querySelector(".tour-tooltip"), { top, left, width, height });
    el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  } else {
    // Selector didn't appear — fall back to a centred dialog.
    root.innerHTML = `<div class="tour-backdrop"></div>${tooltip}`;
    const tip = root.querySelector(".tour-tooltip");
    tip.style.position = "fixed";
    tip.style.left = "50%";
    tip.style.top = "50%";
    tip.style.transform = "translate(-50%, -50%)";
  }

  // Wire actions.
  root.querySelector('[data-act="tour-skip"]')?.addEventListener("click", () => close({ completed: true }));
  root.querySelector('[data-act="tour-prev"]')?.addEventListener("click", prev);
  root.querySelector('[data-act="tour-next"]')?.addEventListener("click", next);
}

function positionTooltip(step, tip, target) {
  if (!tip) return;
  const margin = 12;
  // Render off-screen first so we can measure.
  tip.style.position = "fixed";
  tip.style.visibility = "hidden";
  tip.style.left = "-9999px";
  document.body; // touch
  // Force layout
  const tw = tip.offsetWidth || 320;
  const th = tip.offsetHeight || 160;

  const centerX = target.left + target.width / 2;
  const centerY = target.top  + target.height / 2;
  const winW = window.innerWidth, winH = window.innerHeight;

  // Try the requested placement, fall back to whichever side has room.
  const placements = [step.placement || "auto", "bottom", "top", "right", "left"];
  let chosen = null;
  for (const p of placements) {
    const c = candidate(p, target, tw, th, margin);
    if (c && fitsViewport(c, tw, th, winW, winH)) { chosen = c; break; }
  }
  if (!chosen) chosen = { left: clamp(centerX - tw / 2, margin, winW - tw - margin),
                         top:  clamp(centerY - th / 2, margin, winH - th - margin) };

  tip.style.left = chosen.left + "px";
  tip.style.top  = chosen.top + "px";
  tip.style.visibility = "visible";
}

function candidate(p, t, tw, th, m) {
  if (p === "right")  return { left: t.left + t.width + m, top: t.top };
  if (p === "left")   return { left: t.left - tw - m, top: t.top };
  if (p === "top")    return { left: t.left + t.width / 2 - tw / 2, top: t.top - th - m };
  if (p === "bottom") return { left: t.left + t.width / 2 - tw / 2, top: t.top + t.height + m };
  return null;
}
function fitsViewport(c, w, h, W, H) {
  return c.left >= 8 && c.top >= 8 && (c.left + w) <= (W - 8) && (c.top + h) <= (H - 8);
}
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function reflow() {
  if (!active) return;
  // Re-paint current step on resize so the spotlight stays aligned.
  renderStep();
}
