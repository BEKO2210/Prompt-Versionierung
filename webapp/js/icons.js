// Inline SVG icon strings — no dependency. Use icon('name', { size }).
// Stroke-based, current-color, 24x24 viewBox.

const ICONS = {
  tree:    `<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="12" r="2"/><path d="M6 7v10"/><path d="M6 12h10"/>`,
  search:  `<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>`,
  prompt:  `<path d="M4 6h16"/><path d="M4 12h10"/><path d="M4 18h16"/>`,
  dataset: `<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6"/><path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/>`,
  model:   `<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8"/><path d="M8 13h5"/><path d="M8 17h3"/>`,
  rubric:  `<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h7"/><path d="M9 17h5"/>`,
  beaker:  `<path d="M9 3v5L4 20a1 1 0 0 0 .9 1.4h14.2A1 1 0 0 0 20 20L15 8V3"/><path d="M7 14h10"/><path d="M8 3h8"/>`,
  spark:   `<path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/><path d="M6 6l2.5 2.5"/><path d="M15.5 15.5 18 18"/><path d="M6 18l2.5-2.5"/><path d="M15.5 8.5 18 6"/>`,
  fork:    `<circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M6 7v2a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7"/><path d="M12 12v5"/>`,
  crown:   `<path d="M3 18h18"/><path d="M3 18 5 8l5 4 2-6 2 6 5-4 2 10"/>`,
  compare: `<path d="M12 3v18"/><path d="M5 8l-2 2 2 2"/><path d="M19 16l2-2-2-2"/><path d="M3 10h7"/><path d="M14 14h7"/>`,
  plus:    `<path d="M12 5v14"/><path d="M5 12h14"/>`,
  arrow:   `<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>`,
  check:   `<path d="m5 12 5 5 9-10"/>`,
  play:    `<path d="M7 5v14l12-7z"/>`,
  pencil:  `<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>`,
  download:`<path d="M12 4v12"/><path d="m6 12 6 6 6-6"/><path d="M4 21h16"/>`,
  upload:  `<path d="M12 20V8"/><path d="m6 12 6-6 6 6"/><path d="M4 21h16"/>`,
  trash:   `<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="m19 6-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>`,
  cog:     `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9 1.7 1.7 0 0 0 4.3 7.2l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>`,
  reset:   `<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>`,
  back:    `<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>`,
  warn:    `<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>`,
  info:    `<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>`,
  sun:     `<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>`,
  moon:    `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`,
};

export function icon(name, { size = 14, stroke = 1.7 } = {}) {
  const body = ICONS[name];
  if (!body) return "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

// Brand mark — monochrome, inherits currentColor. Use in topbar + any
// context that should pick up the surrounding theme. For the full
// gradient version reference ./assets/mark.svg via <img>.
export function brandMark(size = 22) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
    <g transform="rotate(-8 12 12)" fill="none" stroke="currentColor" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round">
      <path d="M 6 20 C 6 16, 12 15.2, 12 11.2 C 12 8.0, 15.8 6.8, 17 5.2"/>
      <path d="M 12 11.2 C 15.4 12.4, 18.2 13.6, 19.6 15.2"
            stroke-width="1.5" stroke-dasharray="2 2.2" opacity="0.7"/>
      <circle cx="6" cy="20" r="1.7"/>
      <circle cx="12" cy="11.2" r="1.35" fill="currentColor"/>
      <circle cx="17" cy="5.2" r="2.1" fill="currentColor"/>
      <circle cx="17" cy="5.2" r="3.2" stroke-width="1.1" opacity="0.3"/>
      <circle cx="19.6" cy="15.2" r="1.3" stroke-width="1.3" opacity="0.75"/>
    </g>
  </svg>`;
}
