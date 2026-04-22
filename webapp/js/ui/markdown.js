// Minimal, dependency-free markdown renderer.
// Intentionally narrow: supports the subset that prompt READMEs actually
// need — headings, bold/italic, inline code, links, paragraphs, lists,
// code fences. Escape-first, then re-enable features — so stray < > in
// user input can never escape.

import { escapeHtml } from "./components.js";

// Inline transforms applied AFTER escapeHtml. The escaped string contains
// `&lt;`, `&gt;`, `&quot;`, `&amp;` but no raw < >. Our inline markers
// (`**`, `_`, `` ` ``, `[x](y)`) are therefore unambiguous.
function inline(s) {
  // Links: [label](url) — url is validated as http/https/relative hash
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
    const safe = /^(https?:)?\/\//.test(url) || url.startsWith("#") || url.startsWith("./") || url.startsWith("/")
      ? url
      : "#";
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  // Inline code
  s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  // Bold **x**
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Italic *x*  (single-asterisk, not greedy across lines)
  s = s.replace(/(^|\s)\*([^*\n]+)\*(?=\s|[,.!?;:]|$)/g, "$1<em>$2</em>");
  // Italic _x_
  s = s.replace(/(^|\s)_([^_\n]+)_(?=\s|[,.!?;:]|$)/g, "$1<em>$2</em>");
  return s;
}

export function renderMarkdown(src) {
  if (!src) return "";
  const escaped = escapeHtml(src);
  const lines = escaped.split(/\r?\n/);
  const out = [];
  let i = 0;

  const flushParagraph = (buf) => {
    if (!buf.length) return;
    out.push(`<p>${inline(buf.join(" "))}</p>`);
    buf.length = 0;
  };

  let paragraph = [];
  let listBuf = null; // { type: "ul"|"ol", items: [] }

  const closeList = () => {
    if (!listBuf) return;
    const tag = listBuf.type;
    out.push(`<${tag}>${listBuf.items.map((it) => `<li>${inline(it)}</li>`).join("")}</${tag}>`);
    listBuf = null;
  };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (/^```/.test(line)) {
      flushParagraph(paragraph); closeList();
      const lang = line.slice(3).trim();
      const code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
      i++; // consume closing fence (or go past EOF)
      out.push(`<pre class="codeblock"${lang ? ` data-lang="${lang}"` : ""}>${code.join("\n")}</pre>`);
      continue;
    }

    // Heading
    const hm = line.match(/^(#{1,6})\s+(.*)$/);
    if (hm) {
      flushParagraph(paragraph); closeList();
      const level = hm[1].length;
      out.push(`<h${level}>${inline(hm[2])}</h${level}>`);
      i++; continue;
    }

    // Unordered list
    if (/^[-*+]\s+/.test(line)) {
      flushParagraph(paragraph);
      if (!listBuf || listBuf.type !== "ul") { closeList(); listBuf = { type: "ul", items: [] }; }
      listBuf.items.push(line.replace(/^[-*+]\s+/, ""));
      i++; continue;
    }
    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      flushParagraph(paragraph);
      if (!listBuf || listBuf.type !== "ol") { closeList(); listBuf = { type: "ol", items: [] }; }
      listBuf.items.push(line.replace(/^\d+\.\s+/, ""));
      i++; continue;
    }

    // Blank line — paragraph/list break
    if (/^\s*$/.test(line)) {
      flushParagraph(paragraph); closeList();
      i++; continue;
    }

    // Part of a paragraph
    closeList();
    paragraph.push(line);
    i++;
  }
  flushParagraph(paragraph); closeList();

  return `<div class="markdown">${out.join("\n")}</div>`;
}
