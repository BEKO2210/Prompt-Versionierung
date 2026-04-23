// Social card generator (E3). Mirror of `src/domain/socialCard.ts` plus
// the browser-side PNG conversion (uses an in-page <canvas>, no extra
// runtime dep). The SVG string is the durable artifact; PNG is a
// convenience render for platforms that reject inline SVG uploads.

const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";

// ---------------------------------------------------------------------------
// Pure SVG rendering — identical shape to the TS domain module.
// ---------------------------------------------------------------------------
export function renderSocialCard(input, opts = {}) {
  const width  = opts.width  ?? 1200;
  const height = opts.height ?? 630;
  const theme  = opts.theme  ?? "dark";
  const p = layout(width, height);
  const palette = paletteFor(theme);

  const titleSize = pickTitleSize(input.promptName);
  const statusUp  = (input.status ?? "").toUpperCase();
  const summary   = clamp(input.changeSummary ?? "", 120);

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

<rect width="${width}" height="${height}" fill="url(#sc-bg)"/>
${renderWatermark(width, height, palette)}

<g transform="translate(${p.padX} ${p.brandY})">
  ${renderMark(48, 48)}
  <text x="64" y="34" font-family="${FONT}" font-size="26" font-weight="700" fill="${palette.fg}" letter-spacing="-0.01em">Prompt Tree</text>
  <text x="${width - p.padX * 2 - 64}" y="34" font-family="${FONT}" font-size="16" font-weight="500" fill="${palette.dim}" text-anchor="end" letter-spacing="0.06em">${escapeText((input.tagline ?? "BRANCH. PROVE. SHIP.").toUpperCase())}</text>
</g>

<g transform="translate(${p.padX} ${p.eyebrowY})">
  <text font-family="${FONT}" font-size="20" font-weight="600" fill="${palette.accent}" letter-spacing="0.05em">${escapeText((input.projectName ?? "").toUpperCase())}</text>
  <text x="${measureProjectWidth(input.projectName ?? "")}" font-family="${FONT}" font-size="20" font-weight="500" fill="${palette.dim}"> · v${input.versionNumber} · ${escapeText(statusUp)}${input.contentHashShort ? ` · ${escapeText(input.contentHashShort)}` : ""}</text>
</g>

<g transform="translate(${p.padX} ${p.titleY})">
  <text font-family="${FONT}" font-size="${titleSize}" font-weight="800" fill="url(#sc-title)" letter-spacing="-0.02em">${escapeText(truncate(input.promptName, 40))}</text>
</g>

<g transform="translate(${p.padX} ${p.subY})">
  <text font-family="${FONT}" font-size="28" font-weight="500" fill="${palette.fg}" letter-spacing="-0.01em">${escapeText(truncate(input.versionTitle, 60))}</text>
</g>

${summary ? `
<g transform="translate(${p.padX} ${p.summaryY})">
  <text font-family="${FONT}" font-size="20" font-weight="400" fill="${palette.dim}" font-style="italic">${escapeText(summary)}</text>
</g>` : ""}

<g transform="translate(${p.padX} ${p.statsY})">
  ${renderStat(0,   "BRANCHES", String(input.branches ?? 0), palette)}
  ${renderStat(260, "VERSIONS", String(input.versions ?? 0), palette)}
  ${renderStat(520, "RUNS",     String(input.runs ?? 0),     palette)}
  <text x="${width - p.padX * 2}" y="28" font-family="${FONT}" font-size="16" font-weight="500" fill="${palette.dim}" text-anchor="end" letter-spacing="0.08em">PROMPTTREE.COM</text>
</g>
</svg>`;
}

function layout(_w, h) {
  return {
    padX: 72, padY: 56,
    brandY: 56,
    eyebrowY: Math.round(h * 0.32),
    titleY:   Math.round(h * 0.44),
    subY:     Math.round(h * 0.62),
    summaryY: Math.round(h * 0.73),
    statsY:   Math.round(h - 96),
  };
}

export function pickTitleSize(name) {
  const n = (name ?? "").length;
  if (n <= 16) return 108;
  if (n <= 24) return 88;
  if (n <= 32) return 72;
  return 58;
}

function measureProjectWidth(name) {
  return Math.round((name || "").length * 12.8 + 12);
}

function renderStat(x, label, value, palette) {
  return `<g transform="translate(${x} 0)">
    <text y="20"  font-family="${FONT}" font-size="14" font-weight="600" fill="${palette.dim}" letter-spacing="0.1em">${escapeText(label)}</text>
    <text y="60" font-family="${FONT}" font-size="40" font-weight="700" fill="${palette.fg}" letter-spacing="-0.02em">${escapeText(value)}</text>
  </g>`;
}

function renderWatermark(width, _height, palette) {
  const scale = 12.5;
  const x = width - scale * 24 + 60;
  const y = -80;
  return `<g transform="translate(${x} ${y}) scale(${scale})" opacity="${palette.watermarkOpacity}">
    ${markPaths()}
  </g>`;
}

function renderMark(w, _h) {
  const scale = w / 24;
  return `<g transform="scale(${scale})">${markPaths()}</g>`;
}

function markPaths() {
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

function paletteFor(theme) {
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

export function escapeText(s) {
  return String(s ?? "").replace(/[&<>]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;");
}
export function escapeAttr(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export function truncate(s, max) {
  s = String(s ?? "");
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}
export function clamp(s, max) { return truncate(s, max); }

// ---------------------------------------------------------------------------
// Consumer helpers — build an `input` from live workspace objects, and
// rasterise the SVG to PNG in-browser.
// ---------------------------------------------------------------------------

export function cardInputFromWorkspace({ project, prompt, version }) {
  const runs = (prompt.runs || []).filter((r) => r.versionId === version.id).length;
  return {
    projectName: project.name,
    promptName: prompt.name,
    versionTitle: version.title,
    versionNumber: version.number,
    status: version.status || "draft",
    contentHashShort: version.contentHash ? version.contentHash.slice(0, 7) : undefined,
    changeSummary: version.changeSummary || prompt.purpose || prompt.description || "",
    branches: (prompt.branches || []).length,
    versions: (prompt.versions || []).length,
    runs,
  };
}

/** Data-URL of the SVG — ready to drop into `<img src=...>` or `<a href=...>`.
 *  Plain `encodeURIComponent` keeps the SVG byte-honest so
 *  `decodeURIComponent(dataUrl.split(",")[1])` reproduces the source
 *  string exactly (important for round-trip tests and for Download-SVG
 *  to match what the preview shows). */
export function svgToDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Rasterise an SVG string to a PNG Blob at the given pixel size.
 *  Uses an <img> + <canvas>; returns a Promise<Blob>. OffscreenCanvas
 *  would be nicer but is not universally available yet. */
export function svgToPng(svg, { width = 1200, height = 630 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas 2D context unavailable");
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error("toBlob returned null"));
          resolve(blob);
        }, "image/png");
      } catch (err) { reject(err); }
    };
    img.onerror = () => reject(new Error("SVG failed to load for rasterisation"));
    img.src = svgToDataUrl(svg);
  });
}

/** Downloads helper — kept alongside the renderer so consumers don't
 *  have to reach for a DOM trick to save a card. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  // Give the browser a tick to start the download before we revoke.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function fileNameForCard({ projectName, promptName, versionNumber }) {
  const slug = (s) => String(s || "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return `prompttree-social-${slug(projectName)}-${slug(promptName)}-v${versionNumber}`;
}
