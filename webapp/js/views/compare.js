// Compare view — side-by-side diff + paired run evidence.

import { html, escapeHtml, icon, brandMark, statusPill, scoreCell } from "../ui/components.js";
import { getState } from "../store.js";
import { diffText, abFromScores } from "../domain.js";
import * as services from "../services.js";
import { navigate } from "../router.js";

// Threshold above which a run-score counts as a "pass" for the Wilson-
// based A/B test. 0.5 matches how evaluators in this app are built: the
// regex/schema evaluators emit 0 or 1 already; similarity / rubric
// evaluators emit 0..1 and anything ≥ 0.5 is by convention "acceptable".
// Exposed as a constant so the sidebar can label it.
const PASS_THRESHOLD = 0.5;

export function renderCompareView(route) {
  const s = getState();
  const project = s.projects.find((p) => p.slug === route.path.projectSlug);
  const prompt = project?.prompts.find((p) => p.slug === route.path.promptSlug);
  if (!prompt) return `<div class="main">Not found.</div>`;
  const versions = prompt.versions;
  const aId = route.query.a || versions[0]?.id;
  const bId = route.query.b || versions.at(-1)?.id;
  const a = versions.find((v) => v.id === aId);
  const b = versions.find((v) => v.id === bId);

  return html`
    ${renderTopbar(project, prompt)}
    <div class="main">
      <div class="main-head">
        <div>
          <div class="eyebrow">Compare</div>
          <h1>${icon("compare", { size: 16 })} ${escapeHtml(prompt.name)}</h1>
          <div class="subtitle">Pick two versions. The run-evidence panel below shows paired scores.</div>
        </div>
        <div class="actions">
          <a class="btn" href="#/p/${escapeHtml(project.slug)}/p/${escapeHtml(prompt.slug)}">${icon("back", { size: 13 })} Back</a>
        </div>
      </div>

      <form class="form-card" id="pick-form" style="margin-bottom:18px;display:grid;grid-template-columns:1fr auto 1fr auto;gap:12px;align-items:end">
        <div><label>A</label>
          <select name="a">${versions.map((v) => `<option value="${v.id}" ${v.id === aId ? "selected" : ""}>v${v.number} — ${escapeHtml(v.title)}</option>`).join("")}</select></div>
        <div style="color:var(--fg-faint);padding-bottom:8px">${icon("arrow", { size: 16 })}</div>
        <div><label>B</label>
          <select name="b">${versions.map((v) => `<option value="${v.id}" ${v.id === bId ? "selected" : ""}>v${v.number} — ${escapeHtml(v.title)}</option>`).join("")}</select></div>
        <button type="submit" class="btn primary">Diff</button>
      </form>

      ${a && b && a.id !== b.id ? renderDiff(project, prompt, a, b) : `<div class="empty"><div class="sub">Pick two different versions.</div></div>`}
    </div>
  `;
}

function renderTopbar(project, prompt) {
  return `
    <div class="topbar">
      <a class="topbar-logo" href="#/"><span class="mark">${brandMark(22)}</span>Prompt Tree</a>
      <span class="topbar-crumb">
        <span class="sep">/</span>
        <a href="#/p/${escapeHtml(project.slug)}">${escapeHtml(project.name)}</a>
        <span class="sep">/</span>
        <a href="#/p/${escapeHtml(project.slug)}/p/${escapeHtml(prompt.slug)}">${escapeHtml(prompt.slug)}</a>
        <span class="sep">/</span>
        <span class="current">compare</span>
      </span>
      <span class="topbar-spacer"></span>
    </div>`;
}

function renderDiff(project, prompt, a, b) {
  const d = diffText(a.body, b.body);
  const evidence = services.pairedRunEvidence(prompt, a.id, b.id);
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      ${side("A", a)}
      ${side("B", b)}
    </div>

    <div class="section">
      <div class="section-head">
        <div class="eyebrow">Body diff</div>
        <div class="meta">
          <span style="color:var(--green-700)">+${d.stats.added}</span>
          <span style="color:var(--rose-700);margin-left:8px">−${d.stats.removed}</span>
          <span style="color:var(--amber-700);margin-left:8px">~${d.stats.modified}</span>
        </div>
      </div>
      <div class="diff">
        <table>
          <tbody>${d.lines.map(renderDiffRow).join("")}</tbody>
        </table>
      </div>
    </div>

    <div class="section">
      <div class="eyebrow" style="margin-bottom:8px">Run evidence</div>
      ${evidence.length === 0
        ? `<div class="empty"><div class="sub">No overlapping (test case × model) runs. Run the same pair on both sides to see paired scores.</div></div>`
        : `
          ${renderAbSummary(evidence)}
          <table class="table">
             <thead><tr>
               <th>Test case</th><th>Model</th><th class="right">A</th><th class="right">B</th><th class="right">Δ</th>
             </tr></thead>
             <tbody>${evidence.map((row) => renderEvidenceRow(project, row)).join("")}</tbody>
           </table>`}
    </div>
  `;
}

// A/B summary: pass-rate per side with Wilson 95% CI, then the signed
// difference with a 95% Newcombe CI. Shows a "significant" badge when
// 0 is outside the diff CI — the claim A beats B (or vice versa) can be
// supported at α=0.05 on this sample.
function renderAbSummary(evidence) {
  const pairs = evidence.map((r) => ({
    a: r.a?.score ?? null,
    b: r.b?.score ?? null,
  }));
  const r = abFromScores(pairs, PASS_THRESHOLD);
  const pct = (x) => Math.round(x * 100) + "%";
  const signed = (x) => (x > 0 ? "+" : "") + pct(x);
  const enoughData = r.a.n > 0 && r.b.n > 0;

  const badge = !enoughData
    ? `<span class="sig-badge sig-none">insufficient runs</span>`
    : r.significant
      ? `<span class="sig-badge sig-${r.direction > 0 ? "up" : "down"}">
           ${icon("check", { size: 11 })} ${r.direction > 0 ? "B &gt; A" : "A &gt; B"} at 95%
         </span>`
      : `<span class="sig-badge sig-ns">not significant</span>`;

  const ciText = enoughData
    ? `95% CI [${signed(r.lower)}, ${signed(r.upper)}]`
    : `need ≥1 paired run on each side`;

  return `
    <div class="ab-summary">
      <div class="ab-side">
        <div class="ab-side-label">A pass rate</div>
        <div class="ab-side-value">${r.a.n ? `${pct(r.a.p)} <span class="ab-side-n">(${r.a.successes}/${r.a.n})</span>` : "—"}</div>
        <div class="ab-side-ci">${r.a.n ? `95% CI ${pct(r.a.lower)}–${pct(r.a.upper)}` : ""}</div>
      </div>
      <div class="ab-center">
        <div class="ab-delta ${r.direction > 0 ? "good" : r.direction < 0 ? "bad" : ""}">
          ${enoughData ? (Number.isNaN(r.diff) ? "—" : signed(r.diff)) : "—"}
        </div>
        <div class="ab-delta-label">Δ (B − A)</div>
        <div class="ab-ci">${escapeHtml(ciText)}</div>
        <div class="ab-badge">${badge}</div>
      </div>
      <div class="ab-side">
        <div class="ab-side-label">B pass rate</div>
        <div class="ab-side-value">${r.b.n ? `${pct(r.b.p)} <span class="ab-side-n">(${r.b.successes}/${r.b.n})</span>` : "—"}</div>
        <div class="ab-side-ci">${r.b.n ? `95% CI ${pct(r.b.lower)}–${pct(r.b.upper)}` : ""}</div>
      </div>
    </div>
    <div class="ab-note">
      Pass = evaluator score ≥ ${(PASS_THRESHOLD * 100).toFixed(0)}%. CI is Wilson (per side) +
      Newcombe method 10 (difference). Significant means the 95% CI for B − A
      does not cross zero.
    </div>`;
}

function side(label, v) {
  return `
    <div class="form-card">
      <div class="eyebrow">Side ${label}</div>
      <div style="font-weight:600;margin-top:4px">v${v.number} · ${escapeHtml(v.title)}</div>
      <div style="margin-top:6px">${statusPill(v.status)} <span class="hash-chip" style="margin-left:6px">${escapeHtml((v.contentHash || "").slice(0, 7))}</span></div>
    </div>`;
}

function renderDiffRow(l) {
  const left = l.op === "modified" ? wordSide(l.words, "left")
            : l.op === "removed"  ? escapeHtml(l.left ?? "")
            : l.op === "equal"    ? escapeHtml(l.left ?? "") : "";
  const right = l.op === "modified" ? wordSide(l.words, "right")
             : l.op === "added"    ? escapeHtml(l.right ?? "")
             : l.op === "equal"    ? escapeHtml(l.right ?? "") : "";
  const cls = l.op;
  const li = l.leftIndex != null ? l.leftIndex + 1 : "";
  const ri = l.rightIndex != null ? l.rightIndex + 1 : "";
  return `<tr class="${cls}">
    <td class="gutter">${li}</td><td class="left">${left}</td>
    <td class="gutter">${ri}</td><td class="right">${right}</td>
  </tr>`;
}
function wordSide(words, side) {
  return words.filter((w) => (side === "left" ? w.op !== "added" : w.op !== "removed")).map((w) => {
    if (w.op === "added") return `<span class="added-word">${escapeHtml(w.text)}</span>`;
    if (w.op === "removed") return `<span class="removed-word">${escapeHtml(w.text)}</span>`;
    return escapeHtml(w.text);
  }).join("");
}

function renderEvidenceRow(project, row) {
  const mp = project.modelProfiles.find((m) => m.id === (row.a?.run?.modelProfileId || row.b?.run?.modelProfileId));
  const tcId = row.a?.run?.testCaseId || row.b?.run?.testCaseId;
  const tc = tcId ? (project.datasets || []).flatMap((d) => d.testCases || []).find((c) => c.id === tcId) : null;
  const sa = row.a?.score ?? null, sb = row.b?.score ?? null;
  const delta = sa != null && sb != null ? sb - sa : null;
  const deltaCls = delta == null ? "" : delta > 0 ? "good" : delta < 0 ? "bad" : "";
  return `<tr>
    <td>${escapeHtml(tc?.name || "ad-hoc")}</td>
    <td>${escapeHtml(mp?.name || "—")}</td>
    <td class="right">${scoreCell(sa)}</td>
    <td class="right">${scoreCell(sb)}</td>
    <td class="right score ${deltaCls}">${delta == null ? "—" : (delta > 0 ? "+" : "") + (delta * 100).toFixed(0) + "%"}</td>
  </tr>`;
}

export function bindCompareView(root, route) {
  root.querySelector("#pick-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    navigate(`/p/${route.path.projectSlug}/p/${route.path.promptSlug}/compare`, { a: fd.get("a"), b: fd.get("b") });
  });
}
