// Where the launcher's data comes from.
// Live (the PC's own copy): the PC's API, as always.
// Backup (the GitHub Pages copy): the last snapshot the PC pushed to a private repo, read with a
// read-only token pasted once on this device. The token lives in localStorage and is sent only in
// the Authorization header to api.github.com; it never goes into a URL, a cache key or a log.
import * as R from "./backup-rules.js";

const meta = (n) => globalThis.document?.querySelector(`meta[name="${n}"]`)?.content || "";
export const MODE = R.chooseMode(meta("mkl-mode"));
export const BACKUP = MODE === "backup";
export const { REASON, NeedsPc, needsPc, bannerText, whenWords, clock, BACKUP_URL } = R;
const REPO = meta("mkl-snapshot") || `Mohamed3042/${R.SNAPSHOT_REPO}`;
export const REPO_NAME = REPO.split("/").pop();
const CONTENTS = `https://api.github.com/repos/${REPO}/contents/`;
const DATA_CACHE = "mkl-backup-data-v1";
const SHOT_CACHE = "mkl-backup-shots-v1";
const K = { token: "mkl.token", from: "mkl.tokenFrom", etag: "mkl.backup.etag", local: "mkl.backup.local", cinema: "mkc.token" };
const here = (p) => new URL(p, globalThis.location?.href || "http://localhost/").href;

export class SourceError extends Error {
  constructor(code) { super(R.ERRORS[code] || R.ERRORS.invalid); this.name = "SourceError"; this.code = code; }
}

const B = { snap: null, urls: new Map(), pending: new Map() };
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* blocked */ } },
};

// ---------- the key ----------
export function token() { return R.cleanToken(ls.get(K.from) === "mkc" ? ls.get(K.cinema) : ls.get(K.token)); }
export function tokenFrom() { return token() ? (ls.get(K.from) === "mkc" ? "mkc" : "own") : ""; }
export function cinemaToken() { return R.cleanToken(ls.get(K.cinema)); }
export function saveToken(value, from = "own") {
  if (from === "mkc") { ls.del(K.token); return ls.set(K.from, "mkc"); }
  const t = R.cleanToken(value);
  if (!t) throw new SourceError("token");
  ls.del(K.from);
  return ls.set(K.token, t);
}
// Forget this launcher's key and everything it read. MK Cinema's own key is left alone.
export async function forget() {
  ls.del(K.token); ls.del(K.from); ls.del(K.etag); ls.del(K.local);
  for (const u of B.urls.values()) URL.revokeObjectURL(u);
  B.urls.clear(); B.snap = null;
  try { await Promise.all([caches.delete(DATA_CACHE), caches.delete(SHOT_CACHE)]); } catch { /* no Cache Storage */ }
}

async function gh(path, { tok = token(), etag } = {}) {
  if (globalThis.navigator?.onLine === false) throw new SourceError("offline");
  const t = R.cleanToken(tok);
  if (!t) throw new SourceError("token");
  const headers = { Authorization: `Bearer ${t}`, Accept: "application/vnd.github.raw", "X-GitHub-Api-Version": "2022-11-28" };
  if (etag) headers["If-None-Match"] = etag;
  let res;
  try {
    res = await fetch(CONTENTS + path.split("/").map(encodeURIComponent).join("/"),
      { headers, cache: "no-store", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" });
  } catch { throw new SourceError(globalThis.navigator?.onLine === false ? "offline" : "github-unreachable"); }
  if (res.status === 304) return null;
  if (!res.ok) throw new SourceError(R.classify(res.status, res.headers.get("x-ratelimit-remaining")));
  return res;
}

// Can this key read the snapshot? (Used for "Use my MK Cinema key" and before saving a pasted key.)
export async function tryKey(value) {
  try { await gh("snapshot.json", { tok: value }); return { ok: true }; }
  catch (e) { return { ok: false, code: e.code || "github-unreachable", message: e.message }; }
}

// ---------- the snapshot ----------
async function readCached() {
  try {
    const c = await caches.open(DATA_CACHE);
    const hit = await c.match(here("./_backup/snapshot.json"));
    return hit ? R.validateSnapshot(await hit.json()) : null;
  } catch { return null; }
}
export async function cachedSnapshot() {
  if (!B.snap) B.snap = await readCached();
  return B.snap;
}
// Fresh from GitHub when it changed (ETag), else the copy on this device.
export async function fetchSnapshot() {
  const res = await gh("snapshot.json", { etag: B.snap || (await cachedSnapshot()) ? ls.get(K.etag) : null });
  if (!res) return B.snap;
  let data;
  try { data = R.validateSnapshot(await res.json()); } catch { throw new SourceError("invalid"); }
  B.snap = data;
  const etag = res.headers.get("etag");
  if (etag) ls.set(K.etag, etag);
  try {
    const c = await caches.open(DATA_CACHE);
    await c.put(here("./_backup/snapshot.json"), new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } }));
  } catch { /* storage full or blocked: it still works for this visit */ }
  return data;
}
export const snapshotAt = () => B.snap?.at || 0;
export const liveOrigin = () => B.snap?.launcher?.origin || "";

// ---------- pictures (private, so fetched with the key and shown as blob: URLs) ----------
async function picture(path) {
  if (B.urls.has(path)) return B.urls.get(path);
  if (B.pending.has(path)) return B.pending.get(path);
  const job = (async () => {
    const key = here(`./_backup/${path}`);
    let blob = null, cache = null;
    try { cache = await caches.open(SHOT_CACHE); const hit = await cache.match(key); if (hit) blob = await hit.blob(); } catch { /* none */ }
    if (!blob) {
      const res = await gh(path);
      blob = await res.blob();
      const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
      if (!(head[0] === 0xff && head[1] === 0xd8)) throw new SourceError("invalid"); // JPEG only
      blob = new Blob([blob], { type: "image/jpeg" });
      try { await cache?.put(key, new Response(blob, { headers: { "Content-Type": "image/jpeg" } })); } catch { /* full */ }
    }
    const url = URL.createObjectURL(blob);
    B.urls.set(path, url);
    return url;
  })().finally(() => B.pending.delete(path));
  B.pending.set(path, job);
  return job;
}
async function pool(jobs, n = 6) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, async () => { while (i < jobs.length) { const j = i++; out[j] = await jobs[j]().catch(() => null); } }));
  return out;
}
// Swap every snapshot picture path for a blob: URL; a picture that can't load is dropped.
async function withPictures(route, data) {
  const shots = [];
  if (route === "/api/shots/latest") for (const sizes of Object.values(data.latest)) shots.push(...Object.values(sizes));
  else if (route === "/api/shots/changes") for (const c of data.changes) shots.push(c, c.before);
  else if (route === "/api/shots") shots.push(...data.shots);
  const paths = [...new Set(shots.map((s) => s.src))];
  const urls = new Map((await pool(paths.map((p) => () => picture(p)))).map((u, i) => [paths[i], u]));
  const fix = (s) => (urls.get(s.src) ? { ...s, src: urls.get(s.src), thumb: urls.get(s.src) } : null);
  if (route === "/api/shots/latest") {
    const latest = {};
    for (const [id, sizes] of Object.entries(data.latest)) for (const [size, s] of Object.entries(sizes)) { const f = fix(s); if (f) (latest[id] ||= {})[size] = f; }
    return { ...data, latest };
  }
  if (route === "/api/shots/changes") return { ...data, changes: data.changes.map((c) => { const a = fix(c), b = fix(c.before); return a && b ? { ...a, before: b } : null; }).filter(Boolean) };
  return { shots: data.shots.map(fix).filter(Boolean) };
}

// ---------- the launcher API, answered from the snapshot ----------
function readLocal() { try { return JSON.parse(ls.get(K.local) || "{}") || {}; } catch { return {}; } }
export async function backupApi(path, opts = {}) {
  const method = String(opts.method || "GET").toUpperCase();
  if (method !== "GET") {
    const local = readLocal();
    let body = {};
    try { body = JSON.parse(opts.body || "{}"); } catch { /* none */ }
    const out = R.backupWrite(path, body, local);
    ls.set(K.local, JSON.stringify(local));
    return out;
  }
  const snap = await cachedSnapshot();
  if (!snap) throw new SourceError("no-snapshot");
  const data = R.backupRead(snap, path, readLocal());
  const route = path.split("?")[0];
  return route.startsWith("/api/shots") ? withPictures(route, data) : data;
}

// Is the live launcher answering again? A no-cors request only tells "reachable or not", which is all we need.
export async function probeLive() {
  const origin = liveOrigin();
  if (!origin || globalThis.navigator?.onLine === false) return false;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);
  try {
    await fetch(`${origin}/api/health`, { mode: "no-cors", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: ctl.signal });
    return true;
  } catch { return false; } finally { clearTimeout(timer); }
}
