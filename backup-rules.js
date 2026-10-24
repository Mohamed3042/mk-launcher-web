// The backup's rules, with no DOM: which mode the page is in, what needs the PC (and why), how old the
// snapshot is in plain words, and how each launcher API call is answered from the snapshot.
// Tested with node --test (tests/web/backup.test.mjs).

export const SNAPSHOT_REPO = "mk-launcher-snapshot";
export const BACKUP_URL = "https://mohamed3042.github.io/mk-launcher-web/";

export const REASON = {
  start: "Starting an app needs your PC, and it's offline.",
  open: "This app runs on your PC. It opens again when your PC is back.",
  pc: "Programs and folders live on your PC. They come back with it.",
  snap: "Screenshots are taken on your PC.",
  pins: "Pins are saved on your PC. Change them when it's back.",
  refresh: "GitHub refreshes through your PC.",
  stats: "Line counts come from your PC.",
  health: "The full health history is kept on your PC.",
  save: "Saving for later needs your PC.",
  settings: "Shared choices are saved on your PC. Change them when it's back.",
  news: "Checking for new stories needs your PC.",
  default: "This needs your PC, and it's offline.",
};

export const ERRORS = {
  token: "That key is wrong or has expired",
  access: "This key can't see the snapshot repo",
  "rate-limit": "GitHub's request limit is reached. Try again in a while.",
  offline: "You're offline",
  "github-unreachable": "GitHub can't be reached",
  invalid: "The snapshot isn't readable",
  "no-snapshot": "No snapshot on this device yet",
};

export class NeedsPc extends Error {
  constructor(key = "default") {
    super(REASON[key] || REASON.default);
    this.name = "NeedsPc";
    this.code = "needs-pc";
    this.key = REASON[key] ? key : "default";
  }
}

// The published copy carries <meta name="mkl-mode" content="backup">; the PC's own copy never does.
export function chooseMode(marker) {
  return marker === "backup" ? "backup" : "live";
}

export function isPcHost(host) {
  host = String(host || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (host === "localhost" || /\.(ts\.net|local|lan|internal)$/.test(host)) return true;
  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return host.includes(":"); // a bare IPv6 address is the PC's or the tailnet's
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
}

// Apps that run on the PC grey out in the backup; public sites, GitHub and Claude pages stay live.
export function needsPc(app) {
  if (!app || app.type === "page") return false;
  if (typeof app.needs_pc === "boolean") return app.needs_pc;
  try { return isPcHost(new URL(app.url).hostname); } catch { return true; }
}

// "17:48 (2 hours ago)", "yesterday at 17:48 (19 hours ago)", "on Tue 21 Oct at 17:48 (3 days ago)"
export function agoWords(ms, now = Date.now()) {
  const s = Math.max(0, (now - ms) / 1000);
  const n = (v, w) => `${v} ${w}${v === 1 ? "" : "s"} ago`;
  if (s < 60) return "just now";
  if (s < 3600) return n(Math.floor(s / 60), "minute");
  if (s < 86400) return n(Math.floor(s / 3600), "hour");
  return n(Math.floor(s / 86400), "day");
}
export function clock(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
export function whenWords(at, now = Date.now()) {
  const ms = at < 2e10 ? at * 1000 : at;
  const d = new Date(ms), today = new Date(now), yest = new Date(now - 86400000);
  const day = sameDay(d, today) ? "at" : sameDay(d, yest) ? "yesterday at"
    : `on ${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} at`;
  return `${day} ${clock(ms)} (${agoWords(ms, now)})`;
}
export function bannerText(at, now = Date.now()) {
  return `Your PC is offline. Showing what was true ${whenWords(at, now)}.`;
}

export function classify(status, remaining) {
  if (status === 403 && remaining === "0") return "rate-limit";
  if (status === 401 || status === 403) return "token";
  if (status === 404) return "access";
  return "github-unreachable";
}
export function cleanToken(t) {
  t = typeof t === "string" ? t.trim() : "";
  return t && !/[\s\r\n]/.test(t) && t.length < 400 ? t : "";
}

const http = (u) => typeof u === "string" && /^https?:\/\//i.test(u);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);

// The snapshot comes from his own private repo, but it is still checked: right shape, http(s) links only.
export function validateSnapshot(data) {
  if (!data || data.schema !== 1 || !Number.isFinite(data.at)) throw Object.assign(new Error(ERRORS.invalid), { code: "invalid" });
  const apps = obj(data.apps);
  const list = arr(apps.apps).filter((a) => a && typeof a.id === "string" && typeof a.name === "string" && http(a.url))
    .map((a) => ({ ...a, alt: arr(a.alt).filter((l) => http(l?.url)), repo: http(a.repo) ? a.repo : undefined }));
  const repos = arr(obj(data.github).repos).filter((r) => r && typeof r.name === "string" && http(r.url))
    .map((r) => ({ ...r, pages: http(r.pages) ? r.pages : "", homepage: http(r.homepage) ? r.homepage : "",
      recent: arr(r.recent).filter((c) => !c.url || http(c.url)), releases: arr(r.releases).filter((x) => http(x?.url)) }));
  const shotPath = (p) => typeof p === "string" && /^shots\/[A-Za-z0-9._-]+\.jpg$/.test(p);
  const shot = (s) => (s && shotPath(s.src) ? s : null);
  const latest = {};
  for (const [id, sizes] of Object.entries(obj(obj(data.shots).latest))) {
    for (const [size, s] of Object.entries(obj(sizes))) if (shot(s)) (latest[id] ||= {})[size] = s;
  }
  const changes = arr(obj(data.shots).changes).filter((c) => shot(c) && shot(c.before));
  const reels = obj(data.reels);
  const news = data.news ? obj(data.news) : null;
  const linkOk = (it) => it && http(it.url) && (!it.image || http(it.image));
  return {
    ...data,
    launcher: obj(data.launcher),
    apps: { groups: arr(apps.groups), apps: list, can_start: obj(apps.can_start), pins: arr(apps.pins), recents: arr(apps.recents) },
    status: { apps: obj(obj(data.status).apps) },
    overview: obj(data.overview),
    github: { ...obj(data.github), repos, calendar: arr(obj(data.github).calendar) },
    shots: { latest, changes },
    reels: { ...reels, items: arr(reels.items).filter(linkOk), seen: arr(reels.seen), settings: obj(reels.settings), topics: arr(reels.topics) },
    news: news && { ...news, feed: arr(news.feed).filter(linkOk), repos: Object.fromEntries(Object.entries(obj(news.repos)).map(([k, v]) => [k, arr(v).filter(linkOk)])) },
    saved: arr(data.saved),
  };
}

function query(path) {
  const i = path.indexOf("?");
  return { route: i < 0 ? path : path.slice(0, i), q: Object.fromEntries(new URLSearchParams(i < 0 ? "" : path.slice(i + 1))) };
}

// GET: what the PC's API would have said, from the snapshot. `local` holds this device's own marks (seen reels).
export function backupRead(snap, path, local = {}) {
  const { route, q } = query(path);
  const news = snap.news;
  switch (route) {
    case "/api/health":
      return { ok: true, version: snap.health?.version, time: snap.at, update: snap.health?.update || {}, backup: { snapshot: { pushed_at: snap.at } }, from: "snapshot" };
    case "/api/apps":
      return { version: snap.launcher.version, client: { pc: false }, host: null, public_origin: snap.launcher.origin || "",
        backup_url: snap.launcher.backup_url || BACKUP_URL, self_repo: snap.launcher.self_repo || "",
        groups: snap.apps.groups, apps: snap.apps.apps, can_start: snap.apps.can_start, pins: snap.apps.pins, recents: snap.apps.recents };
    case "/api/status": return { checked: snap.at, apps: snap.status.apps };
    case "/api/github": return snap.github;
    case "/api/history/overview": return snap.overview;
    case "/api/shots/latest": return { latest: snap.shots.latest, state: {} };
    case "/api/shots/changes": return { changes: snap.shots.changes, state: {} };
    case "/api/shots": {
      const all = new Map();
      for (const s of Object.values(snap.shots.latest[q.app] || {})) all.set(s.id, s);
      for (const c of snap.shots.changes) if (c.app === q.app) { all.set(c.id, c); all.set(c.before.id, c.before); }
      const list = [...all.values()].filter((s) => !q.size || s.size === q.size).sort((a, b) => b.t - a.t);
      return { shots: list.map(({ before, boxes, ...s }) => s) };
    }
    case "/api/reels": {
      const seen = new Set([...(snap.reels.seen || []), ...(local.seen || [])]);
      if (local.reset) for (const id of snap.reels.seen || []) if (!(local.seen || []).includes(id)) seen.delete(id);
      return { ...snap.reels, seen: snap.reels.items.map((r) => r.id).filter((id) => seen.has(id)), lines: { pending: 0 } };
    }
    case "/api/settings": return { reels: snap.reels.settings };
    case "/api/news/saved": return { items: snap.saved };
    case "/api/news/feed": {
      if (!news) throw new NeedsPc("news");
      let items = news.feed;
      if (q.kind) items = items.filter((x) => x.kind === q.kind);
      if (q.tag) items = items.filter((x) => (x.tags || []).includes(q.tag));
      return { items: items.slice(0, Number(q.limit || 80)) };
    }
    case "/api/news/charts": if (!news) throw new NeedsPc("news"); return news.charts || {};
    case "/api/news/status": if (!news) throw new NeedsPc("news"); return { ...(news.status || {}), refreshing: false };
    case "/api/news/repos": if (!news) throw new NeedsPc("news"); return { items: (news.repos?.[q.list || "today"] || []).slice(0, Number(q.limit || 25)) };
    case "/api/pc": case "/api/files": case "/api/files/raw": throw new NeedsPc("pc");
    case "/api/history": throw new NeedsPc("health");
    case "/api/github/stats": throw new NeedsPc("stats");
    default: throw new NeedsPc();
  }
}

// POST: only this device's own marks work without the PC; everything else says why it can't.
const WRITE_REASON = { "/api/start": "start", "/api/pins": "pins", "/api/pc/open": "pc", "/api/files/open": "pc",
  "/api/github/refresh": "refresh", "/api/shots/snap": "snap", "/api/news/save": "save", "/api/news/unsave": "save",
  "/api/news/refresh": "news", "/api/settings": "settings" };
export function backupWrite(path, body, local) {
  const { route } = query(path);
  if (route === "/api/reels/seen") {
    local.seen = [...new Set([...(local.seen || []), ...(Array.isArray(body?.ids) ? body.ids.map(String) : [])])].slice(-2000);
    return { ok: true, seen: local.seen.length };
  }
  if (route === "/api/reels/reset") { local.seen = []; local.reset = true; return { ok: true }; }
  if (route === "/api/recent") return { ok: true, local: true };
  throw new NeedsPc(WRITE_REASON[route] || "default");
}
