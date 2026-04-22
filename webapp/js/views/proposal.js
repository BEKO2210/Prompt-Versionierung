// Proposal detail view — pull-request-equivalent for prompts.
// Shows: title, status pill, meta (author, source vs. canonical), description,
// a body diff with inline review comments, a discussion thread, and the
// merge / decline / comment actions.

import {
  html, escapeHtml, icon, brandMark, modal, toast,
  statusPill, avatar, authorInline, relTime, resolveMember,
} from "../ui/components.js";
import { getState, commit } from "../store.js";
import * as services from "../services.js";
import { diffText } from "../domain.js";
import { navigate } from "../router.js";

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
export function renderProposalView(route) {
  const s = getState();
  const project = s.projects.find((p) => p.slug === route.path.projectSlug);
  const prompt = project?.prompts.find((p) => p.slug === route.path.promptSlug);
  const proposal = prompt?.proposals?.find((p) => p.id === route.path.proposalId);
  if (!proposal) return `<div class="main">Proposal not found.</div>`;

  const source = prompt.versions.find((v) => v.id === proposal.sourceVersionId);
  const targetBranch = prompt.branches.find((b) => b.id === proposal.targetBranchId) ||
                       prompt.branches.find((b) => b.id === prompt.canonicalBranchId);
  const target = prompt.versions.find((v) => v.id === targetBranch?.headVersionId);
  const opener = resolveMember(project, proposal.openedBy);

  return html`
    ${renderTopbar(project, prompt, proposal)}
    <div class="main">
      ${renderHead(project, prompt, proposal, source, target, opener)}
      ${renderDescription(project, proposal, opener)}
      ${source && target ? renderDiff(proposal, source, target) : ""}
      ${renderEvidence(project, prompt, proposal, source, target)}
      ${renderThread(project, proposal)}
      ${renderFooter(proposal)}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Sub-renderers
// ---------------------------------------------------------------------------
function renderTopbar(project, prompt, proposal) {
  return `
    <div class="topbar">
      <a class="topbar-logo" href="#/"><span class="mark">${brandMark(22)}</span>Prompt Tree</a>
      <span class="topbar-crumb">
        <span class="sep">/</span><a href="#/p/${escapeHtml(project.slug)}">${escapeHtml(project.name)}</a>
        <span class="sep">/</span><a href="#/p/${escapeHtml(project.slug)}/p/${escapeHtml(prompt.slug)}">${escapeHtml(prompt.slug)}</a>
        <span class="sep">/</span><span class="current">proposal</span>
      </span>
      <span class="topbar-spacer"></span>
    </div>`;
}

function renderHead(project, prompt, proposal, source, target, opener) {
  const targetBranch = prompt.branches.find((b) => b.id === proposal.targetBranchId);
  const sourceBranch = source ? prompt.branches.find((b) => b.id === source.createdOnBranchId) : null;
  return `
    <div class="main-head" style="align-items:center">
      <div style="min-width:0;flex:1">
        <div class="crumbs" style="margin-bottom:8px">
          <span class="prop-state ${escapeHtml(proposal.status)}">${escapeHtml(proposal.status)}</span>
        </div>
        <h1 style="margin:0">${escapeHtml(proposal.title)}</h1>
        <div class="subtitle" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px">
          ${authorInline(opener, 18)}
          <span>opened ${escapeHtml(relTime(proposal.openedAt))}</span>
          <span class="sep" style="color:var(--ink-300)">·</span>
          <span>merging</span>
          <span class="br">${escapeHtml(sourceBranch?.name || "?")}</span>
          <span>→</span>
          <span class="br">${escapeHtml(targetBranch?.name || "main")}</span>
          <span class="sep" style="color:var(--ink-300)">·</span>
          <span>source ${source ? `v${source.number}` : "?"} into v${target?.number ?? "?"}</span>
        </div>
      </div>
      <div class="actions">
        ${proposal.status === "open" ? `
          <button class="btn" data-act="decline-proposal">Decline</button>
          <button class="btn accent" data-act="merge-proposal">${icon("check", { size: 13 })} Merge proposal</button>
        ` : `<a class="btn" href="#/p/${escapeHtml(project.slug)}/p/${escapeHtml(prompt.slug)}">${icon("back", { size: 13 })} Back to prompt</a>`}
      </div>
    </div>
  `;
}

function renderDescription(project, proposal, opener) {
  if (!proposal.description) return "";
  return `
    <div class="comment" style="margin-bottom:16px">
      ${avatar(opener, 30)}
      <div class="comment-body">
        <div class="comment-head">
          <span class="name">${escapeHtml(opener.name)}</span>
          <span>proposed this change · ${escapeHtml(relTime(proposal.openedAt))}</span>
        </div>
        <div class="comment-text">${escapeHtml(proposal.description)}</div>
      </div>
    </div>`;
}

// Body diff with inline review-comment threads. Comments are attached by
// side ("a" or "b") and lineIndex (line number on that side).
function renderDiff(proposal, source, target) {
  const d = diffText(target.body, source.body);  // A = target (main), B = source (proposal)
  const commentsByKey = new Map(); // `${side}:${lineIndex}` → [rc]
  for (const rc of proposal.reviewComments || []) {
    const k = `${rc.side}:${rc.lineIndex}`;
    const list = commentsByKey.get(k) || [];
    list.push(rc);
    commentsByKey.set(k, list);
  }

  function wordSide(words, side) {
    return words.filter((w) => (side === "left" ? w.op !== "added" : w.op !== "removed")).map((w) => {
      if (w.op === "added") return `<span class="added-word">${escapeHtml(w.text)}</span>`;
      if (w.op === "removed") return `<span class="removed-word">${escapeHtml(w.text)}</span>`;
      return escapeHtml(w.text);
    }).join("");
  }

  const rows = [];
  for (const l of d.lines) {
    const left = l.op === "modified" ? wordSide(l.words, "left")
              : l.op === "removed"  ? escapeHtml(l.left ?? "")
              : l.op === "equal"    ? escapeHtml(l.left ?? "") : "";
    const right = l.op === "modified" ? wordSide(l.words, "right")
               : l.op === "added"    ? escapeHtml(l.right ?? "")
               : l.op === "equal"    ? escapeHtml(l.right ?? "") : "";
    const li = l.leftIndex != null ? l.leftIndex + 1 : "";
    const ri = l.rightIndex != null ? l.rightIndex + 1 : "";
    rows.push(`<tr class="${l.op}">
      <td class="gutter a">${li}</td><td class="left">${left}</td>
      <td class="gutter b">${ri}${l.rightIndex != null ? `<span class="add-comment" data-line="${l.rightIndex}" title="Add review comment">+</span>` : ""}</td>
      <td class="right">${right}</td>
    </tr>`);

    // Threads under this row (side b, keyed by line index on the B side).
    if (l.rightIndex != null) {
      const thread = commentsByKey.get(`b:${l.rightIndex}`);
      if (thread) {
        rows.push(`<tr class="review-thread"><td colspan="4">${thread.map(rcCommentBlock).join("")}</td></tr>`);
      }
    }
    if (l.leftIndex != null) {
      const thread = commentsByKey.get(`a:${l.leftIndex}`);
      if (thread) {
        rows.push(`<tr class="review-thread"><td colspan="4">${thread.map(rcCommentBlock).join("")}</td></tr>`);
      }
    }
  }

  return `
    <div class="section">
      <div class="section-head">
        <div class="eyebrow">Body diff · canonical ← proposed</div>
        <div class="meta">
          <span style="color:var(--green-700)">+${d.stats.added}</span>
          <span style="color:var(--rose-700);margin-left:8px">−${d.stats.removed}</span>
          <span style="color:var(--amber-700);margin-left:8px">~${d.stats.modified}</span>
          <span style="margin-left:12px;color:var(--fg-faint)">hover a line number to add a review comment</span>
        </div>
      </div>
      <div class="diff">
        <table><tbody>${rows.join("")}</tbody></table>
      </div>
    </div>`;
}

function rcCommentBlock(rc) {
  const s = getState();
  // Walk up to find the project that owns this proposal's comments (for member lookup).
  let member = { name: rc.author || "", initials: "??", color: "#9ba2b3" };
  for (const pr of (s.projects || [])) {
    const found = (pr.members || []).find((m) => m.id === rc.author);
    if (found) { member = found; break; }
  }
  return `<div class="comment review">
    ${avatar(member, 22)}
    <div class="comment-body">
      <div class="comment-head">
        <span class="name">${escapeHtml(member.name)}</span>
        <span>${escapeHtml(relTime(rc.createdAt))}</span>
        <span style="margin-left:auto;font-size:11px">line ${rc.lineIndex + 1} · side ${escapeHtml(rc.side.toUpperCase())}</span>
      </div>
      <div class="comment-text">${escapeHtml(rc.body)}</div>
    </div>
  </div>`;
}

// Evidence: paired run scores, reused from the comparison service.
function renderEvidence(project, prompt, proposal, source, target) {
  if (!source || !target) return "";
  const evidence = services.pairedRunEvidence(prompt, target.id, source.id);
  if (!evidence.length) return "";
  return `
    <div class="section">
      <div class="eyebrow" style="margin-bottom:8px">Evidence</div>
      <table class="table">
        <thead><tr>
          <th>Test case</th><th>Model</th>
          <th class="right">Canonical (v${target.number})</th>
          <th class="right">Proposed (v${source.number})</th>
          <th class="right">Δ</th>
        </tr></thead>
        <tbody>
          ${evidence.map((row) => {
            const tcId = row.a?.run?.testCaseId || row.b?.run?.testCaseId;
            const tc = tcId ? (project.datasets || []).flatMap((d) => d.testCases || []).find((c) => c.id === tcId) : null;
            const mp = project.modelProfiles.find((m) => m.id === (row.a?.run?.modelProfileId || row.b?.run?.modelProfileId));
            const sa = row.a?.score ?? null, sb = row.b?.score ?? null;
            const delta = sa != null && sb != null ? sb - sa : null;
            const cls = delta == null ? "" : delta > 0 ? "good" : delta < 0 ? "bad" : "";
            return `<tr>
              <td>${escapeHtml(tc?.name || "ad-hoc")}</td>
              <td>${escapeHtml(mp?.name || "—")}</td>
              <td class="right score ${sa >= 0.8 ? "good" : sa >= 0.5 ? "mid" : "bad"}">${sa == null ? "—" : Math.round(sa * 100) + "%"}</td>
              <td class="right score ${sb >= 0.8 ? "good" : sb >= 0.5 ? "mid" : "bad"}">${sb == null ? "—" : Math.round(sb * 100) + "%"}</td>
              <td class="right score ${cls}">${delta == null ? "—" : (delta > 0 ? "+" : "") + Math.round(delta * 100) + "%"}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;
}

function renderThread(project, proposal) {
  const comments = proposal.comments || [];
  return `
    <div class="section">
      <div class="eyebrow" style="margin-bottom:10px">Discussion</div>
      ${comments.length === 0
        ? `<div class="empty" style="margin-bottom:14px"><div class="sub">No comments yet. Start the conversation below.</div></div>`
        : `<div class="thread" style="margin-bottom:14px">
            ${comments.map((c) => {
              const member = resolveMember(project, c.author);
              return `<div class="comment">
                ${avatar(member, 28)}
                <div class="comment-body">
                  <div class="comment-head">
                    <span class="name">${escapeHtml(member.name)}</span>
                    <span>${escapeHtml(relTime(c.createdAt))}</span>
                  </div>
                  <div class="comment-text">${escapeHtml(c.body)}</div>
                </div>
              </div>`;
            }).join("")}
          </div>`}
      ${proposal.status === "open" ? `
        <form id="comment-form" class="form-card">
          <div class="form-row"><label>Add a comment</label>
            <textarea name="body" required placeholder="Share your take on this proposal…"></textarea></div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button type="submit" class="btn primary">Post comment</button>
          </div>
        </form>` : ""}
    </div>`;
}

function renderFooter(proposal) {
  return proposal.status === "open" ? "" : `
    <div class="form-card" style="margin-top:16px">
      <div class="eyebrow" style="margin-bottom:4px">Closed</div>
      <div style="font-size:13px;color:var(--fg-muted)">
        ${escapeHtml(proposal.status === "merged" ? "Merged " : "Declined ")}${escapeHtml(relTime(proposal.closedAt))}.
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Bindings
// ---------------------------------------------------------------------------
export function bindProposalView(root, route) {
  const s = getState();
  const project = s.projects.find((p) => p.slug === route.path.projectSlug);
  const prompt = project?.prompts.find((p) => p.slug === route.path.promptSlug);
  const proposal = prompt?.proposals?.find((p) => p.id === route.path.proposalId);
  if (!proposal) return;

  // Merge
  root.querySelector('[data-act="merge-proposal"]')?.addEventListener("click", () => openMergeModal(project, prompt, proposal));
  root.querySelector('[data-act="decline-proposal"]')?.addEventListener("click", () => openDeclineModal(project, prompt, proposal));

  // Post comment
  root.querySelector("#comment-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = new FormData(e.currentTarget).get("body");
    if (!body) return;
    services.addProposalComment({ promptId: prompt.id, proposalId: proposal.id, body });
    await commit();
    toast("Comment posted");
  });

  // Inline review comments
  root.querySelectorAll(".diff .add-comment").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const lineIndex = Number(btn.dataset.line);
      openReviewCommentModal(project, prompt, proposal, "b", lineIndex);
    });
  });
}

function openMergeModal(project, prompt, proposal) {
  modal({
    title: "Merge proposal",
    sub: "Promotes the proposed version to the canonical branch and closes this proposal.",
    body: `
      <div class="row"><label>Mode</label>
        <select name="mode">
          <option value="squashed">Squashed (copy onto canonical — keeps main linear)</option>
          <option value="pointer">Pointer (fast-forward)</option>
        </select></div>
      <div class="row"><label>Merge rationale <span class="req">*</span></label>
        <input name="rationale" required value="${escapeHtml(`Merge: ${proposal.title}`)}" /></div>`,
    primary: "Merge", secondary: "Cancel",
    onSubmit: async (data) => {
      await services.mergeProposal({
        promptId: prompt.id, proposalId: proposal.id,
        mode: data.mode, rationale: data.rationale,
      });
      await commit();
      toast("Proposal merged");
      navigate(`/p/${project.slug}/p/${prompt.slug}`);
    },
  });
}

function openDeclineModal(project, prompt, proposal) {
  modal({
    title: "Decline proposal",
    body: `
      <div class="row"><label>Reason (optional)</label>
        <input name="reason" placeholder="Why is this not shipping?" /></div>`,
    primary: "Decline", secondary: "Cancel",
    onSubmit: async (data) => {
      services.declineProposal({ promptId: prompt.id, proposalId: proposal.id, reason: data.reason });
      await commit();
      toast("Proposal declined");
    },
  });
}

function openReviewCommentModal(project, prompt, proposal, side, lineIndex) {
  modal({
    title: `Comment on line ${lineIndex + 1}`,
    sub: `This comment is anchored to side ${side.toUpperCase()}, line ${lineIndex + 1} of the diff.`,
    body: `
      <div class="row"><label>Comment <span class="req">*</span></label>
        <textarea name="body" required placeholder="Be specific — what should change and why?"></textarea></div>`,
    primary: "Post review comment", secondary: "Cancel",
    onSubmit: async (data) => {
      services.addReviewComment({
        promptId: prompt.id, proposalId: proposal.id,
        side, lineIndex, body: data.body,
      });
      await commit();
      toast("Review comment added");
    },
  });
}
