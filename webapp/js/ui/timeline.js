// Timeline renderer for activity events.
// Each event becomes one line: avatar + human sentence + timestamp.
// Events are stable identifiers, so we can evolve the copy without touching
// the stored payloads.

import { escapeHtml, relTime, avatar, resolveMember } from "./components.js";

// Produce the human sentence for one activity record.
function describe(event, ctx) {
  const m = event.metadata || {};
  const vLink = (vId, fallback) => {
    if (!vId) return escapeHtml(fallback || "a version");
    const v = ctx.versionById?.get(vId);
    const label = v ? `v${v.number}` : (fallback || "version");
    return `<a href="#/p/${escapeHtml(ctx.projectSlug)}/p/${escapeHtml(ctx.promptSlug)}/v/${escapeHtml(vId)}">${escapeHtml(label)}</a>`;
  };
  const propLink = (pid, fallback) =>
    `<a href="#/p/${escapeHtml(ctx.projectSlug)}/p/${escapeHtml(ctx.promptSlug)}/proposals/${escapeHtml(pid)}">${escapeHtml(fallback || "a proposal")}</a>`;

  switch (event.kind) {
    case "version_created":
      return `committed ${vLink(m.versionId)} on <code>${escapeHtml(ctx.branchNameById?.get(m.branchId) || m.branchId || "?")}</code>` +
        (m.changeSummary ? ` — <em>${escapeHtml(m.changeSummary)}</em>` : "");
    case "version_promoted":
      return `promoted ${vLink(m.versionId)} to canonical${m.mode ? ` (<code>${escapeHtml(m.mode)}</code>)` : ""}` +
        (m.rationale ? ` — <em>${escapeHtml(m.rationale)}</em>` : "");
    case "branch_created":
      return `created branch <code>${escapeHtml(m.name || "")}</code> from ${vLink(m.fromVersionId)}`;
    case "branch_archived":
      return `archived branch <code>${escapeHtml(m.name || "")}</code>`;
    case "run_completed": {
      const sc = (m.score == null) ? "" : ` — score <strong>${Math.round(m.score * 100)}%</strong>`;
      return `ran ${vLink(m.versionId)}${sc}`;
    }
    case "note_added":
      return `added a note on ${vLink(m.versionId)}` + (m.excerpt ? ` — <em>${escapeHtml(m.excerpt)}${m.excerpt.length > 78 ? "…" : ""}</em>` : "");
    case "suggestion_accepted":
      return `accepted a refinement suggestion on ${vLink(m.versionId)}`;
    case "suggestion_rejected":
      return `rejected a refinement suggestion on ${vLink(m.versionId)}`;
    case "proposal_opened":
      return `opened ${propLink(m.proposalId, m.title || "a proposal")}`;
    case "proposal_commented":
      return `commented on a proposal — <em>${escapeHtml((m.excerpt || "").slice(0, 120))}</em>`;
    case "proposal_merged":
      return `merged a proposal${m.mode ? ` (<code>${escapeHtml(m.mode)}</code>)` : ""}`;
    case "proposal_declined":
      return `declined a proposal${m.reason ? ` — <em>${escapeHtml(m.reason)}</em>` : ""}`;
    case "release_published":
      return `published release <strong>${escapeHtml(m.name || "")}</strong>`;
    default:
      return `<em>${escapeHtml(event.kind)}</em>`;
  }
}

// Render a single timeline row for the given activity event.
export function timelineItem(event, ctx, project) {
  const member = resolveMember(project, event.actorId);
  const when = relTime(event.timestamp);
  const sentence = describe(event, ctx);
  // optional "on <prompt>" suffix when the activity lives above a single prompt
  const promptSuffix = ctx.includePromptSuffix && event.promptSlug
    ? ` in <a href="#/p/${escapeHtml(ctx.projectSlug)}/p/${escapeHtml(event.promptSlug)}"><strong>${escapeHtml(event.promptName || event.promptSlug)}</strong></a>`
    : "";

  return `<div class="timeline-item" data-kind="${escapeHtml(event.kind)}">
    ${avatar(member, 22)}
    <div class="body"><strong>${escapeHtml(member.name)}</strong> ${sentence}${promptSuffix}<span class="when"> · ${escapeHtml(when)}</span></div>
  </div>`;
}

export function timeline(events, ctx, project) {
  if (!events || events.length === 0) {
    return `<div class="empty"><div class="sub">No activity yet.</div></div>`;
  }
  const rows = events.map((e) => timelineItem(e, ctx, project)).join("");
  return `<div class="timeline">${rows}</div>`;
}
