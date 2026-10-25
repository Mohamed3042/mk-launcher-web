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
  return { lang, id, film, world, item, name: item?.name || world?.name || (film ? publicName(film.title) : id),
    fromLive: !!live, pending: !!live && !!picked && live !== picked, picked };
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
