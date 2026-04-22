// Tiny SVG line-chart for score trends.
//
// Why hand-rolled instead of vendoring Chart.js / μPlot?
//   - we have ONE chart in the whole app
//   - it's a multi-line, points-with-tooltips chart with no animation
//   - the data is tiny (≤ dozens of points)
//   - 100 KB of charting library would be ~5x the size of all our other JS
//
// API:
//   lineChart({
//     width, height,
//     xAxis: { label, ticks: [{ x, label }] },
//     yAxis: { label, min, max, format },
//     series: [
//       { name, color, points: [{ x, y, label, href? }] }
//     ],
//     emptyHint?: string,
//   }) → HTML string
//
// The chart escapes its own values; callers pass plain text labels.

import { escapeHtml } from "./components.js";

export function lineChart({
  width = 720, height = 220,
  xAxis = { label: "", ticks: [] },
  yAxis = { label: "", min: 0, max: 1, format: (v) => v.toFixed(2) },
  series = [],
  emptyHint = "No data yet.",
}) {
  // Pad to leave room for the axes.
  const padL = 40, padR = 16, padT = 16, padB = 28;
  const w = Math.max(160, width  - padL - padR);
  const h = Math.max(100, height - padT - padB);

  const allPoints = series.flatMap((s) => s.points || []);
  if (!allPoints.length) {
    return `<div class="chart-empty" style="height:${height}px">${escapeHtml(emptyHint)}</div>`;
  }

  // X domain: integer span across observed x-values.
  let xMin = Math.min(...allPoints.map((p) => p.x));
  let xMax = Math.max(...allPoints.map((p) => p.x));
  if (xMin === xMax) { xMin -= 0.5; xMax += 0.5; }
  const xRange = xMax - xMin;

  // Y domain: pinned to the configured range (default 0..1 for scores).
  const yMin = yAxis.min ?? 0;
  const yMax = yAxis.max ?? 1;
  const yRange = (yMax - yMin) || 1;

  const xPx = (x) => padL + ((x - xMin) / xRange) * w;
  const yPx = (y) => padT + (1 - (y - yMin) / yRange) * h;

  // Y gridlines at 0%, 25%, 50%, 75%, 100% (or whatever min/max).
  const yTicks = 5;
  const ySteps = Array.from({ length: yTicks }, (_, i) =>
    yMin + (i / (yTicks - 1)) * yRange);

  const grid = ySteps.map((v) => {
    const y = yPx(v);
    return `<line x1="${padL}" x2="${padL + w}" y1="${y}" y2="${y}" class="chart-grid" />
            <text x="${padL - 6}" y="${y + 3}" text-anchor="end" class="chart-axis">${escapeHtml(yAxis.format(v))}</text>`;
  }).join("");

  const xTicks = (xAxis.ticks || []).map((t) => {
    const x = xPx(t.x);
    return `<line x1="${x}" x2="${x}" y1="${padT + h}" y2="${padT + h + 4}" class="chart-grid" />
            <text x="${x}" y="${padT + h + 16}" text-anchor="middle" class="chart-axis">${escapeHtml(t.label)}</text>`;
  }).join("");

  const lines = series.map((s, i) => {
    if (!s.points?.length) return "";
    const sorted = s.points.slice().sort((a, b) => a.x - b.x);
    const d = sorted.map((p, idx) =>
      `${idx === 0 ? "M" : "L"} ${xPx(p.x).toFixed(1)} ${yPx(p.y).toFixed(1)}`
    ).join(" ");
    const stroke = s.color || "#6366f1";
    const dots = sorted.map((p) =>
      `<circle cx="${xPx(p.x).toFixed(1)}" cy="${yPx(p.y).toFixed(1)}" r="4"
               fill="${stroke}" stroke="white" stroke-width="1.5"
               class="chart-dot" data-tip="${escapeHtml(p.label || "")}"
               ${p.href ? `data-href="${escapeHtml(p.href)}"` : ""} />`
    ).join("");
    return `
      <g class="chart-series" data-name="${escapeHtml(s.name)}">
        <path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.8" />
        ${dots}
      </g>`;
  }).join("");

  // Legend below the plot. We render it inline so the chart caller doesn't
  // have to.
  const legend = series.length > 1
    ? `<div class="chart-legend">
        ${series.map((s) =>
          `<span class="chart-legend-item"><span class="dot" style="background:${escapeHtml(s.color)}"></span>${escapeHtml(s.name)}</span>`
        ).join("")}
       </div>`
    : "";

  return `
    <div class="chart" style="max-width:${width}px">
      <svg viewBox="0 0 ${width} ${height}" class="chart-svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHtml(yAxis.label || "trend")}">
        ${grid}
        ${xTicks}
        ${lines}
      </svg>
      <div class="chart-tooltip" data-chart-tooltip hidden></div>
      ${legend}
    </div>`;
}

// Wire hover tooltips for any chart inside `root`. Idempotent — safe to
// call after every render.
export function bindChartTooltips(root) {
  root.querySelectorAll(".chart").forEach((chart) => {
    const tip = chart.querySelector("[data-chart-tooltip]");
    const dots = chart.querySelectorAll(".chart-dot");
    dots.forEach((dot) => {
      dot.addEventListener("mouseenter", () => {
        const label = dot.getAttribute("data-tip");
        if (!label || !tip) return;
        tip.textContent = label;
        // Use the rendered bounding box so the tooltip tracks the dot even
        // when the SVG is scaled down (mobile) or up (wide viewports).
        const chartRect = chart.getBoundingClientRect();
        const dotRect = dot.getBoundingClientRect();
        tip.style.left = `${dotRect.left - chartRect.left + dotRect.width + 4}px`;
        tip.style.top  = `${dotRect.top  - chartRect.top  - 22}px`;
        tip.hidden = false;
      });
      dot.addEventListener("mouseleave", () => {
        if (tip) tip.hidden = true;
      });
      dot.addEventListener("click", () => {
        const href = dot.getAttribute("data-href");
        if (href) location.hash = href.startsWith("#") ? href : "#" + href;
      });
    });
  });
}
