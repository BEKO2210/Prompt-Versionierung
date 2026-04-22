// Tiny hash-router. URL fragments look like:
//   #/                              workspace (project list)
//   #/p/:projectSlug                project dashboard
//   #/p/:projectSlug/prompts        prompt list
//   #/p/:projectSlug/p/:promptSlug                          prompt tree (selected = canonical head)
//   #/p/:projectSlug/p/:promptSlug/v/:versionId             prompt + version selected
//   #/p/:projectSlug/p/:promptSlug/compare?a=&b=
//   #/p/:projectSlug/p/:promptSlug/refine/:versionId
//   #/p/:projectSlug/datasets|models|rubrics|search

const subscribers = new Set();
let currentRoute = null;

const routes = [
  { re: /^\/?$/, name: "workspace" },
  { re: /^\/p\/([^/]+)\/?$/, name: "project" },
  { re: /^\/p\/([^/]+)\/prompts\/?$/, name: "prompts" },
  { re: /^\/p\/([^/]+)\/datasets\/?$/, name: "datasets" },
  { re: /^\/p\/([^/]+)\/models\/?$/, name: "models" },
  { re: /^\/p\/([^/]+)\/rubrics\/?$/, name: "rubrics" },
  { re: /^\/p\/([^/]+)\/search\/?$/, name: "search" },
  { re: /^\/p\/([^/]+)\/p\/([^/]+)\/compare\/?$/, name: "compare", params: ["projectSlug","promptSlug"] },
  { re: /^\/p\/([^/]+)\/p\/([^/]+)\/refine\/([^/]+)\/?$/, name: "refine", params: ["projectSlug","promptSlug","versionId"] },
  { re: /^\/p\/([^/]+)\/p\/([^/]+)\/v\/([^/]+)\/?$/, name: "prompt", params: ["projectSlug","promptSlug","versionId"] },
  { re: /^\/p\/([^/]+)\/p\/([^/]+)\/?$/, name: "prompt", params: ["projectSlug","promptSlug"] },
];

function parse() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [pathPart, queryPart = ""] = raw.split("?");
  const params = new URLSearchParams(queryPart);
  for (const r of routes) {
    const m = pathPart.match(r.re);
    if (m) {
      const path = {};
      // First match: workspace etc — fill known params by route name
      if (r.name === "project" || r.name === "prompts" || r.name === "datasets"
        || r.name === "models" || r.name === "rubrics" || r.name === "search") {
        path.projectSlug = m[1];
      }
      if (r.name === "prompt") {
        path.projectSlug = m[1]; path.promptSlug = m[2]; path.versionId = m[3] || null;
      }
      if (r.name === "compare") { path.projectSlug = m[1]; path.promptSlug = m[2]; }
      if (r.name === "refine")  { path.projectSlug = m[1]; path.promptSlug = m[2]; path.versionId = m[3]; }
      return { name: r.name, path, query: Object.fromEntries(params) };
    }
  }
  return { name: "404", path: {}, query: {} };
}

function emit() {
  currentRoute = parse();
  for (const fn of subscribers) try { fn(currentRoute); } catch (e) { console.error(e); }
}

export function start() {
  window.addEventListener("hashchange", emit);
  emit();
}
export function subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); }
export function route() { return currentRoute || parse(); }
export function navigate(path, query) {
  let h = "#" + (path.startsWith("/") ? path : "/" + path);
  if (query) {
    const q = new URLSearchParams(query).toString();
    if (q) h += "?" + q;
  }
  if (location.hash !== h) location.hash = h;
  else emit();
}
