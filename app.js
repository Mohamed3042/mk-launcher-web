// MK Launcher front end: one module, no build step.
import { GLYPHS } from "./glyphs.js";
import * as C from "./charts.js";
import { createReels } from "./reels.js";
import { createSettings } from "./settings.js";
import * as source from "./source.js";

const BACKUP = source.BACKUP; // the GitHub Pages copy: reads the PC's last snapshot, greys out what needs the PC

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const g = (name, cls = "") => `<svg class="g ${cls}" viewBox="0 0 24 24" aria-hidden="true">${GLYPHS[name] || GLYPHS.grid}</svg>`;
const SERIES = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s7)", "var(--s8)", "var(--s6)"];
const ROUTES = ["home", "apps", "reels", "changes", "github", "pc", "settings", "connect"];
const TITLES = { home: "Home", apps: "Apps", reels: "Reels", changes: "Changes", github: "GitHub", pc: "PC", settings: "Settings", connect: "Connect" };
const NAV = [ // desktop sidebar
  ["home", "Home", "home"], ["apps", "Apps", "apps"], ["reels", "Reels", "reels"], ["changes", "Changes", "changes"],
  ["github", "GitHub", "github"], ["pc", "PC", "pc"], ["settings", "Settings", "settings"],
];
const TABS = [ // phone tab bar: five at most; GitHub and PC sit in "More places" on Home
  ["home", "Home", "home"], ["reels", "Reels", "reels"], ["apps", "Apps", "apps"], ["changes", "Changes", "changes"],
  ["settings", "Settings", "settings"],
];

const S = {
  apps: [], groups: [], byId: {}, canStart: {}, pins: [], recents: [], client: { pc: false },
  status: {}, online: true, loaded: false,
  github: null, shots: { latest: {}, changes: [], state: {} }, overview: {}, pc: null,
  route: "home", q: "", sel: 0,
  appsGroup: "all", appsView: localGet("appsView", "grid"), ghFilter: "public", ghSort: "recent",
  changesView: "timeline", changesFilter: "all", files: null, editPins: false, statsRepo: null,
  after: [],
};

// ---------- utilities ----------
function localGet(k, d) { try { const v = localStorage.getItem("mkl." + k); return v == null ? d : JSON.parse(v); } catch { return d; } }
function localSet(k, v) { try { localStorage.setItem("mkl." + k, JSON.stringify(v)); } catch { /* private mode */ } }

async function api(path, opts = {}) {
  if (BACKUP) return source.backupApi(path, opts);
  const headers = { "X-MKL": "1", ...(opts.body ? { "Content-Type": "application/json" } : {}) };
  const r = await fetch(path, { ...opts, headers });
  let data = null;
  try { data = await r.json(); } catch { /* empty */ }
  if (!r.ok) throw new Error((data && data.error) || `${r.status} ${r.statusText}`);
  return data;
}
const post = (path, body = {}) => api(path, { method: "POST", body: JSON.stringify(body) });

function ago(t) {
  if (!t) return "never";
  const ms = typeof t === "number" ? (t < 2e10 ? t * 1000 : t) : Date.parse(t);
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
function dayKey(ms) { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function dayLabel(key) {
  const today = dayKey(Date.now()), yest = dayKey(Date.now() - 86400000);
  if (key === today) return "Today";
  if (key === yest) return "Yesterday";
  return new Date(key + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
}
function hashColor(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return `hsl(${h % 360} 45% 42%)`;
}
function bytes(n) {
  if (n == null) return "";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)} ${u[i]}`;
}
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), 2600);
}
async function copy(text, done = "Copied") {
  try { await navigator.clipboard.writeText(text); toast(done); }
  catch { prompt("Copy this", text); }
}

// ---------- status helpers ----------
function stateOf(app) {
  if (!app || app.type === "page") return "none";
  return S.status[app.id]?.state || "unknown";
}
function statusWord(app) {
  const st = stateOf(app);
  const site = app.type === "site";
  if (BACKUP) return { up: site ? "Was live" : "Was running", down: site ? "Was unreachable" : "Was stopped", starting: "Was starting", unknown: "Not checked", none: "" }[st];
  return { up: site ? "Live" : "Running", down: site ? "Unreachable" : "Stopped", starting: "Starting…", unknown: "Checking…", none: "" }[st];
}
// In the backup, anything that runs on the PC is shaded grey; a tap says why instead of failing.
const pcOnly = (app) => BACKUP && source.needsPc(app);
function greyBtn(why, inner, cls = "btn sm", label = "") {
  return `<button class="${cls} needs-pc" type="button" data-act="needs-pc" data-why="${why}" aria-disabled="true"${label ? ` aria-label="${esc(label)}"` : ""} title="${esc(source.REASON[why] || source.REASON.default)}">${inner}</button>`;
}
function openLink(app, cls, inner, label = "") {
  if (pcOnly(app)) return greyBtn("open", inner, cls, label);
  return `<a class="${cls}" href="${esc(app.url)}" target="_blank" rel="noopener" data-open="${esc(app.id)}"${label ? ` aria-label="${esc(label)}"` : ""}>${inner}</a>`;
}
function statusEl(app, always = false) {
  const st = stateOf(app);
  if (st === "none" || (!always && (st === "up" || st === "unknown"))) return st === "up" ? `<span class="sr">${statusWord(app)}</span>` : "";
  return `<span class="st ${st}"><i></i>${esc(statusWord(app))}</span>`;
}
function counts() {
  let up = 0, down = 0, starting = 0;
  for (const a of S.apps) {
    if (a.type !== "app") continue;
    const st = stateOf(a);
    if (st === "up") up++; else if (st === "down") down++; else if (st === "starting") starting++;
  }
  return { up, down, starting };
}
function appIcon(app, size = "") {
  const st = stateOf(app);
  const badge = st === "none" || st === "unknown" ? "" : `<span class="badge ${st}"></span>`;
  return `<span class="aicon ${size}" style="--c:${esc(app.color || "#495057")}">${g(app.icon || "grid")}${badge}</span>`;
}
function letterIcon(name, size = "") {
  const letter = (name.match(/[A-Za-z0-9؀-ۿ]/) || ["•"])[0].toUpperCase();
  return `<span class="aicon ${size}" style="--c:${hashColor(name)}"><span class="letter">${esc(letter)}</span></span>`;
}
function repoFor(app) {
  if (!app?.repo || !S.github?.repos) return null;
  const want = app.repo.replace(/\/$/, "").toLowerCase();
  return S.github.repos.find((r) => r.url.toLowerCase() === want) || null;
}

// ---------- building blocks ----------
function tile(app) {
  if (pcOnly(app)) {
    return `<button class="tile needs-pc" type="button" data-act="needs-pc" data-why="open" data-id="${esc(app.id)}" aria-disabled="true">
    ${appIcon(app)}<span class="name" dir="auto">${esc(app.name)}</span>${statusEl(app)}</button>`;
  }
  return `<a class="tile" href="${esc(app.url)}" target="_blank" rel="noopener" data-open="${esc(app.id)}" data-id="${esc(app.id)}">
    ${appIcon(app)}<span class="name" dir="auto">${esc(app.name)}</span>${statusEl(app)}</a>`;
}
function startButton(app, small = true) {
  if (BACKUP) return stateOf(app) === "down" && S.canStart[app.id] && pcOnly(app) ? greyBtn("start", `${g("play")}Start`, `btn primary ${small ? "sm" : ""}`) : "";
  if (stateOf(app) === "starting") return `<button class="btn ${small ? "sm" : ""} loading" disabled>Starting</button>`;
  if (stateOf(app) !== "down" || !S.canStart[app.id]) return "";
  return `<button class="btn primary ${small ? "sm" : ""}" data-act="start" data-id="${esc(app.id)}">${g("play")}Start</button>`;
}
function appRow(app, { showGroup = true } = {}) {
  const st = S.status[app.id];
  const group = S.groups.find((x) => x.id === app.group)?.name || "";
  const sub = [showGroup ? group : null, app.about].filter(Boolean).join(" · ");
  const action = startButton(app) || openLink(app, "icon-btn", g("external"), `Open ${app.name}`);
  return `<div class="row" data-id="${esc(app.id)}" data-detail="${esc(app.id)}" role="button" tabindex="0">
    ${appIcon(app, "sm")}
    <div class="main"><div class="name" dir="auto">${esc(app.name)}${app.name_ar ? ` <span class="ar" dir="rtl" lang="ar">${esc(app.name_ar)}</span>` : ""}</div>
    <div class="sub">${esc(sub)}</div></div>
    <div class="end">${app.type !== "page" ? statusEl(app, true) : `<span class="st">${g("sparkles")}Claude</span>`}
    <span class="ms num desk-only">${st?.ms != null && st.state === "up" ? `${st.ms} ms` : ""}</span>${action}</div></div>`;
}
function section(title, meta, body, extra = "") {
  return `<section class="section"><div class="section-head"><h2>${esc(title)}</h2>${meta ? `<span class="meta">${esc(meta)}</span>` : ""}<span class="grow"></span>${extra}</div>${body}</section>`;
}

// ---------- views ----------
const reels = createReels({ $, $$, esc, g, api, post, toast, copy, openPanel, closePanel });
const settings = createSettings({ $, esc, g, api, post, toast, ago, theme: () => localGet("theme", "auto"),
  setTheme: (v) => { localSet("theme", v); applyTheme(); } }, reels);
const MORE = [["#/github", "GitHub", "github"], ["#/pc", "PC", "pc"], ["news/", "MK News", "news"]];
const views = {
  home() {
    const pins = S.pins.map((id) => S.byId[id]).filter(Boolean);
    const recentApps = S.recents.map((r) => S.byId[r.id]).filter(Boolean);
    const cont = recentApps[0] || pins[0];
    const down = S.apps.filter((a) => a.type === "app" && ["down", "starting"].includes(stateOf(a)));
    if (cont?.color) document.documentElement.style.setProperty("--glow", cont.color);
    let left = `<h1 class="page-title">Home</h1>`, right = "";
    if (cont) {
      left += `<section class="section"><div class="continue" style="--c:${esc(cont.color)}">
        ${appIcon(cont, "lg")}
        <div class="what"><div class="name" dir="auto">${esc(cont.name)}</div>
        <div class="state">${statusEl(cont, true)}${recentApps[0] ? `<span class="opened">opened ${esc(ago(S.recents[0].at))}</span>` : ""}</div></div>
        ${openLink(cont, "btn primary", "Open")}</div></section>`;
    }
    const pinTiles = pins.map((a) => S.editPins
      ? `<div class="tile" data-act="unpin" data-id="${esc(a.id)}" role="button" tabindex="0">${appIcon(a)}<span class="name">${esc(a.name)}</span><span class="st down"><i></i>Remove</span></div>`
      : tile(a)).join("");
    left += section("Pinned", "", `<div class="tiles" data-grid="pins">${pinTiles || `<p class="sub">Nothing pinned. Open an app's details and tap Pin.</p>`}${S.editPins ? `<div class="tile" data-act="add-pin" role="button" tabindex="0"><span class="aicon" style="--c:var(--raised);color:var(--ink-2)">${g("plus")}</span><span class="name">Add</span></div>` : ""}</div>`,
      BACKUP ? greyBtn("pins", "Edit", "link-btn") : `<button class="link-btn" data-act="edit-pins">${S.editPins ? "Done" : "Edit"}</button>`);
    if (down.length) {
      left += section(BACKUP ? "Stopped when last seen" : "Not running", `${down.length}`, `<div class="rows">${down.map((a) => appRow(a)).join("")}</div>`);
    }
    left += `<section class="section phone-only more-places"><div class="section-head"><h2>More places</h2></div>
      <nav class="places" aria-label="More places">${MORE.map(([href, label, icon]) => `<a class="place" href="${href}">${g(icon)}<span>${label}</span></a>`).join("")}</nav></section>`;
    if (recentApps.length > 1) {
      right += section("Recent", "", `<div class="rows">${recentApps.slice(1, 6).map((a) => appRow(a)).join("")}</div>`);
    }
    right += `<div class="changes-panel">${homeChanges()}</div>`;
    return `${offlineBar()}<div class="home-cols"><div>${left}</div><div>${right}</div></div>`;
  },

  apps() {
    const groups = S.groups.filter((gr) => S.apps.some((a) => a.group === gr.id));
    const chips = [`<button class="chip" data-act="apps-group" data-v="all" aria-pressed="${S.appsGroup === "all"}">All<span class="count">${S.apps.length}</span></button>`]
      .concat(groups.map((gr) => `<button class="chip" data-act="apps-group" data-v="${esc(gr.id)}" aria-pressed="${S.appsGroup === gr.id}">${esc(gr.name)}<span class="count">${S.apps.filter((a) => a.group === gr.id).length}</span></button>`)).join("");
    const viewSeg = `<div class="seg" role="group" aria-label="View"><button data-act="apps-view" data-v="grid" aria-pressed="${S.appsView === "grid"}">${g("apps")}Grid</button><button data-act="apps-view" data-v="list" aria-pressed="${S.appsView === "list"}">${g("list")}List</button></div>`;
    let body = "";
    for (const gr of groups) {
      if (S.appsGroup !== "all" && S.appsGroup !== gr.id) continue;
      const items = S.apps.filter((a) => a.group === gr.id);
      const inner = S.appsView === "grid" ? `<div class="group-grid">${items.map(tile).join("")}</div>`
        : `<div class="rows">${items.map((a) => appRow(a, { showGroup: false })).join("")}</div>`;
      body += section(gr.name, `${items.length}`, inner);
    }
    return `${offlineBar()}<div class="section"><div class="section-head"><div class="chips">${chips}</div><span class="grow"></span>${viewSeg}</div></div>${body}`;
  },

  changes() {
    const seg = `<div class="seg" role="group" aria-label="Changes view">
      <button data-act="changes-view" data-v="timeline" aria-pressed="${S.changesView === "timeline"}">${g("history")}Timeline</button>
      <button data-act="changes-view" data-v="stats" aria-pressed="${S.changesView === "stats"}">${g("chart")}Stats</button></div>`;
    const head = `<div class="section"><div class="section-head">${seg}<span class="grow"></span>
      ${BACKUP ? greyBtn("snap", `${g("camera")}Snap all apps`, "btn sm ghost") : `<button class="btn sm ghost" data-act="snap-all">${g("camera")}Snap all apps</button>`}</div></div>`;
    return offlineBar() + head + (S.changesView === "stats" ? changesStats() : changesTimeline());
  },

  github() {
    const gh = S.github;
    if (!gh) return `<div class="section"><div class="skeleton" style="height:240px"></div></div>`;
    const repos = gh.repos || [];
    const pub = repos.filter((r) => !r.private), priv = repos.filter((r) => r.private), live = repos.filter((r) => r.pages);
    const total30 = repos.reduce((a, r) => a + (r.commits_30d || 0), 0);
    const filters = [["public", "Public", pub.length], ["live", "Live sites", live.length], ["private", "Private", priv.length], ["all", "All", repos.length]];
    const chips = filters.map(([v, l, n]) => `<button class="chip" data-act="gh-filter" data-v="${v}" aria-pressed="${S.ghFilter === v}">${l}<span class="count">${n}</span></button>`).join("");
    const sortSeg = `<div class="seg" role="group" aria-label="Sort"><button data-act="gh-sort" data-v="recent" aria-pressed="${S.ghSort === "recent"}">Recent</button><button data-act="gh-sort" data-v="active" aria-pressed="${S.ghSort === "active"}">Busiest</button><button data-act="gh-sort" data-v="name" aria-pressed="${S.ghSort === "name"}">A–Z</button></div>`;
    let list = { public: pub, private: priv, live, all: repos }[S.ghFilter] || pub;
    list = [...list].filter((r) => !r.archived || S.ghFilter === "all");
    if (S.ghSort === "active") list.sort((a, b) => (b.commits_30d || 0) - (a.commits_30d || 0));
    else if (S.ghSort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    const note = gh.error ? `<div class="note" style="margin-top:12px">${g("alert")}<div>${esc(gh.error)}</div></div>` : "";
    const summary = `<span class="meta">${repos.length} repos · ${live.length} live sites${gh.source === "gh" || gh.source === "cache" ? ` · ${total30.toLocaleString()} commits in 30 days` : ""} · updated ${esc(ago(gh.fetched))}</span>`;
    return `${offlineBar()}<div class="section"><div class="section-head">${summary}<span class="grow"></span>
      ${BACKUP ? greyBtn("refresh", `${g("refresh")}Refresh`, "btn sm ghost") : `<button class="btn sm ghost" data-act="gh-refresh">${g("refresh")}Refresh</button>`}</div>
      <div class="section-head"><div class="chips">${chips}</div><span class="grow"></span>${sortSeg}</div>${note}</div>
      <div class="rows">${list.map(repoRow).join("") || `<div class="row"><div class="main sub">No repos here.</div></div>`}</div>`;
  },

  reels() {
    S.after.push(() => reels.mount());
    return reels.render();
  },

  settings() {
    S.after.push(() => settings.mount());
    return settings.render();
  },

  pc() {
    if (S.files) return filesView();
    const p = S.pc;
    const appsOnPc = S.apps.filter((a) => a.type === "app" && onPc(a));
    const c = counts();
    let out = offlineBar();
    const meta = BACKUP ? `last seen: ${c.up} running · ${c.down} stopped` : S.online ? `${c.up} running · ${c.down} stopped` : "offline";
    out += `<div class="section"><div class="section-head"><h2>Your PC</h2><span class="meta">${meta}${S.client.pc ? " · you are on it" : ""}</span><span class="grow"></span>
      ${BACKUP ? greyBtn("snap", `${g("camera")}Snap all`, "btn sm ghost") : `<button class="btn sm ghost" data-act="snap-all">${g("camera")}Snap all</button>`}</div>
      <div class="rows">${appsOnPc.map(serverRow).join("")}</div></div>`;
    out += `<section class="section"><div class="section-head"><h2>Uptime, last 24 hours</h2><span class="meta">${BACKUP ? "as last seen · " : ""}worst first</span></div><div class="chart-card"><div id="uptime-chart"></div></div></section>`;
    S.after.push(() => {
      const el = $("#uptime-chart");
      if (!el) return;
      const data = appsOnPc.map((a) => ({ a, v: S.overview[a.id]?.d1 })).filter((x) => x.v != null)
        .sort((x, y) => x.v - y.v).slice(0, 14)
        .map(({ a, v }) => ({ label: a.name, value: Math.round(v * 1000) / 10, color: v >= 0.99 ? "var(--up)" : v > 0.5 ? "var(--starting)" : "var(--down)", tip: `${a.name}\nUp|${(v * 100).toFixed(1)}%\nAvg response|${S.overview[a.id]?.ms ?? "–"} ms` }));
      if (!data.length) { el.innerHTML = `<p class="sub">Uptime appears after the launcher has been watching for a little while.</p>`; return; }
      C.hbars(el, { data, fmt: (v) => `${v}%` });
    });
    if (BACKUP) return out + section("Programs and folders", "", `<button class="note needs-pc wide" type="button" data-act="needs-pc" data-why="pc" aria-disabled="true">${g("monitor")}<div><b>On your PC.</b> Programs and folders open from your PC, so they come back when it does.</div></button>`);
    if (!p) return out + `<div class="section"><div class="skeleton" style="height:120px"></div></div>`;
    const where = [...new Set(p.shortcuts.map((s) => s.where))];
    out += section("Programs", `${p.shortcuts.length}${S.client.pc ? "" : " · open on the PC"}`,
      p.shortcuts.length ? `<div class="tiles">${p.shortcuts.map((s) => `<button class="tile" style="border:0;background:none" data-act="pc-open" data-id="${esc(s.id)}" title="${esc(s.where)}">${letterIcon(s.name)}<span class="name" dir="auto">${esc(s.name)}</span></button>`).join("")}</div>`
        : `<div class="note">${g("monitor")}<div>No shortcuts found on the Desktop or in the Start menu${where.length ? "" : " yet"}.</div></div>`);
    out += section("Folders", "read-only", p.roots.length ? `<div class="rows">${p.roots.map((r) => `<div class="row" data-act="files" data-root="${esc(r.id)}" role="button" tabindex="0"><span class="ficon">${g("folder")}</span><div class="main"><div class="name">${esc(r.name)}</div></div>${g("chevron-right")}</div>`).join("")}</div>` : `<div class="note">${g("folder")}<div>No folders shared. Add them to <b>settings.json</b> on the PC.</div></div>`);
    return out;
  },
};

function onPc(app) {
  try { return source.needsPc(app) && (!S.publicOrigin || app.type === "app" || new URL(app.url).hostname === new URL(S.publicOrigin).hostname); }
  catch { return false; }
}
function offlineBar() {
  if (BACKUP) {
    if (!S.snapAt) return "";
    if (S.pcBack) {
      return `<div class="backup-bar back" role="status">${g("monitor")}<span><b>Your PC is back.</b> Everything works again in the live launcher.</span>
        <a class="btn sm primary" href="${esc(S.liveOrigin)}/">Open the live launcher</a></div>`;
    }
    const old = Date.now() - S.snapAt * 1000 > 3 * 3600e3;
    return `<div class="backup-bar${old ? " old" : ""}" role="status">${g("offline")}<span>${esc(source.bannerText(S.snapAt))}</span>
      ${S.liveOrigin ? `<a class="link-btn" href="${esc(S.liveOrigin)}/">Try the live launcher</a>` : ""}</div>`;
  }
  if (S.online) return "";
  const backup = S.backupUrl || source.BACKUP_URL;
  return `<div class="offline-bar">${g("offline")}<span>Can't reach your PC. Showing what was true ${esc(ago(localGet("savedAt", 0)))}.</span>
    <a class="link-btn" href="${esc(backup)}" target="_blank" rel="noopener">Open the backup</a></div>`;
}

// Plain-English change lines: the server adds plain, visible and by to every recent commit.
const ACRONYMS = { mk: "MK", os: "OS", ai: "AI", ui: "UI", pc: "PC", api: "API", ess: "ESS" };
function humanRepo(name) {
  return String(name).split(/[-_\s]+/).filter(Boolean).map((w) => ACRONYMS[w.toLowerCase()] || w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
function repoApp(repoName) {
  const want = String(repoName).toLowerCase();
  return S.apps.find((a) => (a.repo || "").replace(/\/+$/, "").split("/").pop().toLowerCase() === want) || null;
}
function lineText(c) { return c.plain || c.msg || ""; }
function updateLines(sinceMs) {
  return (S.github?.repos || []).filter((r) => !/brain$/i.test(r.name))
    .flatMap((r) => (r.recent || []).map((c) => ({ ...c, repo: r.name, at: Date.parse(c.date) })))
    .filter((c) => c.at >= sinceMs).sort((a, b) => b.at - a.at);
}
const GLYPH_COLORS = { book: "#7d55c7", film: "#c0392b", globe: "#23866a", sparkles: "#b14f96", mic: "#12a07a", folder: "#c98a2c", code: "#5b6776" };
const REPO_GLYPHS = [[/portfolio|book|library/i, "book"], [/cinema|film|video|motion/i, "film"], [/site|pages|web/i, "globe"],
  [/skill|prompt/i, "sparkles"], [/voice|audio|tones/i, "mic"], [/projects?$/i, "folder"]];
function repoIcon(repoName, size = "sm") {
  const app = repoApp(repoName);
  if (app) return appIcon(app, size);
  if (S.selfRepo && String(repoName).toLowerCase() === S.selfRepo.toLowerCase()) return `<span class="aicon ${size} self"><img src="icons/icon.svg" alt=""></span>`;
  const glyph = (REPO_GLYPHS.find(([re]) => re.test(repoName)) || [null, "code"])[1];
  return `<span class="aicon ${size}" style="--c:${GLYPH_COLORS[glyph]}">${g(glyph)}</span>`;
}
function plainRow(list) {
  const c = list[0];
  const app = repoApp(c.repo);
  const name = app ? app.name : humanRepo(c.repo);
  const more = list.length > 1 ? `<span class="more">+${list.length - 1} more</span>` : "";
  return `<div class="plain-row" data-act="repo" data-repo="${esc(c.repo)}" role="button" tabindex="0" title="${esc(c.msg)}">
    ${repoIcon(c.repo)}<span class="main"><span class="top"><span class="name" dir="auto">${esc(name)}</span><span class="when">${esc(ago(c.date))}</span></span>
    <span class="line">${esc(lineText(c))} ${more}</span></span></div>`;
}
function quietLine(n) {
  return n ? `<a class="quiet-line" href="#/changes">${g("settings")}<span>${n} behind-the-scenes update${n > 1 ? "s" : ""} · no visible change</span>${g("chevron-right")}</a>` : "";
}
function homeChanges() {
  let since = Date.now() - 24 * 3600e3, title = "What changed today";
  let lines = updateLines(since);
  if (!lines.length) { since = Date.now() - 7 * 86400e3; title = "What changed this week"; lines = updateLines(since); }
  const shown = lines.filter((c) => c.visible !== false);
  const byRepo = new Map();
  for (const c of shown) byRepo.set(c.repo, [...(byRepo.get(c.repo) || []), c]);
  const visual = (S.shots.changes || []).find((c) => c.before && S.byId[c.app] && Date.now() - c.t * 1000 < 7 * 86400e3 && visualReason(c));
  let body = visual ? changeCard(visual) : "";
  const pictured = visual ? repoFor(S.byId[visual.app])?.name : null; // its newest line is already on the picture card
  body += [...byRepo.values()].filter((list) => list[0].repo !== pictured).slice(0, 3).map(plainRow).join("");
  body += quietLine(lines.length - shown.length);
  if (!body) body = `<div class="note">${g("history")}<div>Changes show up here once GitHub and the first screenshots load.</div></div>`;
  const projects = new Set(lines.map((c) => c.repo)).size;
  const meta = lines.length ? `${lines.length} update${lines.length > 1 ? "s" : ""} in ${projects} project${projects > 1 ? "s" : ""}` : "";
  return section(title, meta, `<div class="plain-feed">${body}</div>`, `<a class="link-btn" href="#/changes">See all</a>`);
}

// Why a picture changed: the newest visible update to that app between the two pictures.
function visualReason(c) {
  const repo = repoFor(S.byId[c.app]);
  const from = c.before.t * 1000, to = c.t * 1000 + 60e3;
  const hit = (repo?.recent || []).find((x) => { const t = Date.parse(x.date); return t > from && t <= to && x.visible !== false; });
  return hit ? lineText(hit) : null;
}
// Zoom both pictures onto the biggest change, so a small change is readable at a glance.
const SHOT_RATIO = { desktop: 900 / 1440, phone: 844 / 390 };
function ringBox([x, y, w, h]) {
  const px = Math.max(w * 0.14, 0.02), py = Math.max(h * 0.14, 0.02); // overshoot, like a marker drawn round it
  const x0 = Math.max(0, x - px), y0 = Math.max(0, y - py);
  return [x0, y0, Math.min(1, x + w + px) - x0, Math.min(1, y + h + py) - y0];
}
function cropFor(c, fa = 0.625) {
  const box = (c.boxes || [])[0];
  if (!box) return null;
  const r = SHOT_RATIO[c.size] || SHOT_RATIO.desktop;
  const [x, y, w, h] = ringBox(box);
  let bw = Math.max(w * 1.15, 0.6), bh = Math.max(h * 1.15, 0.16);
  if ((bh * r) / bw < fa) bh = (fa * bw) / r; else bw = (bh * r) / fa;
  if (bw > 1) { bw = 1; bh = fa / r; }
  if (bh > 1) { bh = 1; bw = r / fa; }
  return { x0: Math.min(Math.max(x + w / 2 - bw / 2, 0), 1 - bw), y0: Math.min(Math.max(y + h / 2 - bh / 2, 0), 1 - bh), bw, bh };
}
const RING_PATH = "M 9 53 C 4 27 29 7 55 6 C 81 5 98 24 96 49 C 94 76 71 95 44 94 C 18 93 2 74 6 49 C 8 36 18 23 34 16";
function rings(boxes, crop) {
  const k = crop || { x0: 0, y0: 0, bw: 1, bh: 1 };
  return (boxes || []).map((b) => {
    const [x, y, w, h] = ringBox(b);
    const box = [(x - k.x0) / k.bw, (y - k.y0) / k.bh, w / k.bw, h / k.bh].map((v) => (v * 100).toFixed(2));
    return `<svg class="ring" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" style="left:${box[0]}%;top:${box[1]}%;width:${box[2]}%;height:${box[3]}%"><path d="${RING_PATH}"/></svg>`;
  }).join("");
}
function changeCard(c) {
  const app = S.byId[c.app];
  if (!app || !c.before) return "";
  const crop = cropFor(c);
  const place = crop ? ` style="width:${100 / crop.bw}%;left:${(-crop.x0 / crop.bw) * 100}%;top:${(-crop.y0 / crop.bh) * 100}%"` : "";
  const pic = (shot, label) => `<figure><figcaption>${label}</figcaption><div class="shot${crop ? " crop" : ""}"><img src="${esc(crop ? shot.src : shot.thumb)}" alt="${esc(app.name)} ${label.toLowerCase()}" loading="lazy"${place}>${rings(c.boxes, crop)}</div></figure>`;
  return `<div class="change ${c.size === "phone" ? "phone" : ""}" data-act="compare" data-app="${esc(c.app)}" data-before="${c.before.id}" data-after="${c.id}" role="button" tabindex="0">
    <div class="cap">${appIcon(app, "sm")}<div class="main"><div class="top"><span class="name" dir="auto">${esc(app.name)}</span><span class="when">${esc(ago(c.t))}</span></div><div class="line">${esc(visualReason(c) || "Changed on screen; no update explains it yet")}</div></div></div>
    <div class="pics">${pic(c.before, "Before")}${pic(c, "After")}</div>
    <div class="tag">${g("split")}${c.size === "phone" ? "Phone" : "PC"} · tap to compare with a slider</div></div>`;
}

function changesTimeline() {
  const repos = S.github?.repos || [];
  const days = {};
  const add = (key, kind, item) => { (days[key] ||= { visual: [], repos: {} }); if (kind === "visual") days[key].visual.push(item); else (days[key].repos[item.repo] ||= []).push(item); };
  if (S.changesFilter !== "commits") for (const c of S.shots.changes || []) add(dayKey(c.t * 1000), "visual", c);
  if (S.changesFilter !== "visual") for (const r of repos) if (!/brain$/i.test(r.name)) for (const c of r.recent || []) add(dayKey(Date.parse(c.date)), "commit", { ...c, repo: r.name, repoUrl: r.url });
  const keys = Object.keys(days).sort().reverse().slice(0, 21);
  const chips = [["all", "Everything"], ["visual", "Pictures"], ["commits", "Updates"]].map(([v, l]) => `<button class="chip" data-act="changes-filter" data-v="${v}" aria-pressed="${S.changesFilter === v}">${l}</button>`).join("");
  let out = `<div class="chips" style="margin-top:4px">${chips}</div>`;
  if (!(S.shots.changes || []).length && S.changesFilter !== "commits") {
    out += `<div class="note" style="margin-top:14px">${g("camera")}<div><b>Before/after pictures start today.</b> The launcher snaps every running app at phone and PC size each night and after new commits. When a look changes, it appears here with a slider.</div></div>`;
  }
  for (const k of keys) {
    const d = days[k];
    out += `<div class="day"><h3>${esc(dayLabel(k))}</h3>`;
    if (d.visual.length) out += `<div class="change-grid">${d.visual.map(changeCard).join("")}</div>`;
    const all = Object.values(d.repos).flat();
    const quiet = all.filter((c) => c.visible === false).length;
    const byRepo = new Map();
    for (const c of all.filter((c) => c.visible !== false).sort((a, b) => Date.parse(b.date) - Date.parse(a.date))) byRepo.set(c.repo, [...(byRepo.get(c.repo) || []), c]);
    if (byRepo.size || quiet) {
      out += `<div class="plain-feed" style="margin-top:${d.visual.length ? 12 : 0}px">${[...byRepo.values()].map((list) => {
        const app = repoApp(list[0].repo);
        const name = app ? app.name : humanRepo(list[0].repo);
        return `<div class="plain-group"><div class="plain-row" data-act="repo" data-repo="${esc(list[0].repo)}" role="button" tabindex="0">${repoIcon(list[0].repo)}<span class="main"><span class="top"><span class="name" dir="auto">${esc(name)}</span><span class="when">${list.length} update${list.length > 1 ? "s" : ""}</span></span></span></div>` +
          list.slice(0, 5).map((c) => `<a class="plain-line" href="${esc(c.url)}" target="_blank" rel="noopener" title="${esc(c.msg)}"><span>${esc(lineText(c))}</span><span class="when">${esc(new Date(c.date).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }))}</span></a>`).join("") + `</div>`;
      }).join("")}${quiet ? `<div class="quiet-line">${g("settings")}<span>${quiet} behind-the-scenes update${quiet > 1 ? "s" : ""} · no visible change</span></div>` : ""}</div>`;
    }
    out += `</div>`;
  }
  if (!keys.length) out += `<div class="note" style="margin-top:14px">${g("history")}<div>Nothing yet. GitHub data loads within a minute of the launcher starting.</div></div>`;
  return out;
}

function changesStats() {
  const gh = S.github;
  if (!gh?.repos) return `<div class="skeleton" style="height:300px"></div>`;
  const repos = gh.repos;
  const active = repos.filter((r) => r.commits_30d).sort((a, b) => b.commits_30d - a.commits_30d);
  const top = active.slice(0, 6);
  const dayKeys = [];
  for (let i = 29; i >= 0; i--) dayKeys.push(dayKey(Date.now() - i * 86400000));
  const series = top.map((r, i) => ({ name: r.name, color: SERIES[i], values: dayKeys.map((k) => r.days?.[k] || 0) }));
  const other = active.slice(6);
  if (other.length) series.push({ name: "Other", color: "var(--line-strong)", values: dayKeys.map((k) => other.reduce((a, r) => a + (r.days?.[k] || 0), 0)) });
  const statsRepo = S.statsRepo || active[0]?.name;
  const repoOpts = active.slice(0, 30).map((r) => `<option value="${esc(r.name)}" ${r.name === statsRepo ? "selected" : ""}>${esc(r.name)}</option>`).join("");
  const visualCounts = {};
  for (const c of S.shots.changes || []) visualCounts[c.app] = (visualCounts[c.app] || 0) + 1;
  S.after.push(() => {
    if (gh.calendar?.length && $("#ch-heat")) C.heatmap($("#ch-heat"), { days: gh.calendar, weeksMax: 30 });
    if ($("#ch-days")) C.stacked($("#ch-days"), { cats: dayKeys.map((k) => new Date(k + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" })), series });
    if ($("#ch-where")) C.hbars($("#ch-where"), { data: active.slice(0, 10).map((r, i) => ({ label: r.name, value: r.commits_30d, color: i < 6 ? SERIES[i] : "var(--line-strong)" })) });
    if ($("#ch-lines") && statsRepo) loadLines(statsRepo);
    if ($("#ch-visual")) {
      const data = Object.entries(visualCounts).map(([id, n]) => ({ label: S.byId[id]?.name || id, value: n })).sort((a, b) => b.value - a.value).slice(0, 10);
      if (data.length) C.hbars($("#ch-visual"), { data, color: "var(--s7)" });
      else $("#ch-visual").innerHTML = `<p class="sub">No visual changes recorded yet.</p>`;
    }
  });
  const legend = `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")}</div>`;
  const total = active.reduce((a, r) => a + r.commits_30d, 0);
  return `<div class="charts" style="margin-top:12px">
    ${gh.calendar?.length ? `<div class="chart-card wide"><h3>Activity</h3><p class="sub">${gh.calendar.reduce((a, d) => a + d.count, 0).toLocaleString()} contributions in the last year · last 30 weeks shown</p><div id="ch-heat"></div></div>` : ""}
    <div class="chart-card wide"><h3>Commits per day</h3><p class="sub">Last 30 days, ${total.toLocaleString()} commits, top 6 projects</p>${legend}<div id="ch-days"></div>
      ${C.table(["Day", ...series.map((s) => s.name)], dayKeys.map((k, i) => [k, ...series.map((s) => s.values[i])]))}</div>
    <div class="chart-card"><h3>Where the work went</h3><p class="sub">Commits per project, last 30 days</p><div id="ch-where"></div></div>
    <div class="chart-card"><h3>Lines added and removed</h3><p class="sub">Per week, last 26 weeks · <select data-act="stats-repo" aria-label="Project" style="background:var(--raised);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:2px 4px;font:inherit">${repoOpts}</select></p><div id="ch-lines"><div class="skeleton" style="height:150px"></div></div></div>
    <div class="chart-card wide"><h3>Visual changes per app</h3><p class="sub">Screenshots that changed more than 2%</p><div id="ch-visual"></div></div>
  </div>`;
}

async function loadLines(repo) {
  const el = $("#ch-lines");
  if (!el) return;
  try {
    const data = await api(`/api/github/stats?repo=${encodeURIComponent(repo)}`);
    if (data.pending) { el.innerHTML = `<p class="sub">GitHub is counting this project's lines. Check back in a minute.</p>`; return; }
    if (!data.weeks?.length) { el.innerHTML = `<p class="sub">${esc(data.error || "No line data for this project.")}</p>`; return; }
    C.diverging(el, { weeks: data.weeks });
  } catch (e) { el.innerHTML = e.code === "needs-pc" ? `<p class="sub needs-pc-line">${g("monitor")}${esc(e.message)}</p>` : `<p class="sub">Couldn't load: ${esc(e.message)}</p>`; }
}

function repoRow(r) {
  const lang = r.language ? `<span class="st"><i style="background:${esc(r.lang_color || "var(--ink-3)")}"></i>${esc(r.language)}</span>` : "";
  const live = r.pages ? `<a class="btn sm" href="${esc(r.pages)}" target="_blank" rel="noopener">${g("globe")}Live site</a>` : "";
  return `<div class="row" data-act="repo" data-repo="${esc(r.name)}" role="button" tabindex="0">
    <span class="aicon sm" style="--c:${r.private ? "#4b5563" : "#1f6feb"}">${g(r.private ? "lock" : "github")}</span>
    <div class="main"><div class="name">${esc(r.name)}${r.archived ? ` <span class="pill">archived</span>` : ""}</div>
    <div class="sub">${esc(r.description || (r.private ? "Private repo" : "Public repo"))}</div></div>
    <div class="end"><span class="desk-only">${lang}</span>${r.commits_30d ? `<span class="pill num desk-only" title="Commits in the last 30 days">${r.commits_30d}</span>` : ""}<span class="col desk-only">${esc(ago(r.pushed))}</span>${live}</div></div>`;
}

function serverRow(app) {
  const st = S.status[app.id];
  const up = S.overview[app.id]?.d1;
  return `<div class="row" data-detail="${esc(app.id)}" role="button" tabindex="0">${appIcon(app, "sm")}
    <div class="main"><div class="name">${esc(app.name)}</div><div class="sub">${esc(new URL(app.url).port ? `port ${new URL(app.url).port}` : new URL(app.url).pathname)}${up != null ? ` · ${(up * 100).toFixed(1)}% up today` : ""}</div></div>
    <div class="end">${statusEl(app, true)}<span class="ms num desk-only">${st?.ms != null && st.state === "up" ? `${st.ms} ms` : ""}</span>${startButton(app) || openLink(app, "icon-btn", g("external"), "Open")}</div></div>`;
}

// ---------- files ----------
function filesView() {
  const f = S.files;
  const root = S.pc?.roots.find((r) => r.id === f.root);
  const parts = f.path ? f.path.split("/") : [];
  const crumbs = [`<button data-act="files-up" data-to="">${esc(root?.name || f.root)}</button>`]
    .concat(parts.map((p, i) => `${g("chevron-right")}<button data-act="files-up" data-to="${esc(parts.slice(0, i + 1).join("/"))}">${esc(p)}</button>`)).join("");
  const head = `<div class="section"><div class="section-head"><button class="btn sm ghost" data-act="files-close">${g("back")}PC</button><span class="grow"></span></div><div class="crumbs">${crumbs}</div></div>`;
  if (!f.listing) return head + `<div class="skeleton" style="height:240px"></div>`;
  const rows = f.listing.entries.map((e) => {
    const rel = (f.path ? f.path + "/" : "") + e.name;
    const icon = e.dir ? "folder" : fileGlyph(e.name);
    return `<div class="row" data-act="${e.dir ? "files-open-dir" : "files-preview"}" data-path="${esc(rel)}" role="button" tabindex="0">
      <span class="ficon">${g(icon)}</span><div class="main"><div class="name" dir="auto">${esc(e.name)}</div>
      <div class="sub">${e.dir ? "Folder" : bytes(e.size)} · ${esc(ago(e.mtime))}</div></div>${e.dir ? g("chevron-right") : ""}</div>`;
  }).join("");
  return head + `<div class="rows">${rows || `<div class="row"><div class="main sub">Empty folder.</div></div>`}</div>${f.listing.truncated ? `<p class="sub">Showing the newest ${f.listing.entries.length} items.</p>` : ""}`;
}
function fileGlyph(name) {
  const ext = name.split(".").pop().toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "heic", "svg"].includes(ext)) return "image";
  if (["mp4", "mov", "mkv", "webm", "mp3", "wav", "m4a"].includes(ext)) return "video";
  if (["pdf", "doc", "docx", "txt", "md", "csv", "xlsx", "dxf"].includes(ext)) return "file-text";
  return "file";
}
async function loadFiles(root, path = "") {
  S.files = { root, path, listing: null };
  render();
  try { S.files.listing = await api(`/api/files?root=${encodeURIComponent(root)}&path=${encodeURIComponent(path)}`); }
  catch (e) { toast(`Couldn't open folder: ${e.message}`); S.files.listing = { entries: [] }; }
  render();
}
function previewFile(rel) {
  const f = S.files;
  const url = `/api/files/raw?root=${encodeURIComponent(f.root)}&path=${encodeURIComponent(rel)}`;
  const name = rel.split("/").pop();
  const ext = name.split(".").pop().toLowerCase();
  let media = "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) media = `<img class="preview-media" src="${esc(url)}" alt="${esc(name)}" style="background:transparent">`;
  else if (["mp4", "mov", "webm", "m4v"].includes(ext)) media = `<video class="preview-media" src="${esc(url)}" controls playsinline preload="metadata"></video>`;
  else if (["mp3", "wav", "m4a", "ogg"].includes(ext)) media = `<audio src="${esc(url)}" controls style="width:100%"></audio>`;
  else if (ext === "pdf") media = `<iframe class="preview-frame" src="${esc(url)}" title="${esc(name)}"></iframe>`;
  else if (["txt", "md", "csv", "json", "log", "py", "js", "css", "html", "dxf", "ps1", "cmd"].includes(ext)) media = `<pre id="text-preview" style="white-space:pre-wrap;font:12px/1.5 var(--mono);background:var(--raised);padding:12px;border-radius:12px;max-height:60dvh;overflow:auto">Loading…</pre>`;
  else media = `<div class="note">${g("file")}<div>No preview for this file type. Download it or open it on the PC.</div></div>`;
  openPanel(`<div class="panel-head"><span class="ficon">${g(fileGlyph(name))}</span><div class="main"><h2 dir="auto" style="font-size:16px;overflow-wrap:anywhere">${esc(name)}</h2><div class="about">${esc(f.path || "/")}</div></div>${closeBtn()}</div>
    <div class="panel-body"><div class="btns" style="margin-bottom:14px"><a class="btn primary sm" href="${esc(url)}&download=1">${g("download")}Download</a>
    <button class="btn sm" data-act="files-open-pc" data-path="${esc(rel)}">${g("monitor")}Open on PC</button>
    <a class="btn sm ghost" href="${esc(url)}" target="_blank" rel="noopener">${g("external")}New tab</a></div>${media}</div>`);
  if ($("#text-preview")) fetch(url, { headers: { Range: "bytes=0-200000" } }).then((r) => r.text()).then((t) => { const el = $("#text-preview"); if (el) el.textContent = t; }).catch(() => {});
}

// ---------- detail panels ----------
function closeBtn() { return `<button class="icon-btn" data-act="close" aria-label="Close">${g("x")}</button>`; }

function openPanel(html) {
  let scrim = $(".scrim");
  if (!scrim) {
    scrim = document.createElement("div");
    scrim.className = "scrim";
    scrim.addEventListener("click", closePanel);
    document.body.appendChild(scrim);
  }
  const panel = $("#panel");
  panel.innerHTML = `<div class="grab" aria-hidden="true"></div>${html}`;
  panel.hidden = false;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  S.lastFocus = document.activeElement;
  requestAnimationFrame(() => { scrim.classList.add("on"); panel.classList.add("on"); });
  setTimeout(() => panel.querySelector("h2")?.setAttribute("tabindex", "-1"), 0);
  setTimeout(() => panel.querySelector("h2")?.focus({ preventScroll: true }), 60);
  runAfter();
}
function closePanel() {
  const panel = $("#panel"), scrim = $(".scrim");
  panel.classList.remove("on");
  scrim?.classList.remove("on");
  C.hideTip();
  setTimeout(() => { panel.hidden = true; panel.innerHTML = ""; scrim?.remove(); }, 230);
  S.panelApp = null;
  S.lastFocus?.focus?.({ preventScroll: true });
}

function appPanel(id) {
  const app = S.byId[id];
  if (!app) return;
  S.panelApp = id;
  const st = S.status[id];
  const pinned = S.pins.includes(id);
  const repo = repoFor(app);
  const shots = S.shots.latest[id] || {};
  const group = S.groups.find((x) => x.id === app.group)?.name;
  const statusLine = app.type === "page" ? "Claude page" : [statusWord(app), st?.ms != null && st.state === "up" ? `${st.ms} ms` : null, st?.since ? `since ${ago(st.since)}`.replace(" ago", "") : null].filter(Boolean).join(" · ");
  let body = `<div class="btns">
    ${openLink(app, "btn primary", `${g("external")}Open`)}
    ${startButton(app, false)}
    ${(app.alt || []).map((l) => `<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join("")}
    ${app.repo ? `<a class="btn ghost" href="${esc(app.repo)}" target="_blank" rel="noopener">${g("github")}Code</a>` : ""}
    ${BACKUP ? greyBtn("pins", `${g(pinned ? "pin-off" : "pin")}${pinned ? "Unpin" : "Pin"}`, "btn ghost") : `<button class="btn ghost" data-act="${pinned ? "unpin" : "pin"}" data-id="${esc(id)}">${g(pinned ? "pin-off" : "pin")}${pinned ? "Unpin" : "Pin"}</button>`}
    <button class="icon-btn" data-act="copy" data-text="${esc(app.url)}" aria-label="Copy link">${g("copy")}</button></div>`;
  if (pcOnly(app)) {
    body += `<div class="note" style="margin-top:14px">${g("monitor")}<div><b>Runs on your PC.</b> It opens again when your PC is back.${app.alt?.length ? " The other links work now." : ""}</div></div>`;
  } else if (!BACKUP && stateOf(app) === "down" && !S.canStart[id] && app.type === "app") {
    body += `<div class="note" style="margin-top:14px">${g("alert")}<div>It isn't running and the launcher doesn't know how to start it yet. Start it on the PC once, then ask Claude on the PC to add a start recipe for it.</div></div>`;
  }
  if (app.type !== "page") {
    const sizes = ["desktop", "phone"].filter((s) => shots[s]);
    const snapBtn = BACKUP ? greyBtn("snap", `${g("camera")}Snap now`, "btn sm ghost") : `<button class="btn sm ghost" data-act="snap" data-id="${esc(id)}">${g("camera")}Snap now</button>`;
    const first = sizes[0] && shots[sizes[0]];
    body += section("Looks", first ? `snapped ${ago(first.t)}` : "",
      sizes.length ? `<div class="shot"><img src="${esc(first.src)}" alt="${esc(app.name)} screenshot" loading="lazy"></div>
        <div class="btns" style="margin-top:10px"><button class="btn sm" data-act="compare" data-app="${esc(id)}">${g("split")}Compare over time</button>${snapBtn}</div>`
        : `<div class="note">${g("camera")}<div>No screenshot yet.${BACKUP || stateOf(app) === "up" ? "" : " It needs to be running first."}</div></div><div class="btns" style="margin-top:10px">${snapBtn}</div>`);
  }
  if (BACKUP && (app.type === "app" || app.type === "site")) {
    const o = S.overview[id];
    const pct = (v) => (v == null ? "–" : `${(v * 100).toFixed(1)}%`);
    const why = `<p class="sub needs-pc-line">${g("monitor")}${esc(source.REASON.health)}</p>`;
    body += section("Health", "as last seen", o ? `<dl class="kv"><dt>Up, last day</dt><dd class="num">${pct(o.d1)}</dd><dt>Up, last week</dt><dd class="num">${pct(o.d7)}</dd><dt>Response</dt><dd class="num">${o.ms != null ? `${o.ms} ms` : "–"}</dd></dl>${why}` : why);
  } else if (app.type === "app" || app.type === "site") {
    body += `<section class="section"><div class="section-head"><h2>Health</h2><span class="grow"></span><div class="seg" role="group" aria-label="Range">${["24h", "7d", "30d"].map((r) => `<button data-act="health-range" data-v="${r}" aria-pressed="${r === "24h"}">${r}</button>`).join("")}</div></div><div class="chart-card"><div id="health-strip"></div><p class="sub" id="health-sub" style="margin:8px 0 6px"></p><div id="health-ms"></div><div id="health-out"></div></div></section>`;
    S.after.push(() => loadHealth(id, "24h"));
  }
  if (repo) {
    const commits = (repo.recent || []).slice(0, 8);
    body += section("Changelog", `${repo.commits_30d ?? "?"} commits in 30 days`,
      `<div class="rows">${(repo.releases || []).slice(0, 2).map((r) => `<a class="commit" href="${esc(r.url)}" target="_blank" rel="noopener">${g("tag")}<span class="msg"><b>${esc(r.name)}</b></span><span class="when">${esc(ago(r.date))}</span></a>`).join("")}
       ${commits.map((c) => `<a class="commit ${c.visible === false ? "quiet" : ""}" href="${esc(c.url)}" target="_blank" rel="noopener" title="${esc(c.msg)}"><span class="msg">${esc(lineText(c))}</span><span class="when">${esc(ago(c.date))}</span></a>`).join("")}</div>
       <div class="chart-card" style="margin-top:12px"><h3>Lines added and removed</h3><p class="sub">Per week</p><div id="ch-lines"><div class="skeleton" style="height:150px"></div></div></div>`);
    S.after.push(() => loadLines(repo.name));
  }
  body += section("Details", "", `<dl class="kv"><dt>Group</dt><dd>${esc(group || "")}</dd><dt>Link</dt><dd><span class="mono">${esc(app.url)}</span></dd>${app.repo ? `<dt>Repo</dt><dd><span class="mono">${esc(app.repo.replace("https://github.com/", ""))}</span></dd>` : ""}</dl>`);
  openPanel(`<div class="panel-head">${appIcon(app, "lg")}<div class="main"><h2 dir="auto">${esc(app.name)}</h2>
    ${app.name_ar ? `<div class="about" dir="rtl" lang="ar">${esc(app.name_ar)}</div>` : ""}<div class="about">${esc(app.about || "")}</div>
    <div class="about" style="margin-top:4px">${app.type !== "page" ? statusEl(app, true) : ""} <span style="color:var(--ink-3)">${esc(statusLine.replace(statusWord(app), "").replace(/^ · /, ""))}</span></div></div>${closeBtn()}</div>
    <div class="panel-body">${body}</div>`);
}

async function loadHealth(id, range) {
  const strip = $("#health-strip"), msEl = $("#health-ms"), sub = $("#health-sub"), out = $("#health-out");
  if (!strip) return;
  try {
    const h = await api(`/api/history?app=${encodeURIComponent(id)}&range=${range}`);
    const stepMs = h.step * 1000;
    const end = Date.now(), start = end - ({ "24h": 86400e3, "7d": 7 * 86400e3, "30d": 30 * 86400e3 }[range]);
    const bySlot = new Map(h.points.map((p) => [Math.floor((p.t * 1000) / stepMs), p]));
    const cells = [];
    for (let t = Math.floor(start / stepMs); t <= Math.floor(end / stepMs); t++) {
      const p = bySlot.get(t);
      const when = new Date(t * stepMs);
      cells.push({ t: t * stepMs, up: p ? p.up : null, tip: `${when.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}\n${p ? `Up|${Math.round(p.up * 100)}%\nResponse|${p.ms ?? "–"} ms` : "No data|"}` });
    }
    const maxCells = range === "24h" ? 96 : cells.length;
    const shown = cells.length > maxCells ? compress(cells, maxCells) : cells;
    C.strip(strip, { cells: shown });
    sub.textContent = h.uptime == null ? "No checks recorded yet." : `${(h.uptime * 100).toFixed(2)}% up · ${h.outages.length} outage${h.outages.length === 1 ? "" : "s"} in ${range}`;
    const fmtT = (t, long) => new Date(t).toLocaleString(undefined, range === "24h" && !long ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short", ...(long ? { hour: "2-digit", minute: "2-digit" } : {}) });
    C.area(msEl, { points: h.points.filter((p) => p.ms != null).map((p) => ({ t: p.t * 1000, v: p.ms })), height: 130, fmt: (v) => `${Math.round(v)} ms`, tFmt: fmtT, label: "Response" });
    out.innerHTML = h.outages.length ? `<div class="rows" style="margin-top:10px">${h.outages.slice(-5).reverse().map((o) => `<div class="commit"><span class="st down"><i></i>Down</span><span class="msg">${esc(new Date(o.from * 1000).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}</span><span class="when">${o.to ? esc(dur(o.secs)) : "still down"}</span></div>`).join("")}</div>` : "";
  } catch (e) { strip.innerHTML = `<p class="sub">Couldn't load history: ${esc(e.message)}</p>`; }
}
function compress(cells, n) {
  const size = Math.ceil(cells.length / n), out = [];
  for (let i = 0; i < cells.length; i += size) {
    const chunk = cells.slice(i, i + size).filter((c) => c.up != null);
    const up = chunk.length ? chunk.reduce((a, c) => a + c.up, 0) / chunk.length : null;
    out.push({ t: cells[i].t, up, tip: cells[i].tip });
  }
  return out;
}
function dur(s) { return s < 3600 ? `${Math.max(1, Math.round(s / 60))} min` : s < 86400 ? `${(s / 3600).toFixed(1)} h` : `${(s / 86400).toFixed(1)} d`; }

function repoPanel(name) {
  const r = (S.github?.repos || []).find((x) => x.name === name);
  if (!r) return;
  const apps = S.apps.filter((a) => a.repo && a.repo.replace(/\/$/, "").toLowerCase() === r.url.toLowerCase());
  const body = `<div class="btns"><a class="btn primary" href="${esc(r.url)}" target="_blank" rel="noopener">${g("github")}Open repo</a>
    ${r.pages ? `<a class="btn" href="${esc(r.pages)}" target="_blank" rel="noopener">${g("globe")}Live site</a>` : ""}
    ${r.homepage && r.homepage !== r.pages ? `<a class="btn" href="${esc(r.homepage)}" target="_blank" rel="noopener">${g("link")}Website</a>` : ""}
    ${apps.map((a) => openLink(a, "btn ghost", esc(a.name))).join("")}
    <button class="icon-btn" data-act="copy" data-text="${esc(r.url)}" aria-label="Copy link">${g("copy")}</button></div>
    ${section("Changelog", `${r.commits_30d ?? "?"} commits in 30 days · pushed ${ago(r.pushed)}`, `<div class="rows">${(r.releases || []).map((x) => `<a class="commit" href="${esc(x.url)}" target="_blank" rel="noopener">${g("tag")}<span class="msg"><b>${esc(x.name)}</b></span><span class="when">${esc(ago(x.date))}</span></a>`).join("")}${(r.recent || []).map((c) => `<a class="commit ${c.visible === false ? "quiet" : ""}" href="${esc(c.url)}" target="_blank" rel="noopener" title="${esc(c.msg)}"><span class="msg">${esc(lineText(c))}</span><span class="when">${esc(ago(c.date))}</span></a>`).join("") || `<div class="commit"><span class="msg sub">No recent commits loaded.</span></div>`}</div>`)}
    <div class="chart-card" style="margin-top:14px"><h3>Lines added and removed</h3><p class="sub">Per week, last 26 weeks</p><div id="ch-lines"><div class="skeleton" style="height:150px"></div></div></div>
    ${section("Details", "", `<dl class="kv"><dt>Visibility</dt><dd>${r.private ? "Private" : "Public"}</dd>${r.language ? `<dt>Language</dt><dd>${esc(r.language)}</dd>` : ""}<dt>Stars</dt><dd>${r.stars ?? 0}</dd></dl>`)}`;
  S.after.push(() => loadLines(r.name));
  openPanel(`<div class="panel-head"><span class="aicon lg" style="--c:${r.private ? "#4b5563" : "#1f6feb"}">${g(r.private ? "lock" : "github")}</span><div class="main"><h2>${esc(r.name)}</h2><div class="about">${esc(r.description || "")}</div></div>${closeBtn()}</div><div class="panel-body">${body}</div>`);
}

async function comparePanel(appId, beforeId, afterId) {
  S.panelApp = null; // the compare view is not an app panel: status refreshes must not redraw over it
  const app = S.byId[appId];
  let shots;
  try { shots = (await api(`/api/shots?app=${encodeURIComponent(appId)}`)).shots; }
  catch (e) { toast(e.message); return; }
  if (shots.length < 1) { toast("No screenshots yet"); return; }
  const after0 = shots.find((s) => s.id === Number(afterId)) || shots[0];
  const size0 = after0.size;
  const render = (size, aId, bId) => {
    const list = shots.filter((s) => s.size === size);
    const after = list.find((s) => s.id === aId) || list[0];
    const before = list.find((s) => s.id === bId) || list.find((s) => s.t < after.t) || after;
    const opts = (sel) => list.map((s) => `<option value="${s.id}" ${s.id === sel ? "selected" : ""}>${esc(new Date(s.t * 1000).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}${s.changed ? " · changed" : ""}</option>`).join("");
    const repo = repoFor(app);
    const between = repo ? (repo.recent || []).filter((c) => { const t = Date.parse(c.date) / 1000; return t > before.t && t <= after.t; }) : [];
    const sizes = ["desktop", "phone"].filter((sz) => shots.some((s) => s.size === sz));
    const pct = before.id !== after.id ? `${Math.round((after.diff ?? 0) * 100)}% different from the picture before it` : "Only one picture so far";
    return `<div class="panel-head">${appIcon(app, "lg")}<div class="main"><h2>${esc(app.name)}: before and after</h2><div class="about">${esc(pct)}</div></div>${closeBtn()}</div>
      <div class="panel-body">
      <div class="section-head">${sizes.length > 1 ? `<div class="seg" role="group" aria-label="Size">${sizes.map((sz) => `<button data-act="cmp-size" data-v="${sz}" aria-pressed="${sz === size}">${g(sz === "phone" ? "phone" : "laptop")}${sz === "phone" ? "Phone" : "PC"}</button>`).join("")}</div>` : ""}</div>
      <div class="compare wipe" tabindex="0" role="slider" aria-label="Drag to compare" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" style="--pos:100%;${size === "phone" ? "max-width:390px;margin:0 auto" : ""}">
        <img src="${esc(before.src)}" alt="Before"><img class="after" src="${esc(after.src)}" alt="After">
        <div class="handle"><div class="knob">${g("columns")}</div></div><span class="tagl">Before</span><span class="tagr">After</span></div>
      <dl class="kv" style="margin-top:12px;grid-template-columns:auto 1fr"><dt>Before</dt><dd><select data-act="cmp-before" style="width:100%;background:var(--raised);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:6px">${opts(before.id)}</select></dd>
      <dt>After</dt><dd><select data-act="cmp-after" style="width:100%;background:var(--raised);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:6px">${opts(after.id)}</select></dd></dl>
      ${section("What changed in the code", between.length ? `${between.length} commit${between.length > 1 ? "s" : ""} between the pictures` : "", between.length ? `<div class="rows">${between.map((c) => `<a class="commit" href="${esc(c.url)}" target="_blank" rel="noopener"><span class="msg">${esc(c.msg)}</span><span class="sha">${esc(c.sha)}</span><span class="when">${esc(ago(c.date))}</span></a>`).join("")}</div>` : `<div class="note">${g("commit")}<div>${repo ? "No commits between these two pictures in the recent history." : "This app has no linked repo."}</div></div>`)}
      <div class="btns" style="margin-top:14px">${openLink(app, "btn primary", `Open ${esc(app.name)}`)}</div></div>`;
  };
  const state = { size: size0, a: after0.id, b: Number(beforeId) || null };
  const paint = () => {
    $("#panel").innerHTML = `<div class="grab" aria-hidden="true"></div>${render(state.size, state.a, state.b)}`;
    wireCompare();
  };
  openPanel(render(state.size, state.a, state.b));
  wireCompare();
  $("#panel").onchange = (e) => {
    if (e.target.matches('[data-act="cmp-before"]')) { state.b = Number(e.target.value); paint(); }
    if (e.target.matches('[data-act="cmp-after"]')) { state.a = Number(e.target.value); paint(); }
  };
  $("#panel").onclick = (e) => {
    const b = e.target.closest('[data-act="cmp-size"]');
    if (b) { state.size = b.dataset.v; state.a = null; state.b = null; paint(); }
  };
}
function wireCompare() {
  const box = $("#panel .compare");
  if (!box) return;
  const set = (p) => { p = Math.max(0, Math.min(100, p)); box.style.setProperty("--pos", `${p}%`); box.setAttribute("aria-valuenow", String(Math.round(p))); };
  requestAnimationFrame(() => requestAnimationFrame(() => { set(50); setTimeout(() => box.classList.remove("wipe"), 750); }));
  let drag = false;
  const move = (e) => { const r = box.getBoundingClientRect(); set(((e.clientX - r.left) / r.width) * 100); };
  box.addEventListener("pointerdown", (e) => { drag = true; box.classList.remove("wipe"); box.setPointerCapture(e.pointerId); move(e); });
  box.addEventListener("pointermove", (e) => drag && move(e));
  box.addEventListener("pointerup", () => { drag = false; });
  box.addEventListener("keydown", (e) => {
    const now = Number(box.getAttribute("aria-valuenow"));
    if (e.key === "ArrowLeft") { set(now - 5); e.preventDefault(); }
    if (e.key === "ArrowRight") { set(now + 5); e.preventDefault(); }
  });
}

function addPinPanel() {
  const unpinned = S.apps.filter((a) => !S.pins.includes(a.id));
  openPanel(`<div class="panel-head"><div class="main"><h2>Add a pin</h2><div class="about">Tap an app to pin it</div></div>${closeBtn()}</div>
    <div class="panel-body"><div class="tiles">${unpinned.map((a) => `<div class="tile" data-act="pin" data-id="${esc(a.id)}" role="button" tabindex="0">${appIcon(a)}<span class="name">${esc(a.name)}</span></div>`).join("")}</div></div>`);
}

function phonePanel() {
  if (BACKUP) {
    const here = location.href.split("#")[0];
    openPanel(`<div class="panel-head"><div class="main"><h2>Put the backup on your phone</h2><div class="about">It opens even when Tailscale or the PC is off</div></div>${closeBtn()}</div>
      <div class="panel-body"><div class="note">${g("phone")}<div>On the iPhone, open this page in Safari, tap <b>Share</b>, then <b>Add to Home Screen</b>. It is called <b>Backup</b>, so it sits apart from the live launcher.</div></div>
      <p class="mono" style="font-size:15px;overflow-wrap:anywhere;margin:14px 0">${esc(here)}</p>
      <div class="btns"><button class="btn primary" data-act="copy" data-text="${esc(here)}">${g("copy")}Copy link</button></div></div>`);
    return;
  }
  const url = location.origin.includes("127.0.0.1") || location.origin.includes("localhost") ? (S.publicOrigin || location.origin) : location.origin;
  openPanel(`<div class="panel-head"><div class="main"><h2>Put it on your phone</h2><div class="about">Tailscale must be on</div></div>${closeBtn()}</div>
    <div class="panel-body"><div class="note">${g("phone")}<div>On the iPhone, open this link in Safari, tap <b>Share</b>, then <b>Add to Home Screen</b>.</div></div>
    <p class="mono" style="font-size:15px;overflow-wrap:anywhere;margin:14px 0">${esc(url)}/</p>
    <div class="btns"><button class="btn primary" data-act="copy" data-text="${esc(url)}/">${g("copy")}Copy link</button><a class="btn" href="news/" target="_blank" rel="noopener">${g("news")}MK News</a></div></div>`);
}

// ---------- search ----------
function searchItems() {
  const q = S.q.trim().toLowerCase();
  if (!q) return [];
  const score = (text) => {
    text = (text || "").toLowerCase();
    if (!text) return 0;
    if (text.startsWith(q)) return 3;
    if (text.split(/[\s\-·/]+/).some((w) => w.startsWith(q))) return 2;
    return text.includes(q) ? 1 : 0;
  };
  const out = [];
  for (const a of S.apps) {
    const s = Math.max(score(a.name) * 2, score(a.name_ar) * 2, score(a.about), score(S.groups.find((x) => x.id === a.group)?.name));
    if (s) out.push({ kind: "app", s: s + (S.pins.includes(a.id) ? 1 : 0), app: a });
  }
  for (const p of S.pc?.shortcuts || []) {
    const s = score(p.name);
    if (s) out.push({ kind: "pc", s, item: p });
  }
  for (const r of S.github?.repos || []) {
    const s = Math.max(score(r.name) * 1.5, score(r.description) * 0.5);
    if (s) out.push({ kind: "repo", s, repo: r });
  }
  return out.sort((a, b) => b.s - a.s).slice(0, 30);
}
function searchView() {
  const items = searchItems();
  S.results = items;
  if (S.sel >= items.length) S.sel = Math.max(0, items.length - 1);
  if (!items.length) return `<div class="section"><div class="note">${g("search")}<div>Nothing matches “${esc(S.q)}”.</div></div></div>`;
  const rows = items.map((it, i) => {
    const sel = i === S.sel ? " selected" : "";
    if (it.kind === "app") return appRow(it.app).replace('class="row"', `class="row${sel}" data-index="${i}"`);
    if (it.kind === "pc") return `<div class="row${sel}" data-index="${i}" data-act="pc-open" data-id="${esc(it.item.id)}" role="button" tabindex="0">${letterIcon(it.item.name, "sm")}<div class="main"><div class="name">${esc(it.item.name)}</div><div class="sub">On your PC · ${esc(it.item.where)}</div></div>${g("monitor")}</div>`;
    return repoRow(it.repo).replace('class="row"', `class="row${sel}" data-index="${i}"`);
  }).join("");
  return `<div class="section"><div class="section-head"><h2>Results</h2><span class="meta">${items.length} · Enter opens the highlighted one</span></div><div class="rows">${rows}</div></div>`;
}
function openResult(i, detail = false) {
  const it = (S.results || [])[i];
  if (!it) return;
  if (it.kind === "app") {
    if (detail) return appPanel(it.app.id);
    openApp(it.app);
  } else if (it.kind === "pc") pcOpen(it.item.id);
  else if (detail) repoPanel(it.repo.name);
  else window.open(it.repo.pages || it.repo.url, "_blank", "noopener");
}
function openApp(app) {
  if (pcOnly(app)) { toast(source.REASON.open); return; }
  window.open(app.url, "_blank", "noopener");
  recordRecent(app.id);
}
function recordRecent(id) {
  if (BACKUP) return;
  fetch("/api/recent", { method: "POST", keepalive: true, headers: { "X-MKL": "1", "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => {});
  S.recents = [{ id, at: Date.now() / 1000 }, ...S.recents.filter((r) => r.id !== id)].slice(0, 12);
}

// ---------- actions ----------
async function act(name, el) {
  const id = el.dataset.id;
  switch (name) {
    case "start": {
      el.classList.add("loading");
      try {
        await post("/api/start", { id });
        S.status[id] = { ...(S.status[id] || {}), state: "starting" };
        toast(`Starting ${S.byId[id]?.name} on your PC`);
        render(); refreshPanel();
        fastPoll();
      } catch (e) { toast(e.message); el.classList.remove("loading"); }
      break;
    }
    case "pin": case "unpin": {
      const pins = name === "pin" ? [...S.pins.filter((p) => p !== id), id] : S.pins.filter((p) => p !== id);
      try { S.pins = (await post("/api/pins", { pins })).pins; } catch (e) { toast(e.message); }
      toast(name === "pin" ? "Pinned" : "Unpinned");
      if ($("#panel").classList.contains("on") && el.closest("#panel") && !el.closest(".tiles")) refreshPanel();
      else if (el.closest("#panel")) closePanel();
      render();
      break;
    }
    case "edit-pins": S.editPins = !S.editPins; render(); break;
    case "add-pin": addPinPanel(); break;
    case "copy": copy(el.dataset.text, "Link copied"); break;
    case "close": closePanel(); break;
    case "apps-group": S.appsGroup = el.dataset.v; render(); break;
    case "apps-view": S.appsView = el.dataset.v; localSet("appsView", S.appsView); render(); break;
    case "gh-filter": S.ghFilter = el.dataset.v; render(); break;
    case "gh-sort": S.ghSort = el.dataset.v; render(); break;
    case "gh-refresh": {
      el.classList.add("loading");
      try { await post("/api/github/refresh"); toast("Refreshing from GitHub…"); setTimeout(loadGithub, 9000); setTimeout(loadGithub, 20000); }
      catch (e) { toast(e.message); }
      setTimeout(() => el.classList.remove("loading"), 1500);
      break;
    }
    case "repo": repoPanel(el.dataset.repo); break;
    case "rail": localSet("rail", localGet("rail", "full") === "min" ? "full" : "min"); applyRail(); break;
    case "changes-view": S.changesView = el.dataset.v; render(); break;
    case "changes-filter": S.changesFilter = el.dataset.v; render(); break;
    case "compare": comparePanel(el.dataset.app, el.dataset.before, el.dataset.after); break;
    case "snap": case "snap-all": {
      try {
        const r = await post("/api/shots/snap", name === "snap" ? { id } : { all: true });
        toast(name === "snap" ? "Taking screenshots on the PC…" : `Snapping ${r.queued.length} apps on the PC…`);
        setTimeout(loadShots, 20000);
      } catch (e) { toast(e.message); }
      break;
    }
    case "pc-open": pcOpen(id); break;
    case "files": loadFiles(el.dataset.root); break;
    case "files-open-dir": loadFiles(S.files.root, el.dataset.path); break;
    case "files-up": loadFiles(S.files.root, el.dataset.to); break;
    case "files-close": S.files = null; render(); break;
    case "files-preview": previewFile(el.dataset.path); break;
    case "files-open-pc": {
      try { await post("/api/files/open", { root: S.files.root, path: el.dataset.path }); toast("Opening on your PC"); } catch (e) { toast(e.message); }
      break;
    }
    case "health-range": {
      $$('[data-act="health-range"]').forEach((b) => b.setAttribute("aria-pressed", String(b === el)));
      loadHealth(S.panelApp, el.dataset.v);
      break;
    }
    case "theme": {
      const order = ["auto", "dark", "light"];
      const next = order[(order.indexOf(localGet("theme", "auto")) + 1) % 3];
      localSet("theme", next);
      applyTheme();
      toast(`Theme: ${next === "auto" ? "follows your device" : next}`);
      if (S.route === "settings") settings.paint();
      break;
    }
    case "phone": phonePanel(); break;
    case "needs-pc": toast(source.REASON[el.dataset.why] || source.REASON.default); break;
    case "connect-cinema": connectWith("", "mkc"); break;
    case "forget-key": {
      await source.forget();
      toast("Key forgotten on this device");
      S.snapAt = 0;
      showConnect();
      break;
    }
    default:
      if (name.startsWith("reel-")) reels.act(name, el);
      else if (name.startsWith("set-")) settings.act(name, el);
      break;
  }
}
async function pcOpen(id) {
  try { await post("/api/pc/open", { id }); toast(S.client.pc ? "Opening…" : "Opening on your PC"); }
  catch (e) { toast(e.message); }
}
function refreshPanel() { if (S.panelApp) appPanel(S.panelApp); }

function applyRail() {
  const min = localGet("rail", "full") === "min";
  document.documentElement.classList.toggle("rail-min", min);
  const b = $(".rail-toggle");
  if (b) { b.innerHTML = g(min ? "panel-left-open" : "panel-left-close"); b.setAttribute("aria-label", min ? "Show sidebar" : "Hide sidebar"); b.title = `${min ? "Show" : "Hide"} sidebar (Ctrl+\\)`; }
}
function applyTheme() {
  const t = localGet("theme", "auto");
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
}

// ---------- shell render ----------
function renderShell() {
  const c = counts();
  const summary = BACKUP ? `<span class="st backup-st"><i></i>Backup${S.snapAt ? ` · ${esc(source.clock(S.snapAt * 1000))}` : ""}</span>`
    : S.loaded ? (S.online ? `<span class="st up"><i></i><b>${c.up}</b>&nbsp;running</span>${c.down ? `<span class="st down"><i></i><b>${c.down}</b>&nbsp;stopped</span>` : ""}${c.starting ? `<span class="st starting"><i></i>${c.starting} starting</span>` : ""}` : `<span class="st down"><i></i>PC offline</span>`) : `<span class="st"><i></i>Checking…</span>`;
  $("#summary").innerHTML = summary;
  $("#rail-summary").innerHTML = summary;
  const title = S.route === "home" ? "MK Launcher" : TITLES[S.route];
  const name = BACKUP ? "MK Launcher Backup" : "MK Launcher";
  $("#title").textContent = S.q ? "Search" : title;
  $("#title").classList.toggle("wordmark", !S.q && S.route === "home");
  document.title = S.route === "home" ? name : `${title} · ${name}`;
  $$("[data-route]").forEach((a) => a.setAttribute("aria-current", a.dataset.route === S.route && !S.q ? "page" : "false"));
  const showDock = ["home", "apps"].includes(S.route) || S.q;
  $(".dock-search").style.display = showDock ? "" : "none";
}

function render() {
  renderShell();
  const view = $("#view");
  S.after = [];
  document.documentElement.classList.toggle("route-connect", S.route === "connect");
  const head = S.q || S.route === "home" || S.route === "reels" || S.route === "connect" ? "" : `<h1 class="page-title">${esc(TITLES[S.route])}</h1>`;
  if (S.q || S.route !== "reels") reels.unmount();
  C.hideTip(); // the charts it pointed at are about to be replaced
  view.innerHTML = S.q ? searchView() : head + views[S.route]();
  runAfter();
}
function runAfter() {
  const jobs = S.after;
  S.after = [];
  jobs.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
}

// ---------- data ----------
async function loadApps() {
  const d = await api("/api/apps");
  S.apps = d.apps; S.groups = d.groups; S.canStart = d.can_start; S.pins = d.pins; S.recents = d.recents; S.client = d.client;
  S.publicOrigin = d.public_origin; S.backupUrl = d.backup_url; S.selfRepo = d.self_repo || "";
  S.byId = Object.fromEntries(S.apps.map((a) => [a.id, a]));
  if (!BACKUP) localSet("apps", d);
}
async function loadStatus(fresh = false) {
  try {
    const d = await api(`/api/status${fresh ? "?fresh=1" : ""}`);
    S.status = d.apps; S.online = !BACKUP; S.loaded = true;
    if (!BACKUP) { localSet("status", d.apps); localSet("savedAt", Date.now()); }
  } catch {
    S.online = false; S.loaded = true;
  }
}
async function loadGithub() {
  try { S.github = await api("/api/github"); if (!BACKUP) localSet("github", S.github); if (["github", "changes", "home"].includes(S.route) && !$("#panel").classList.contains("on")) render(); }
  catch { /* keep cached */ }
}
async function loadShots() {
  try {
    const [latest, changes] = await Promise.all([api("/api/shots/latest"), api("/api/shots/changes")]);
    S.shots = { latest: latest.latest, changes: changes.changes, state: changes.state };
    if (["changes", "home"].includes(S.route) && !$("#panel").classList.contains("on")) render();
  } catch { /* optional */ }
}
async function loadPc() { if (BACKUP) return; try { S.pc = await api("/api/pc"); if (S.route === "pc" && !S.files) render(); } catch { /* optional */ } }
async function loadOverview() { try { S.overview = await api("/api/history/overview"); if (S.route === "pc") render(); } catch { /* optional */ } }

let pollTimer;
function schedulePoll(ms) {
  clearTimeout(pollTimer);
  if (BACKUP) return; // the snapshot has no live status to poll
  pollTimer = setTimeout(async () => {
    if (document.visibilityState === "visible") {
      const before = JSON.stringify(Object.fromEntries(Object.entries(S.status).map(([k, v]) => [k, v.state])));
      await loadStatus();
      const after = JSON.stringify(Object.fromEntries(Object.entries(S.status).map(([k, v]) => [k, v.state])));
      if (before !== after) {
        renderShell();
        // Reels and Settings show no app status: never redraw them under his thumb
        if (!S.q && !["reels", "settings"].includes(S.route)) { S.after = []; $("#view").innerHTML = views[S.route](); runAfter(); }
        if (S.panelApp) refreshPanelStatus();
      }
    }
    const starting = Object.values(S.status).some((v) => v.state === "starting");
    schedulePoll(starting ? 2000 : 10000);
  }, ms);
}
function fastPoll() { schedulePoll(1500); }
function refreshPanelStatus() {
  const app = S.byId[S.panelApp];
  const btnZone = $("#panel .btns");
  if (app && btnZone && stateOf(app) !== "starting") appPanel(S.panelApp);
}

function route() {
  const h = location.hash.replace(/^#\/?/, "").split("?")[0];
  S.route = ROUTES.includes(h) ? h : "home";
  if (S.route === "connect" && !BACKUP) S.route = "home";
  if (BACKUP && S.route !== "connect" && !source.token()) S.route = "connect";
  if (S.route !== "pc") S.files = null;
  S.q = "";
  $$(".search input").forEach((i) => { i.value = ""; });
  window.scrollTo(0, 0);
  render();
  if (S.route === "pc") { loadPc(); loadOverview(); }
  if (S.route === "github" || S.route === "changes") loadGithub();
  if (S.route === "changes") loadShots();
}

// ---------- events ----------
function bind() {
  document.addEventListener("click", (e) => {
    const openLink = e.target.closest("a[data-open]");
    if (openLink && !e.defaultPrevented) {
      if (S.longPressed) { e.preventDefault(); S.longPressed = false; return; }
      recordRecent(openLink.dataset.open);
      return;
    }
    const a = e.target.closest("[data-act]");
    if (a) { e.preventDefault(); act(a.dataset.act, a); return; }
    const d = e.target.closest("[data-detail]");
    if (d && !e.target.closest("a, button")) appPanel(d.dataset.detail);
  });
  document.addEventListener("keydown", (e) => {
    if (S.route === "reels" && !S.q && reels.keydown(e)) { e.preventDefault(); return; }
    const typing = e.target.matches("input, textarea, select");
    if (e.key === "Escape") {
      if ($("#panel").classList.contains("on")) { closePanel(); return; }
      if (S.q) { setQuery(""); e.target.blur?.(); return; }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); focusSearch(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === "\\") { e.preventDefault(); act("rail"); return; }
    if (e.key === "Enter" && !typing && e.target.matches("[data-detail], [data-act][role=button]")) { e.target.click(); return; }
    if (S.q && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      S.sel = Math.max(0, Math.min((S.results?.length || 1) - 1, S.sel + (e.key === "ArrowDown" ? 1 : -1)));
      $("#view").innerHTML = searchView();
      $(`[data-index="${S.sel}"]`)?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (S.q && e.key === "Enter" && typing && e.target.matches(".search input")) { e.preventDefault(); openResult(S.sel, e.shiftKey); return; }
    if (typing || e.ctrlKey || e.metaKey || e.altKey || $("#panel").classList.contains("on")) return;
    if (/^[1-9]$/.test(e.key)) {
      const app = S.byId[S.pins[Number(e.key) - 1]];
      if (app) { openApp(app); if (!pcOnly(app)) toast(`Opening ${app.name}`); }
      return;
    }
    if (e.key.length === 1 && !["reels", "settings"].includes(S.route) && window.matchMedia("(min-width: 760px)").matches) {
      e.preventDefault();
      focusSearch(e.key);
    }
  });
  $$(".search input").forEach((input) => {
    input.addEventListener("input", () => setQuery(input.value));
  });
  // long-press opens details on touch; right-click on desktop
  let timer = null, startX = 0, startY = 0;
  document.addEventListener("pointerdown", (e) => {
    const t = e.target.closest("[data-id].tile, [data-detail]");
    if (!t || e.pointerType === "mouse") return;
    startX = e.clientX; startY = e.clientY;
    timer = setTimeout(() => { S.longPressed = true; navigator.vibrate?.(10); appPanel(t.dataset.id || t.dataset.detail); }, 450);
  });
  const cancel = (e) => { if (timer && (!e || Math.hypot(e.clientX - startX, e.clientY - startY) > 8 || e.type !== "pointermove")) { clearTimeout(timer); timer = null; } };
  document.addEventListener("pointermove", cancel);
  document.addEventListener("pointerup", () => { clearTimeout(timer); timer = null; setTimeout(() => { S.longPressed = false; }, 400); });
  document.addEventListener("pointercancel", () => { clearTimeout(timer); timer = null; });
  document.addEventListener("contextmenu", (e) => {
    const t = e.target.closest("[data-id].tile, [data-detail]");
    if (t && S.byId[t.dataset.id || t.dataset.detail]) { e.preventDefault(); appPanel(t.dataset.id || t.dataset.detail); }
  });
  document.addEventListener("change", (e) => {
    if (e.target.matches('[data-act="stats-repo"]')) {
      S.statsRepo = e.target.value;
      const el = $("#ch-lines");
      if (el) el.innerHTML = `<div class="skeleton" style="height:150px"></div>`;
      loadLines(S.statsRepo);
    }
  });
  window.addEventListener("hashchange", route);
  window.addEventListener("scroll", () => $(".topbar").classList.toggle("scrolled", window.scrollY > 4), { passive: true });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { if (BACKUP) refreshBackup(); else loadStatus().then(() => { renderShell(); }); } });
  document.addEventListener("submit", (e) => {
    if (e.target.id !== "connect-form") return;
    e.preventDefault();
    connectWith($("#key").value, "own");
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyTheme);
}
function focusSearch(initial) {
  const input = window.matchMedia("(min-width: 760px)").matches ? $("#q-desk") : $("#q-phone");
  input.focus();
  if (initial) { input.value += initial; setQuery(input.value); }
}
function setQuery(v) {
  S.q = v;
  S.sel = 0;
  $$(".search input").forEach((i) => { if (i.value !== v) i.value = v; });
  renderShell();
  if (!S.pc && v) loadPc();
  $("#view").innerHTML = v ? searchView() : views[S.route]();
  runAfter();
}

function shell() {
  const nav = (cls, list = NAV) => list.map(([r, label, icon]) => `<a class="${cls}" href="#/${r}" data-route="${r}" title="${label}">${g(icon)}<span>${label}</span></a>`).join("");
  $("#app").innerHTML = `
    <aside class="rail" aria-label="Sections">
      <div class="brand"><img class="logo" src="icons/${BACKUP ? "backup" : "icon"}.svg" alt="MK Launcher"><b class="wordmark">MK Launcher${BACKUP ? `<span class="edition">Backup</span>` : ""}</b><button class="icon-btn rail-toggle" data-act="rail" aria-label="Hide sidebar" title="Hide sidebar (Ctrl+\\)">${g("panel-left-close")}</button></div>
      <nav>${nav("nav")}<a class="nav" href="news/" title="MK News">${g("news")}<span>MK News</span></a></nav>
      <div class="foot"><div id="rail-summary" class="summary"></div>
        <div class="row-btns"><button class="icon-btn" data-act="theme" aria-label="Change theme">${g("sun-moon")}</button><button class="icon-btn" data-act="phone" aria-label="Put it on your phone">${g("phone")}</button></div></div>
    </aside>
    <header class="topbar"><div class="topbar-row">
      <div class="phone-only"><h1 class="title" id="title">MK Launcher</h1><div class="summary" id="summary"></div></div>
      <div class="desk-only desk-search"><label class="search">${g("search")}<span class="sr">Search</span><input id="q-desk" type="search" placeholder="Search apps, programs and repos" autocomplete="off" spellcheck="false"><span class="kbd">Ctrl K</span></label></div>
      <span class="spacer"></span><a class="icon-btn phone-only" href="news/" aria-label="MK News">${g("news")}</a></div></header>
    <main id="view" tabindex="-1"></main>
    <div class="dock-search"><label class="search">${g("search")}<span class="sr">Search</span><input id="q-phone" type="search" placeholder="Search everything" autocomplete="off" spellcheck="false" enterkeyhint="go"></label></div>
    <nav class="tabbar" aria-label="Sections">${nav("tab", TABS)}</nav>`;
}

async function boot() {
  applyTheme();
  shell();
  applyRail();
  bind();
  if (BACKUP) return bootBackup();
  const cached = localGet("apps", null);
  if (cached) {
    S.apps = cached.apps; S.groups = cached.groups; S.canStart = cached.can_start; S.pins = cached.pins; S.recents = cached.recents; S.client = cached.client || { pc: false };
    S.byId = Object.fromEntries(S.apps.map((a) => [a.id, a]));
    S.status = localGet("status", {});
    S.github = localGet("github", null);
  }
  route();
  try { await loadApps(); } catch { S.online = false; S.loaded = true; }
  await loadStatus(true);
  render();
  schedulePoll(10000);
  loadGithub(); loadShots(); loadPc(); loadOverview();
  setInterval(() => { if (document.visibilityState === "visible") { loadOverview(); loadShots(); } }, 120000);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}

// ---------- the backup (GitHub Pages copy) ----------
views.connect = function connectView() {
  const e = S.connectError;
  const cinema = S.cinemaOk;
  return `<section class="connect" aria-labelledby="connect-h">
    <div class="connect-card">
      <img class="connect-logo" src="icons/backup.svg" alt="">
      <h1 id="connect-h">Open your launcher backup</h1>
      <p class="connect-lede">When your PC is off, this copy on GitHub shows what was last true: your apps and their status, what changed, and your reels. Paste a read-only GitHub key once.</p>
      ${cinema ? `<button class="btn primary wide" type="button" data-act="connect-cinema">${g("sparkles")}Use my MK Cinema key</button>
        <p class="connect-or"><span>or paste a new key</span></p>` : ""}
      <form id="connect-form" autocomplete="off">
        <label for="key">GitHub key</label>
        <input id="key" type="password" placeholder="github_pat_…" autocapitalize="none" spellcheck="false" required aria-describedby="key-help${e ? " key-error" : ""}"${e ? ' aria-invalid="true"' : ""}>
        <p id="key-help" class="sub">Stored only in this browser. It can only read the snapshot.</p>
        ${e ? `<p class="connect-error" id="key-error" role="alert">${g("alert")}<span>${esc(e)}</span></p>` : ""}
        <button class="btn ${cinema ? "" : "primary "}wide" type="submit"${S.connecting ? " disabled" : ""}>${S.connecting ? "Checking…" : e ? "Try again" : "Connect"}</button>
      </form>
      <section class="connect-steps" aria-label="How to make the key"><h2>Make the key</h2><ol>
        <li><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">New fine-grained token ${g("external")}</a></li>
        <li>Repository access: <b>Only select repositories</b>, then <b>${esc(source.REPO_NAME)}</b></li>
        <li>Permissions, Contents: <b>Read-only</b>. Generate it, copy it, paste it above.</li></ol></section>
    </div></section>`;
};

function showConnect(error = "") {
  S.connectError = error;
  if (location.hash !== "#/connect") location.hash = "#/connect";
  else route();
  const mkc = source.cinemaToken();
  if (mkc && S.cinemaOk == null) {
    S.cinemaOk = false;
    source.tryKey(mkc).then((r) => { S.cinemaOk = r.ok; if (S.route === "connect") render(); });
  }
}
async function connectWith(value, from) {
  if (S.connecting) return;
  S.connecting = true; S.connectError = ""; render();
  const r = await source.tryKey(from === "mkc" ? source.cinemaToken() : value);
  S.connecting = false;
  if (!r.ok) { S.connectError = r.message; render(); $("#key")?.focus(); return; }
  try { source.saveToken(value, from); } catch (e) { S.connectError = e.message; render(); return; }
  toast(from === "mkc" ? "Connected with your MK Cinema key" : "Connected");
  location.hash = "#/home";
  await refreshBackup(true);
}
async function loadAllFromSnapshot() {
  await loadApps();
  await loadStatus();
  await Promise.all([loadGithub(), loadOverview()]);
  S.snapAt = source.snapshotAt();
  S.liveOrigin = source.liveOrigin();
  S.loaded = true;
  if (S.route !== "connect") render();
  loadShots();
}
let backupBusy = false;
async function refreshBackup(first = false) {
  if (backupBusy || !source.token()) return;
  backupBusy = true;
  try {
    const before = source.snapshotAt();
    await source.fetchSnapshot();
    if (first || source.snapshotAt() !== before) await loadAllFromSnapshot();
  } catch (e) {
    if (e.code === "token" || e.code === "access") showConnect(e.message);
    else if (!source.snapshotAt()) { S.loaded = true; toast(e.message); render(); }
    else if (first) toast(`${e.message}. Showing the copy on this device.`);
  } finally { backupBusy = false; }
}
async function probeLoop() {
  if (document.visibilityState === "visible" && source.liveOrigin()) {
    const back = await source.probeLive();
    if (back !== !!S.pcBack) { S.pcBack = back; if (!["reels", "connect"].includes(S.route) && !S.q) render(); }
  }
  setTimeout(probeLoop, S.pcBack ? 120000 : 45000);
}
async function bootBackup() {
  document.documentElement.classList.add("backup");
  S.online = false;
  if (await source.cachedSnapshot()) await loadAllFromSnapshot().catch(() => {});
  if (!source.token()) { S.loaded = true; showConnect(); }
  else { route(); await refreshBackup(true); }
  setInterval(() => { if (document.visibilityState === "visible") refreshBackup(); }, 5 * 60e3);
  setTimeout(probeLoop, 4000);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}

boot();

