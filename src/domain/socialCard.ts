// Social card generator (E3).
//
// Produces a 1200×630 SVG string that can be dropped into an OpenGraph
// `og:image`, shared on Twitter / LinkedIn, or committed into a project
// README. The format is fixed at the standard OG aspect ratio so the
// output composes with every social-preview renderer out there without
// per-platform tuning.
//
// Pure module — string in, string out. No DOM, no fetch, no canvas.
// The PNG conversion (via in-page <canvas>) lives in
// `webapp/js/socialCard.js`; the Next.js mirror can serve the same SVG
// straight from a Route Handler once Phase F lands.
//
// Every user-controlled string is escaped at the boundary so a prompt
// titled `"><script>...` cannot inject markup. We never interpolate
// raw strings into attribute values — `escapeAttr` + `escapeText`
// cover the two surfaces.

export interface SocialCardInput {
  projectName: string;
  promptName: string;
  versionTitle: string;
  versionNumber: number;
  status: string;
  contentHashShort?: string;
  changeSummary?: string;
  branches: number;
  versions: number;
  runs: number;
  /** Optional tagline override. Defaults to the brand tagline. */
  tagline?: string;
}

export interface SocialCardOptions {
  /** OG-standard canvas size; width:height must stay 1200:630. */
  width?: number;
  height?: number;
  /** `dark` or `light`. Defaults to `dark` — reads best on most feeds. */
  theme?: "dark" | "light";
}

/** Renders the full 1200×630 social card as an SVG string.
 *  Deterministic: same input → byte-identical output. */
export function renderSocialCard(input: SocialCardInput, opts: SocialCardOptions = {}): string {
  const width  = opts.width  ?? 1200;
  const height = opts.height ?? 630;
  const theme  = opts.theme  ?? "dark";
  const p = layout(width, height);
  const palette = paletteFor(theme);

  const titleSize = pickTitleSize(input.promptName);
  const statusUp = input.status.toUpperCase();
  const summary = clamp(input.changeSummary ?? "", 120);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeAttr(input.promptName)} — Prompt Tree social card">
<title>${escapeText(input.promptName)} — Prompt Tree</title>
<defs>
  <linearGradient id="sc-bg" x1="0" y1="0" x2="${width}" y2="${height}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${palette.bg0}"/>
    <stop offset="1" stop-color="${palette.bg1}"/>
  </linearGradient>
  <linearGradient id="sc-ink" x1="0" y1="0" x2="${width}" y2="${height}" gradientUnits="userSpaceOnUse">
    <stop offset="0"    stop-color="#155e75"/>
    <stop offset="0.55" stop-color="#0891b2"/>
    <stop offset="1"    stop-color="#22d3ee"/>
  </linearGradient>
  <linearGradient id="sc-title" x1="0" y1="0" x2="${width}" y2="0" gradientUnits="userSpaceOnUse">
    <stop offset="0"    stop-color="${palette.titleA}"/>
    <stop offset="1"    stop-color="${palette.titleB}"/>
  </linearGradient>
</defs>

<!-- Background + subtle top-right mark watermark (≈ 420 px tall, 8 % opacity). -->
<rect width="${width}" height="${height}" fill="url(#sc-bg)"/>
${renderWatermark(width, height, palette)}

<!-- Top row: brand lockup (mark + wordmark) -->
<g transform="translate(${p.padX} ${p.brandY})">
  ${renderMark(48, 48)}
  <text x="64" y="34" font-family="${FONT}" font-size="26" font-weight="700" fill="${palette.fg}" letter-spacing="-0.01em">Prompt Tree</text>
  <text x="${width - p.padX * 2 - 64}" y="34" font-family="${FONT}" font-size="16" font-weight="500" fill="${palette.dim}" text-anchor="end" letter-spacing="0.06em">${escapeText((input.tagline ?? "BRANCH. PROVE. SHIP.").toUpperCase())}</text>
</g>

<!-- Eyebrow: project + version meta -->
<g transform="translate(${p.padX} ${p.eyebrowY})">
  <text font-family="${FONT}" font-size="20" font-weight="600" fill="${palette.accent}" letter-spacing="0.05em">${escapeText(input.projectName.toUpperCase())}</text>
  <text x="${measureProjectWidth(input.projectName)}" font-family="${FONT}" font-size="20" font-weight="500" fill="${palette.dim}"> · v${input.versionNumber} · ${escapeText(statusUp)}${input.contentHashShort ? ` · ${escapeText(input.contentHashShort)}` : ""}</text>
</g>

<!-- Big headline: the prompt name. Auto-sizes on length so long names
     still fit in a single line; very long names soft-truncate. -->
<g transform="translate(${p.padX} ${p.titleY})">
  <text font-family="${FONT}" font-size="${titleSize}" font-weight="800" fill="url(#sc-title)" letter-spacing="-0.02em">${escapeText(truncate(input.promptName, 40))}</text>
</g>

<!-- Version title subline (smaller) -->
<g transform="translate(${p.padX} ${p.subY})">
  <text font-family="${FONT}" font-size="28" font-weight="500" fill="${palette.fg}" letter-spacing="-0.01em">${escapeText(truncate(input.versionTitle, 60))}</text>
</g>

${summary ? `
<!-- Optional change-summary line -->
<g transform="translate(${p.padX} ${p.summaryY})">
  <text font-family="${FONT}" font-size="20" font-weight="400" fill="${palette.dim}" font-style="italic">${escapeText(summary)}</text>
</g>` : ""}

<!-- Stats strip along the bottom -->
<g transform="translate(${p.padX} ${p.statsY})">
  ${renderStat(0,   "BRANCHES", String(input.branches), palette)}
  ${renderStat(260, "VERSIONS", String(input.versions), palette)}
  ${renderStat(520, "RUNS",     String(input.runs),     palette)}
  <text x="${width - p.padX * 2}" y="28" font-family="${FONT}" font-size="16" font-weight="500" fill="${palette.dim}" text-anchor="end" letter-spacing="0.08em">PROMPTTREE.COM</text>
</g>
</svg>`;
}

// ---------------------------------------------------------------------------
// Layout helpers — centralising the y-offsets makes vertical rhythm
// explicit and testable. Widths are derived from the OG canvas.
// ---------------------------------------------------------------------------
const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";

interface Layout {
  padX: number; padY: number;
  brandY: number;
  eyebrowY: number;
  titleY: number;
  subY: number;
  summaryY: number;
  statsY: number;
}

function layout(_w: number, h: number): Layout {
  return {
    padX: 72,
    padY: 56,
    brandY:    56,
    eyebrowY:  Math.round(h * 0.32),   // ≈ 202
    titleY:    Math.round(h * 0.44),   // ≈ 277
    subY:      Math.round(h * 0.62),   // ≈ 391
    summaryY:  Math.round(h * 0.73),   // ≈ 460
    statsY:    Math.round(h - 96),     // ≈ 534
  };
}

// Good-enough sizing for a single headline: shorter names render
// bigger. The SVG text isn't flow-wrapped so we pick a pixel size
// from the string length.
export function pickTitleSize(name: string): number {
  const n = (name ?? "").length;
  if (n <= 16) return 108;
  if (n <= 24) return 88;
  if (n <= 32) return 72;
  return 58;
}

// Cheap left-offset for the eyebrow meta text — the real width depends
// on the font renderer, so we use a conservative glyph estimate that
// works across system-ui stacks at 20 px.
function measureProjectWidth(name: string): number {
  const est = (name.length) * 12.8 + 12;
  return Math.round(est);
}

function renderStat(x: number, label: string, value: string, palette: Palette): string {
  return `<g transform="translate(${x} 0)">
    <text y="20"  font-family="${FONT}" font-size="14" font-weight="600" fill="${palette.dim}" letter-spacing="0.1em">${escapeText(label)}</text>
    <text y="60" font-family="${FONT}" font-size="40" font-weight="700" fill="${palette.fg}" letter-spacing="-0.02em">${escapeText(value)}</text>
  </g>`;
}

// Rotated, watermarked mark anchored top-right. Separate from the small
// lockup mark so the watermark stays decorative and the lockup stays
// legible.
function renderWatermark(width: number, height: number, palette: Palette): string {
  const scale = 12.5; // the source mark is 24×24, so scale factor → ≈ 300 px
  const x = width - scale * 24 + 60;
  const y = -80;
  return `<g transform="translate(${x} ${y}) scale(${scale})" opacity="${palette.watermarkOpacity}">
    ${markPaths()}
  </g>`;
}

function renderMark(w: number, h: number): string {
  const scale = w / 24;
  return `<g transform="scale(${scale})">${markPaths()}</g>`;
}

// The literal geometry from webapp/assets/mark.svg, with the ocean-palette
// teal refinement so both the lockup mark and the watermark stay on-brand.
function markPaths(): string {
  return `<g transform="rotate(-8 12 12)" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 6 20 C 6 16, 12 15.2, 12 11.2 C 12 8.0, 15.8 6.8, 17 5.2" stroke="url(#sc-ink)"/>
    <path d="M 12 11.2 C 15.4 12.4, 18.2 13.6, 19.6 15.2" stroke="#67e8f9" stroke-width="1.5" stroke-dasharray="2 2.2" opacity="0.82"/>
    <circle cx="6" cy="20" r="1.7" stroke="url(#sc-ink)" fill="#ffffff"/>
    <circle cx="12" cy="11.2" r="1.35" fill="url(#sc-ink)"/>
    <circle cx="17" cy="5.2" r="2.1" fill="url(#sc-ink)"/>
    <circle cx="17" cy="5.2" r="3.2" stroke="url(#sc-ink)" stroke-width="1.1" opacity="0.35"/>
    <circle cx="19.6" cy="15.2" r="1.3" stroke="#67e8f9" stroke-width="1.3" fill="#ffffff"/>
  </g>`;
}

interface Palette {
  bg0: string; bg1: string;
  fg: string; dim: string; accent: string;
  titleA: string; titleB: string;
  watermarkOpacity: string;
}
function paletteFor(theme: "dark" | "light"): Palette {
  if (theme === "light") {
    return {
      bg0: "#ffffff", bg1: "#f0f9ff",
      fg: "#0f172a", dim: "#475569", accent: "#0e7490",
      titleA: "#155e75", titleB: "#0891b2",
      watermarkOpacity: "0.08",
    };
  }
  return {
    bg0: "#0b1220", bg1: "#0e2a3a",
    fg: "#e2e8f0", dim: "#94a3b8", accent: "#22d3ee",
    titleA: "#67e8f9", titleB: "#a5f3fc",
    watermarkOpacity: "0.12",
  };
}

// ---------------------------------------------------------------------------
// String helpers — escaping is the security boundary. Anything a user
// controls (prompt name, project name, summary) MUST pass through here
// before landing in SVG.
// ---------------------------------------------------------------------------

export function escapeText(s: string): string {
  return String(s ?? "").replace(/[&<>]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;");
}
export function escapeAttr(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function truncate(s: string, max: number): string {
  s = String(s ?? "");
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

export function clamp(s: string, max: number): string {
  return truncate(s, max);
}
