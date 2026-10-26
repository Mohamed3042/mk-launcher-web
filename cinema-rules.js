// Cinema's rules, with no DOM: pairing a film with its Arabic twin, sorting, filtering, the plain words for time
// and for a running job, and what the portfolio shows now. Tested with node --test (tests/web/cinema.test.mjs).

export const MAX_CUTS = 8;
const ARABIC = /[؀-ۿݐ-ݿ]/;

export const isArabic = (f) => f?.lang === "ar" || (!f?.lang && ARABIC.test(f?.title || ""));

// "Solution Machine (extended, Arabic) v2.2" and "Solution Machine (extended) v2.2" share one key; so do
// "CRM & Marketing, Arabic-led cut (demo · عربي)" and "CRM & Marketing (demo)".
export function filmKey(title) {
  let t = String(title || "");
  t = t.replace(/[؀-ۿݐ-ݿ]+/g, " ");
  t = t.replace(/\barabic(?:[-\s]led(?:\s+cut)?)?\b/gi, " ");
  t = t.replace(/\(([^)]*)\)/g, (_, inner) => {
    const parts = inner.split(/\s*[,·]\s*/).map((x) => x.trim()).filter(Boolean);
    return parts.length ? `(${parts.join(", ")})` : "";
  });
  t = t.replace(/\s*,\s*(?=\()/g, " ").replace(/[\s,·]+$/, "").replace(/\s+/g, " ").trim().toLowerCase();
  return t;
}

const bestOf = (members) => members.find((f) => f.cuts?.ranked)?.cuts.best ?? null; // the main film's score, else its twin's

// One choice per film; a film and its Arabic twin are one choice with both inside.
export function pairFilms(films) {
  const groups = new Map();
  for (const f of films || []) {
    const k = filmKey(f.title) || f.id;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  }
  const out = [];
  for (const [key, list] of groups) {
    const en = list.find((f) => !isArabic(f)) || null;
    const ar = list.find((f) => isArabic(f)) || null;
    const used = new Set([en, ar].filter(Boolean));
    for (const f of list) if (!used.has(f)) out.push(choice(`${key}#${f.id}`, f, null));
    if (en || ar) out.push(choice(key, en, ar));
  }
  return out;
}
function choice(key, en, ar) {
  const members = [en, ar].filter(Boolean);
  const main = en || ar;
  const c = { key, en, ar, main, members, id: main.id, title: main.title, product: main.product || "", kind: main.kind || "",
    seconds: main.seconds, dir: main.dir, poster: main.poster, added: members.map((f) => f.added || "").sort().pop() };
  c.best = bestOf(members);
  c.ranked = members.some((f) => f.cuts?.ranked);
  c.langs = en && ar ? "English + Arabic" : ar ? "Arabic" : "English";
  return c;
}

// What each language's home shows when this choice is featured. A missing twin falls back to the film itself.
export const leadFor = (c) => ({ en: (c.en || c.ar).id, ar: (c.ar || c.en).id });

export function sortChoices(list, mode = "best") {
  const byNew = (a, b) => (b.added || "").localeCompare(a.added || "") || a.title.localeCompare(b.title);
  if (mode === "new") return [...list].sort(byNew);
  return [...list].sort((a, b) => (b.best ?? -1) - (a.best ?? -1) || byNew(a, b));
}

export const productName = (c) => c.product || "Other";
export function productsOf(list) {
  const n = new Map();
  for (const c of list) n.set(productName(c), (n.get(productName(c)) || 0) + 1);
  return [...n].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
export const filterChoices = (list, product) => (!product || product === "all" ? list : list.filter((c) => productName(c) === product));

// 78 -> "1:18"
export function clock(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export const span = (a, b) => `${clock(a)} – ${clock(b)}`;

// The name the public sees: the part after the dash, without "(extended…)" and the version.
export function publicName(title) {
  const t = String(title || "");
  const part = t.includes(" — ") ? t.split(" — ").slice(1).join(" — ") : t;
  return part.replace(/\s*\([^)]*\)/g, "").replace(/\s+v\d+(?:\.\d+)*\s*$/i, "").trim() || t;
}

const norm = (v) => (typeof v === "string" ? v.replace(/^site:/, "") : "");

// What one language's home shows now: the live site when it answered, else what he picked.
export function leadInfo(lang, data) {
  const live = data.live?.ok ? norm(data.live.lead?.[lang]) : "";
  const picked = norm(data.program?.lead?.[lang]);
  const id = live || picked;
  if (!id) return null;
  const film = (data.films || []).find((f) => f.id === id) || null;
  const world = (data.worlds || []).find((w) => norm(w.id) === id) || null;
  const item = data.live?.items?.[id] || null;
  // The site is newer than his pick when a pick from GitHub came after it; his old pick is then history, not "on its way".
  const mine = Date.parse(data.program?.updated), site = Date.parse(data.live?.updated);
  const passed = Number.isFinite(mine) && Number.isFinite(site) && site > mine;
  return { lang, id, film, world, item, name: item?.name || world?.name || (film ? publicName(film.title) : id),
    fromLive: !!live, pending: !!live && !!picked && live !== picked && !passed, picked };
}
// The cut ids to show under a lead: the live ones, else what he ticked, else the film's auto picks.
export function leadCuts(info, data, film) {
  if (!info) return [];
  const live = info.item?.cuts?.map((c) => c.id) || [];
  if (live.length) return live;
  const chosen = data.program?.cuts?.[info.id];
  return Array.isArray(chosen) && chosen.length ? chosen : (film?.picks || []);
}

// ---------- a running job, in plain steps ----------
const PUBLISH = [["save", "Saving the pick"], ["encode", "Cutting the clips"], ["upload", "Uploading"], ["wait", "Waiting for the site"], ["live", "Live"]];
const RANK = [["rank", "Finding the best cuts"], ["cuts", "Saving the cuts"], ["done", "Done"]];
export function stepRows(job) {
  const list = job?.kind === "rank" ? RANK : PUBLISH;
  const at = Math.max(0, list.findIndex(([k]) => k === job?.step));
  return list.map(([key, label], i) => {
    let state = i < at ? "done" : i === at ? "now" : "todo";
    if (job && !job.running && job.ok) state = "done";
    if (job && !job.running && job.ok === false && i === at) state = "fail";
    if (job && !job.running && job.ok === false && i > at) state = "todo";
    return { key, label: state === "now" && job.label ? job.label : label, state };
  });
}

export const canTick = (selected, id, max = MAX_CUTS) => selected.includes(id) || selected.length < max;
export function toggle(selected, id, max = MAX_CUTS) {
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  return selected.length < max ? [...selected, id] : selected;
}
// In film order is how a cut list reads best; his ticks keep the order he made them in only when he asked for it.
export const inFilmOrder = (ids, cuts) => [...ids].sort((a, b) => (cuts.find((c) => c.id === a)?.start ?? 0) - (cuts.find((c) => c.id === b)?.start ?? 0));

// ---------- pictures ----------
// A thumb's URL names the film's ranking (its stamp), so a cut picture cached for good is never shown for a newer ranking.
export const thumbUrl = (film, cutId) => `/api/cinema/thumb?id=${encodeURIComponent(film.id)}&cut=${encodeURIComponent(cutId)}${film.cuts?.stamp ? `&v=${encodeURIComponent(film.cuts.stamp)}` : ""}`;

// ---------- Feature on the portfolio ----------
// Why the button waits ("" when it doesn't): every film that goes public needs at least one ticked cut. `lead` is {en, ar},
// `selectedOf(id)` the ticked cut ids of a film, `shown` the film on screen (the other language may be the empty one).
export function featureBlock(lead, selectedOf, shown) {
  const ids = [...new Set(Object.values(lead))];
  const empty = ids.filter((id) => !(selectedOf(id) || []).length);
  if (!empty.length) return "";
  if (ids.length === 1 || empty.includes(shown)) return "Tick at least one cut to feature.";
  const lang = Object.keys(lead).find((l) => lead[l] === empty[0]);
  return `Tick at least one cut in the ${lang === "ar" ? "Arabic" : "English"} version too.`;
}

// ---------- watching a cut ----------
// Plays a window of the film. An iPhone only lets a film play when play() is called inside the tap and the film is muted
// and inline, so this is called straight from the tap handler: it never waits for an event to call play(); the seek to
// the window's start is the only thing that waits for the film's length. `onBlocked(err)` hears a refused play().
export function playWindow(v, src, start, end, opts = {}) {
  v.muted = opts.muted !== false;
  v.playsInline = true;
  v.setAttribute?.("playsinline", "");
  if (v._src !== src) { v._src = src; v.src = src; }
  v._start = Number(start); v._end = Number(end);
  if (v._seek) { v.removeEventListener("loadedmetadata", v._seek); v._seek = null; }
  const seek = () => { v._seek = null; try { v.currentTime = v._start; } catch { /* the length isn't known yet */ } };
  if (v.readyState >= 1) seek();
  else { v._seek = seek; v.addEventListener("loadedmetadata", seek, { once: true }); }
  if (!v._wired) {
    v._wired = true;
    v.addEventListener("timeupdate", () => { if (v._end && v.currentTime >= v._end - 0.04) v.pause(); }); // the window, then rest
  }
  const played = v.play();
  played?.catch?.((e) => { if (e?.name !== "AbortError") opts.onBlocked?.(e); }); // AbortError: another cut took over
  return played;
}

// ---------- the name and line the portfolio shows ----------
export const COPY_LIMITS = { name: 80, line: 160 };
export const cleanCopy = (value, limit) => String(value ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit).trimEnd();
// { filmId: {name, line} } for the pick; empty strings mean "the default" (the name from the title, no line)
export const copyBody = (ids, state) => Object.fromEntries(ids.map((id) => [id, {
  name: cleanCopy(state?.[id]?.name, COPY_LIMITS.name), line: cleanCopy(state?.[id]?.line, COPY_LIMITS.line) }]));
// The built-in world this name would be mistaken for on the home ("Solution Machine" vs the Solution Machine world), else null.
export function nameClash(name, worlds) {
  const key = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
  const k = key(name);
  return k ? (worlds || []).find((w) => key(w.title || w.name) === k) || null : null;
}

// ---------- phase 2: when the PC is off, GitHub changes the pick ----------
// The backup can't reach the PC, so "Use as home" and "Feature on the portfolio" open github.com on a new file in the
// portfolio's own public repository (program-requests/<time>.json on its gh-pages branch) with the pick already typed in.
// He taps Commit changes; a workflow on that branch applies the newest request to the film library's program, cuts the
// clips and updates the site. No token is kept in any browser.
export const PORTFOLIO_BRANCH = "gh-pages";
export const REQUESTS_DIR = "program-requests";
const FILM_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;
const SITE_ID = /^site:[a-z0-9][a-z0-9-]{0,40}$/;
const LIVE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,124}$/;
const OWNER_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const REPO_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const REPO_PATH = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const NOT_A_REPO = new Set(["en", "ar"]); // the language folders: a site with no repository folder in its address

// The portfolio's repository, read off the snapshot's site address (https://<owner>.github.io/<repo>/en/ -> "<Owner>/<repo>")
// so the page names no portfolio of its own. `owner` is this shell's own GitHub login in the case GitHub shows it (the
// address only has it in lower case); it has to match the address, so a portfolio on another account is never sent a
// file. "" when the address isn't a GitHub Pages project site of that owner.
export function portfolioRepo(site, owner) {
  try {
    const u = new URL(String(site));
    const host = /^([a-z0-9-]+)\.github\.io$/.exec(u.hostname);
    if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash || !host) return "";
    if (typeof owner !== "string" || !OWNER_NAME.test(owner) || owner.toLowerCase() !== host[1]) return "";
    const repo = u.pathname.split("/")[1] || "";
    return REPO_NAME.test(repo) && !NOT_A_REPO.has(repo) ? `${owner}/${repo}` : "";
  } catch { return ""; }
}

// 2026-10-26 14:30:05 UTC -> "20261026T143005Z": names sort in time order, so the newest request is the last one
export function requestStamp(now = Date.now()) {
  const d = new Date(now), p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

// Why this pick can't go to GitHub ("" when it can). `repo` is the portfolio's "Owner/name" (portfolioRepo). `films` are
// the snapshot's rows; leave them out to check the shape only.
export function githubBlock(lead, films, repo) {
  if (typeof repo !== "string" || !REPO_PATH.test(repo)) {
    return "This copy can't tell which GitHub repository your portfolio lives in.";
  }
  const langs = ["en", "ar"];
  for (const l of langs) {
    const id = lead?.[l];
    if (typeof id !== "string" || !(SITE_ID.test(id) || FILM_ID.test(id))) return "That pick can't be sent to GitHub.";
  }
  if (!films) return "";
  for (const l of langs) {
    const id = lead[l];
    if (SITE_ID.test(id)) continue;
    const f = films.find((x) => x.id === id);
    if (!f) return "That film is not in the library.";
    if (!f.cuts?.ranked) {
      return lead.en !== lead.ar ? `Rank the ${l === "ar" ? "Arabic" : "English"} version on your PC first. Both languages need ranked cuts.`
        : "Rank this film on your PC first. It needs ranked cuts before it can go on the portfolio.";
    }
  }
  return "";
}

// The link to open: github.com's "new file" page on the portfolio's gh-pages branch, with the file name and its contents in
// the address. `bare` is the same page with nothing typed in (the "Copy the pick" fallback pastes the contents). Throws the
// reason when it can't be sent.
export function githubRequest(lead, now = Date.now(), films, repo) {
  const why = githubBlock(lead, films, repo);
  if (why) throw new Error(why);
  const json = JSON.stringify({ version: 1, lead: { en: lead.en, ar: lead.ar } }, null, 2) + "\n";
  const filename = `${REQUESTS_DIR}/${requestStamp(now)}.json`;
  const bare = `https://github.com/${repo}/new/${PORTFOLIO_BRANCH}?filename=${filename}`;
  return { url: `${bare}&value=${encodeURIComponent(json)}`, bare, json, filename };
}

// ---------- what the public site shows now (the backup reads it itself, the PC is off) ----------
const plain = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
// The portfolio's address comes from the snapshot (its `site` is the English home, https://host/<portfolio>/en/), never from
// this file: the public shell carries no app links. "" when it isn't a plain https address.
export function portfolioBase(site) {
  try {
    const u = new URL(String(site));
    if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash) return "";
    return `${u.origin}${u.pathname.replace(/\/en\/?$/, "/")}`.replace(/\/?$/, "/");
  } catch { return ""; }
}
// The same shape the PC's /api/cinema "live" has (core/cinema.py _fetch_live), so leadInfo reads either. Not usable -> {ok:false}.
export function parseLive(data, base = "") {
  const doc = plain(data);
  if (!doc) return { ok: false };
  const lead = {};
  for (const l of ["en", "ar"]) if (typeof doc.lead?.[l] === "string" && LIVE_ID.test(doc.lead[l])) lead[l] = doc.lead[l];
  if (!Object.keys(lead).length) return { ok: false };
  if (doc.items !== undefined && !plain(doc.items)) return { ok: false };
  const items = {};
  for (const [key, it] of Object.entries(doc.items || {})) {
    if (!LIVE_ID.test(key) || !plain(it)) continue;
    let card = "";
    try { card = it.card && base ? new URL(String(it.card), `${base}motion/`).href : ""; } catch { card = ""; }
    const cuts = (Array.isArray(it.cuts) ? it.cuts : []).filter((c) => Number.isFinite(c?.start)).map((c) => ({
      id: `t${String(Math.round(c.start * 10)).padStart(4, "0")}`, start: c.start, end: Number.isFinite(c.end) ? c.end : null,
      label: cleanCopy(c.label, COPY_LIMITS.name), chapter: c.chapter ?? null }));
    items[key] = { name: cleanCopy(it.name, COPY_LIMITS.name), kind: String(it.kind || ""), seconds: Number.isFinite(it.seconds) ? it.seconds : null,
      version: String(it.version || ""), chapters: Array.isArray(it.chapters) ? it.chapters.length : 0, card: card.startsWith(base) ? card : "", cuts };
  }
  return { ok: true, updated: String(doc.updated || ""), lead, items };
}

// `fetchFn` is the browser's fetch (a test passes its own). The site is public: no key, no referrer, never cached.
export async function fetchPublicLive(fetchFn, base, now = Date.now(), timeoutMs = 6000) {
  if (!base) return { ok: false };
  const ctl = typeof AbortController === "function" ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), timeoutMs);
  try {
    const res = await fetchFn(`${base}motion/program.json?v=${Math.floor(now / 60000)}`,
      { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: ctl?.signal });
    return res?.ok ? parseLive(await res.json(), base) : { ok: false };
  } catch { return { ok: false }; } finally { clearTimeout(timer); }
}
