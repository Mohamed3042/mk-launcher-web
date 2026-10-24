// MK News, the Newsreel: Mohamed's AI news as its own world, the sibling of MK Cinema. A billboard for the top
// story lights the page (ambient.js), topic rows slide sideways (rows.js), Topics holds the whole feed with the
// charts and repo lists, Reels plays the stories and real clips full screen, and Settings holds his choices and
// Saved (what was sent to Claude). Reels and Settings are the launcher's own modules (../reels.js, ../settings.js):
// one code path and the same shared choices on every device. Every story shows a real picture where one exists.
import { icon } from "./icons.js";
import { createAmbient } from "./ambient.js";
import { mountRows, page, syncInk } from "./rows.js";
import * as C from "../charts.js";
import * as source from "../source.js";
import { GLYPHS } from "../glyphs.js";
import { createReels } from "../reels.js";
import { createSettings } from "../settings.js";
import { thumbOf, setMyWork, TOPICS, TOPIC, KIND_LABEL, PROVIDER, CARD_HOSTS, toMs, ago, hoursAgo, byNewest, compact, money, cleanModel, plural, lowerFirst, minutes, prettyRepo, releaseChanges, releaseHighlight, releaseTitle, incidentOpen, firstSentence, cleanSummary, sourceLabel, artName, artUrl, artCss, pictureOf, view, metaExtra, promptFor, claudeUrl, priceDrops, flagshipPrices } from "./story.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Story links come from the feed (or this device's cached copy of it): only ever web addresses.
const safeUrl = (u) => (/^https?:\/\//i.test(String(u || "")) ? String(u) : "#");
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const ROUTES = ["home", "reels", "discover", "settings", "saved"];
// The phone tab bar and the desktop tabs: Saved lives in Settings now, one tap away.
const TABS = [["home", "Home", "#/home", "home"], ["reels", "Reels", "#/reels", "reels"], ["discover", "Topics", "#/discover", "topics"],
  ["settings", "Settings", "#/settings", "settings"]];

const REPO_LISTS = [["today", "Today"], ["week", "This week"], ["rising", "New & rising"], ["mcp", "MCP"], ["claude-code", "Claude Code"], ["ai-agents", "AI agents"], ["text-to-speech", "Voice / TTS"], ["video-generation", "Video gen"], ["remotion", "Remotion"], ["llm-tools", "LLM tools"]];
const ROW_ART = { releases: "releases", agents: "agents", video: "video", voice: "voice", free: "open", latest: "default" };
const CROPS = [["72% 48%", 1], ["86% 42%", 1.12], ["64% 56%", 1.06], ["94% 50%", 1.18]];
const PAGE = 60;
const whole = (v) => (Number.isInteger(v) ? String(v) : ""); // count axes: 0, 1, 2; never 0.5

const S = {
  route: "home", sub: "stories", topic: "", query: "", provider: "", items: [], byId: new Map(), charts: null,
  status: null, saved: [], repos: {}, repoList: "today", repoPick: 0, offline: false, feedAt: 0, error: "",
  limit: PAGE, ask: null, askMode: "help", askIdea: "", after: [], synth: new Map(),
};
let ambient;
const g = (name, cls = "") => `<svg class="g ${cls}" viewBox="0 0 24 24" aria-hidden="true">${GLYPHS[name] || GLYPHS.grid}</svg>`;
async function copy(text, done = "Copied") {
  try { await navigator.clipboard.writeText(text); toast(done); } catch { window.prompt("Copy this", text); }
}

// ---------- small helpers ----------
function localGet(k, d) { try { const v = localStorage.getItem("mkn." + k); return v == null ? d : JSON.parse(v); } catch { return d; } }
function localSet(k, v) { try { localStorage.setItem("mkn." + k, JSON.stringify(v)); } catch { /* private mode or full */ } }

async function api(path, opts = {}) {
  if (source.BACKUP) {
    if (!source.token()) { const e = new Error("Connect the backup first."); e.offline = true; throw e; }
    if (!(await source.cachedSnapshot())) await source.fetchSnapshot();
    return source.backupApi(path, opts);
  }
  let r;
  try {
    r = await fetch(path, { ...opts, headers: { "X-MKL": "1", ...(opts.body ? { "Content-Type": "application/json" } : {}) } });
  } catch {
    const e = new Error("The PC is not reachable right now.");
    e.offline = true;
    throw e;
  }
  let data = null;
  try { data = await r.json(); } catch { /* empty body */ }
  if (!r.ok) throw new Error((data && data.error) || `${r.status} ${r.statusText}`);
  return data;
}
const post = (p, b = {}) => api(p, { method: "POST", body: JSON.stringify(b) });

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), 2800);
}

// ---------- this week, from the charts ----------
function modelsDigest() {
  const c = S.charts;
  if (!c) return null;
  const weeks = c.new_models_per_week || [];
  const cur = weeks[weeks.length - 1] || { week_start: "", count: 0, models: [] };
  const drops = priceDrops(c);
  const newest = S.items.find((i) => i.kind === "model");
  const names = [...new Set(cur.models.map((n) => cleanModel(n).replace(/\s*\(batch\)$/i, "")))];
  const it = {
    id: `week-models-${cur.week_start}`, kind: "digest", source: "openrouter", source_name: "OpenRouter",
    title: `OpenRouter: ${plural(cur.count, "new model")}, ${drops.length ? plural(drops.length, "price drop") : "no price drops"}`, period: "this week",
    url: "https://openrouter.ai/models", published: newest?.published || `${cur.week_start}T00:00:00Z`, image: "", tags: ["models", "prices"], metrics: {},
    summary: `${names.length ? `New this week: ${names.join(", ")}.` : "No new models this week."} ${drops.length ? `Price drops: ${drops.map((d) => `${d.name} ${money(d.from)} to ${money(d.to)} per million output tokens`).join("; ")}.` : "No price drops this week."}`,
    newCount: cur.count, dropCount: drops.length, busiest: Math.max(1, ...weeks.map((w) => w.count)),
  };
  S.synth.set(it.id, it);
  return it;
}
function incidentsWeek() {
  return (S.charts?.status_incidents || []).slice(-7).reduce((a, d) => a + d.count, 0);
}
function statusDigest(incidents) {
  const open = incidents.filter(incidentOpen);
  const n = incidentsWeek();
  const it = {
    id: `week-status-${new Date().toISOString().slice(0, 10)}`, kind: "digest", source: "status-anthropic", source_name: "Anthropic Status",
    title: open.length ? `Ongoing: ${open[0].title}` : "All Claude systems operational",
    url: "https://status.anthropic.com", published: incidents[0]?.published || new Date().toISOString(), image: "", tags: ["anthropic"], metrics: {},
    summary: `${open.length ? `${plural(open.length, "incident")} open right now.` : "No open incidents right now."} ${plural(n, "Claude incident")} in the last 7 days: ${incidents.slice(0, 6).map((i) => `${i.title} (${minutes(i.metrics?.minutes)})`).join("; ")}.`,
    open,
  };
  S.synth.set(it.id, it);
  return it;
}
function providers() {
  const seen = new Map();
  for (const p of S.charts?.prices || []) if (!seen.has(p.provider)) seen.set(p.provider, PROVIDER[p.provider] || p.provider);
  const order = ["anthropic", "openai", "google", "deepseek", "mistralai", "meta-llama", "x-ai", "qwen", "moonshotai", "z-ai"];
  return [...seen.entries()].sort((a, b) => (order.indexOf(a[0]) + 99) % 99 - (order.indexOf(b[0]) + 99) % 99).map(([id, label]) => ({ id, label }));
}
// ---------- saved state ----------
const plainSaved = (id) => S.saved.find((e) => e.item?.id === id && !e.idea);
function paintSaveButtons(id) {
  for (const b of $$(`[data-act="save"][data-id="${CSS.escape(id)}"]`)) {
    const on = !!plainSaved(id);
    b.setAttribute("aria-pressed", String(on));
    b.innerHTML = `${icon(on ? "bookmark-fill" : "bookmark")}<span>${on ? "Saved" : "Save"}</span>`;
  }
}

// ---------- building blocks ----------
function kicker(it, lead = "") {
  const parts = [];
  if (lead) parts.push(`<b>${esc(lead)}</b>`);
  parts.push(`<b>${esc(sourceLabel(it))}</b>`);
  const t = it.period || ago(it.published);
  if (t) parts.push(`<span>${esc(t)}</span>`);
  const extra = metaExtra(it);
  if (extra) parts.push(`<span>${esc(extra)}</span>`);
  return parts.join('<i aria-hidden="true">·</i>');
}
const askBtn = (it, cls = "") => `<button class="pill white ${cls}" type="button" data-act="ask" data-id="${esc(it.id)}">${icon("sparkle")}<span>Ask Claude</span></button>`;
function saveBtn(it, cls = "") {
  const on = !!plainSaved(it.id);
  return `<button class="pill glass ${cls}" type="button" data-act="save" data-id="${esc(it.id)}" aria-pressed="${on}">${icon(on ? "bookmark-fill" : "bookmark")}<span>${on ? "Saved" : "Save"}</span></button>`;
}
const link = (it, text, cls = "") => `<a class="${cls}" href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener" dir="auto">${esc(text)}</a>`;
function artStyle(name, k = 0) {
  const [pos, zoom] = CROPS[k % CROPS.length];
  return `--art:${artCss(name)};--pos:${pos};--zoom:${zoom}`;
}
// A story's picture, in order: its own (og:image, GitHub preview, YouTube or paper thumbnail), its source's logo on a
// tinted card, then the artwork. The artwork stays underneath (--art) and returns if a picture fails to load.
function thumb(it, rowArt = "") {
  const t = thumbOf(it, rowArt);
  if (t.kind === "photo") return { cls: ` has-pic${t.card ? " card-pic" : ""}`, inner: `<img class="pic" src="${esc(t.src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` };
  if (t.kind === "logo") return { cls: " has-logo", inner: `<span class="logo-tile"><img class="logo" src="${esc(t.src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>` };
  return { cls: "", inner: "" };
}

function card(it, { wide = false, k = 0, rowArt = "", note = "" } = {}) {
  const d = view(it);
  const t = thumb(it, rowArt);
  return `<article class="card${wide ? " wide" : ""}${d.state ? " is-status" : ""}${t.cls}" data-id="${esc(it.id)}" style="${artStyle(artName(it, rowArt), k)}">
    <div class="art" aria-hidden="true">${t.inner}</div>
    <div class="body">
      <p class="kicker">${kicker(it)}</p>
      <h3 class="title">${link(it, d.title, "stretch")}</h3>
      ${d.state ? `<p class="state ${d.state.cls}">${icon("dot")}${esc(d.state.text)}</p>` : ""}
      ${note ? `<p class="note">${esc(note)}</p>` : d.why ? `<p class="note why" dir="auto">${icon("lightbulb")}${esc(d.why)}</p>` : it.kind === "model" || (it.kind === "release" && !releaseHighlight(it)) ? `<p class="note" dir="auto">${esc(d.line)}</p>` : ""}
      <div class="acts">${askBtn(it)}${saveBtn(it)}</div>
    </div>
  </article>`;
}
function paddles(title) {
  return `<span class="paddles"><button class="round sm" type="button" data-act="page" data-dir="-1" aria-label="Back in ${esc(title)}">${icon("chevron-left")}</button><button class="round sm" type="button" data-act="page" data-dir="1" aria-label="More in ${esc(title)}">${icon("chevron-right")}</button></span>`;
}
function row(id, title, body, { see = id, cls = "" } = {}) {
  if (!body) return "";
  return `<section class="row ${cls}" data-row="${id}" aria-labelledby="h-${id}">
    <div class="row-head"><h2 id="h-${id}">${esc(title)}</h2>
      ${see != null ? `<a class="see" href="#/discover${see ? `?t=${see}` : ""}">See all${icon("chevron-right")}</a>` : ""}
      ${paddles(title)}</div>
    <div class="viewport"><div class="track">${body}</div>
      <button class="edge prev" type="button" data-act="page" data-dir="-1" tabindex="-1" aria-hidden="true">${icon("chevron-left")}</button>
      <button class="edge next" type="button" data-act="page" data-dir="1" tabindex="-1" aria-hidden="true">${icon("chevron-right")}</button></div>
  </section>`;
}

// ---------- Home ----------
function pickHero() {
  // The newest Anthropic or Claude story of the last 24 h (a resolved outage is not a top story), else the best score.
  const claude = S.items.filter((i) => TOPIC.claude.test(i) || ["anthropic", "claude-code", "status-anthropic"].includes(i.source));
  const fresh = claude.filter((i) => hoursAgo(i) <= 24 && (i.kind !== "status" || incidentOpen(i))).sort(byNewest);
  const pictured = fresh.filter((i) => thumbOf(i).kind === "photo" && !thumbOf(i).card); // a real photo lights the page best
  if (pictured.length) return pictured[0];
  if (fresh.length) return fresh[0];
  return [...S.items].filter((i) => i.kind !== "status" || incidentOpen(i)).sort((a, b) => b.score - a.score || byNewest(a, b))[0] || S.items[0];
}
function billboard(it) {
  const d = view(it);
  const line = d.why || d.line;
  return `<section class="billboard" data-id="${esc(it.id)}" aria-labelledby="hero-title">
    <div class="hero-art" aria-hidden="true"><img class="hero-img" src="${esc(thumbOf(it).kind === "photo" ? thumbOf(it).src : artUrl(artName(it)))}" data-art="${esc(artUrl(artName(it)))}" alt="" referrerpolicy="no-referrer"></div>
    <div class="hero-copy">
      <p class="kicker">${kicker(it, "Top story")}</p>
      <h1 id="hero-title" dir="auto">${link(it, d.title)}</h1>
      ${line ? `<p class="hero-line${d.why ? " why" : ""}" dir="auto">${d.why ? icon("lightbulb") : ""}${esc(line)}</p>` : ""}
      <div class="acts">${askBtn(it, "lg")}${saveBtn(it, "lg")}</div>
    </div>
  </section>`;
}
function digestCard(dg) {
  const max = Math.max(dg.busiest, dg.newCount, dg.dropCount, 1);
  const bar = (label, v, tip) => `<div class="mbar" title="${esc(tip)}"><span>${label}</span><i style="--v:${(v / max).toFixed(3)}"></i><b>${v}</b></div>`;
  return `<article class="card digest" data-id="${esc(dg.id)}" style="${artStyle("models", 0)};--pos:92% 50%">
    <div class="art" aria-hidden="true"></div>
    <div class="body">
      <p class="kicker">${kicker(dg)}</p>
      <h3 class="title">${link(dg, dg.title, "stretch")}</h3>
      <div class="acts">${askBtn(dg)}${saveBtn(dg)}</div>
    </div>
    <div class="mbars" role="img" aria-label="${esc(`${plural(dg.newCount, "new model")} and ${plural(dg.dropCount, "price drop")} this week`)}">
      ${bar("New models", dg.newCount, `New models on OpenRouter this week (the busiest of the last 12 weeks had ${dg.busiest})`)}
      ${bar("Price drops", dg.dropCount, "Flagship models that got cheaper in the last 7 days")}
    </div>
  </article>`;
}
function compareCard() {
  const provs = providers();
  if (!provs.length) return "";
  return `<article class="card compare">
    <div class="body">
      <h3 class="title"><a class="stretch" href="#/discover/models">Compare models</a></h3>
      <p class="note">What ${plural(provs.length, "provider")}’ top models cost per million tokens, side by side.</p>
      <div class="provs">${provs.slice(0, 6).map((p) => `<a class="chip sm" href="#/discover/models?p=${esc(p.id)}">${esc(p.label)}</a>`).join("")}</div>
    </div>
  </article>`;
}
function reposPanel() {
  const list = S.repos.today;
  if (list && !list.length) return "";
  const pick = list?.[S.repoPick] || list?.[0];
  const tiles = list ? list.slice(0, 12).map((r, k) => {
    const m = r.metrics || {};
    return `<button class="tile" type="button" data-act="pick-repo" data-k="${k}" aria-pressed="${r === pick}">
      <span class="gh">${icon("github")}</span>
      <span class="tile-text"><span class="tile-name" title="${esc(r.title)}">${esc(r.title.split("/").pop())}</span>
      <span class="tile-meta">${icon("star")}${compact(m.stars || 0)}${m.stars_period ? `<em title="${esc(`${m.stars_period.toLocaleString()} stars today`)}">+${compact(m.stars_period)}</em>` : ""}</span></span></button>`;
  }).join("") : `<div class="tile ghost"></div><div class="tile ghost"></div><div class="tile ghost"></div>`;
  return `<section class="panel repos" data-row="repos" aria-labelledby="h-repos">
    <div class="row-head"><h2 id="h-repos"><a href="#/discover/repos">Trending repos</a></h2>${paddles("Trending repos")}</div>
    <div class="viewport"><div class="track">${tiles}</div></div>
    <div class="panel-foot" id="repo-foot">${pick ? repoFoot(pick) : ""}</div>
  </section>`;
}
function repoFoot(r) {
  return `<p class="note" dir="auto"><a href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener"><b>${esc(r.title)}</b></a>${r.summary ? ` · ${esc(r.summary)}` : ""}</p>
    <div class="acts">${askBtn(r)}${saveBtn(r)}<a class="pill glass open" href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener" aria-label="Open ${esc(r.title)} on GitHub">${icon("external")}<span>Open</span></a></div>`;
}
function papersPanel(papers) {
  if (!papers.length) return "";
  const slides = papers.map((p) => `<div class="slide" data-id="${esc(p.id)}">
      <p class="kicker">${kicker(p)}</p>
      <h3 class="title">${link(p, p.title)}</h3>
      <div class="acts">${askBtn(p)}${saveBtn(p)}</div></div>`).join("");
  return `<section class="panel lit papers" data-row="papers" aria-labelledby="h-papers" style="${artStyle("papers", 0)};--pos:96% 55%">
    <div class="art" aria-hidden="true"></div>
    <div class="row-head"><h2 id="h-papers"><a href="#/discover?t=papers">Papers</a></h2>${paddles("Papers")}</div>
    <div class="viewport"><div class="track">${slides}</div></div>
  </section>`;
}
function outagesPanel(incidents) {
  const dg = statusDigest(incidents);
  const n = incidentsWeek();
  const open = dg.open.length > 0;
  const overview = `<div class="slide" data-id="${esc(dg.id)}">
      <p class="state big ${open ? "bad" : "ok"}">${icon("dot")}${esc(open ? `Ongoing: ${dg.open[0].title}` : "All systems operational")}</p>
      <p class="note">${open ? `${plural(dg.open.length, "incident")} open now.` : "No current outages."} ${plural(n, "Claude incident")} in the last 7 days.</p>
      <div class="acts">${askBtn(dg)}${saveBtn(dg)}</div></div>`;
  const slides = incidents.slice(0, 8).map((i) => {
    const d = view(i);
    return `<div class="slide" data-id="${esc(i.id)}">
      <p class="kicker">${kicker(i)}</p>
      <h3 class="title">${link(i, d.title)}</h3>
      <div class="acts">${askBtn(i)}${saveBtn(i)}</div></div>`;
  }).join("");
  return `<section class="panel lit outages" data-row="outages" aria-labelledby="h-outages" style="${artStyle(open ? "outage" : "status", 0)};--pos:96% 60%">
    <div class="art" aria-hidden="true"></div>
    <div class="row-head"><h2 id="h-outages"><a href="#/discover?t=status">Outages</a></h2>${paddles("Outages")}</div>
    <div class="viewport"><div class="track">${overview}${slides}</div></div>
  </section>`;
}
function homeView() {
  if (!S.items.length) return emptyFeed();
  const hero = pickHero();
  const used = new Set([hero.id]);
  const take = (list, n) => {
    const out = [];
    for (const it of list) {
      if (used.has(it.id) || out.includes(it)) continue;
      used.add(it.id);
      out.push(it);
      if (out.length >= n) break;
    }
    return out;
  };
  const cards = (list, opts = {}) => list.map((it, k) => card(it, { ...opts, k })).join("");
  const n7 = incidentsWeek();
  const claude = take(S.items.filter((i) => TOPIC.claude.test(i) && !(i.kind === "status" && hoursAgo(i) > 48)), 14);
  const claudeCards = claude.map((it, k) => card(it, { wide: true, k, note: it.kind === "status" ? `${plural(n7, "Claude incident")} in the last 7 days` : "" })).join("");
  const models = take([...S.items.filter((i) => i.kind === "model" || i.kind === "price"), ...S.items.filter((i) => i.tags.includes("prices") && i.kind !== "status"), ...S.items.filter((i) => i.tags.includes("models") && i.kind !== "status")], 10);
  const dg = modelsDigest();
  const papers = take(S.items.filter((i) => i.kind === "paper"), 10);
  const incidents = S.items.filter((i) => i.kind === "status").sort(byNewest);
  const releases = take(S.items.filter((i) => i.kind === "release"), 12);
  const agents = take(S.items.filter(TOPIC.agents.test), 12);
  const video = take(S.items.filter(TOPIC.video.test), 12);
  const voice = take(S.items.filter(TOPIC.voice.test), 12);
  const free = take(S.items.filter(TOPIC.free.test), 12);
  const latest = take([...S.items].sort(byNewest), 14);
  const trio = [reposPanel(), papersPanel(papers), outagesPanel(incidents)].filter(Boolean);
  return `${billboard(hero)}
    <div class="rows">
      ${row("claude", "Claude", claudeCards, { cls: "wide-row" })}
      ${row("models", "Models & prices", (dg ? digestCard(dg) : "") + compareCard() + cards(models), { cls: "short-row" })}
      ${trio.length ? `<div class="trio n${trio.length}">${trio.join("")}</div>` : ""}
      ${row("releases", "Releases", cards(releases, { rowArt: "releases" }))}
      ${row("agents", "Agents", cards(agents, { rowArt: "agents" }))}
      ${row("video", "Video", cards(video, { rowArt: "video" }))}
      ${row("voice", "Voice", cards(voice, { rowArt: "voice" }))}
      ${row("free", "Free & open", cards(free, { rowArt: "open" }))}
      ${row("latest", "Latest", cards(latest, { rowArt: "default" }), { see: "" })}
    </div>
    <footer class="foot"><p>MK News reads public sources only: lab blogs, status pages, release notes, papers, Hacker News, GitHub and OpenRouter.</p><a href="../">${icon("back")}Back to the launcher</a></footer>`;
}
function emptyFeed() {
  const st = S.status;
  let head = "No news yet", body = "Tap Refresh; the first pull takes about a minute.";
  if (S.offline) { head = "Can’t reach the PC"; body = "MK News keeps the last feed on this device once it has loaded. Try again when the PC is awake."; }
  else if (S.error) { head = "MK News can’t load the feed"; body = S.error; }
  else if (st?.refreshing) { head = "Pulling the latest news…"; body = "The first pull takes about a minute."; }
  return `<section class="empty lit" style="${artStyle("default")}"><div class="art" aria-hidden="true"></div>
    <div class="body"><h1>${esc(head)}</h1><p>${esc(body)}</p>
    <div class="acts"><button class="pill white lg" type="button" data-act="refresh">${icon("refresh")}<span>Refresh</span></button></div></div></section>`;
}

// ---------- Discover ----------
function norm(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
function filteredStories() {
  const t = TOPIC[S.topic];
  let list = t ? S.items.filter(t.test) : S.items;
  const words = norm(S.query).split(/\s+/).filter(Boolean);
  if (words.length) {
    list = list.filter((i) => {
      const hay = norm(`${view(i).title} ${i.title} ${i.summary} ${i.source_name} ${i.tags.join(" ")} ${i.kind}`);
      return words.every((w) => hay.includes(w));
    });
  }
  return list;
}
function itemRow(it, k) {
  const d = view(it);
  const tags = (it.tags || []).filter((t) => t !== "today").slice(0, 3).map((t) => `<span class="tag">${esc(t.replace("-", " "))}</span>`).join("");
  const sum = it.kind === "release" ? releaseChanges(it.summary).slice(0, 2).join(" · ") : d.line;
  const t = thumb(it);
  return `<article class="item" data-id="${esc(it.id)}">
    <a class="thumb${t.cls}" href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true" style="${artStyle(artName(it), k)}"><span class="art">${t.inner}</span></a>
    <div class="item-body">
      <p class="kicker">${kicker(it)}<i aria-hidden="true">·</i><span>${esc(KIND_LABEL[it.kind] || it.kind)}</span></p>
      <h3 class="item-title">${link(it, d.title, "stretch")}</h3>
      ${d.state ? `<p class="state ${d.state.cls}">${icon("dot")}${esc(d.state.text)}</p>` : ""}
      ${sum ? `<p class="item-sum" dir="auto">${esc(sum)}</p>` : ""}
    </div>
    <div class="item-foot">
      ${d.why ? `<p class="why" dir="auto">${icon("lightbulb")}<span>${esc(d.why)}</span></p>` : ""}
      <div class="acts">${askBtn(it, "sm")}${saveBtn(it, "sm")}<span class="tags">${tags}</span></div>
    </div>
  </article>`;
}
function segNav() {
  const subs = [["stories", "Stories", "#/discover"], ["models", "Models & prices", "#/discover/models"], ["repos", "Repos", "#/discover/repos"]];
  return `<nav class="seg" aria-label="Discover"><span class="ink" aria-hidden="true"></span>${subs.map(([v, l, h]) => `<a href="${h}" aria-current="${S.sub === v ? "page" : "false"}">${l}</a>`).join("")}</nav>`;
}
// Every topic as a tile with a real picture: the newest story in it that has one (else a logo, else the artwork).
function topicTiles() {
  const used = new Set(); // each tile its own picture: a photo first, then a designed card, then a logo
  const pick = (list, ok) => list.find((i) => { const th = thumbOf(i); return ok(th) && !used.has(th.src); });
  const tiles = TOPICS.map((t) => {
    const list = S.items.filter(t.test).sort(byNewest);
    if (!list.length) return "";
    const lead = pick(list, (th) => th.kind === "photo" && !th.card) || pick(list, (th) => th.kind === "photo")
      || pick(list, (th) => th.kind === "logo") || list[0];
    used.add(thumbOf(lead).src);
    const th = thumb(lead, ROW_ART[t.id] || "");
    return `<a class="topic-tile${th.cls}" href="#/discover?t=${t.id}" style="${artStyle(artName(lead, ROW_ART[t.id] || ""), 0)}">
      <span class="art" aria-hidden="true">${th.inner}</span>
      <span class="tt-label"><b>${esc(t.label)}</b><span>${plural(list.length, "story", "stories")}</span></span></a>`;
  }).join("");
  return tiles ? `<nav class="topic-tiles" aria-label="Topics">${tiles}</nav>` : "";
}
function storiesView() {
  if (!S.items.length) return emptyFeed();
  const list = filteredStories();
  const t = TOPIC[S.topic];
  const title = S.query ? `“${S.query}”` : t ? t.label : "Every story";
  const count = `${plural(list.length, "story", "stories")}${S.query && t ? ` in ${t.label}` : ""} from the last 30 days`;
  const rows = list.slice(0, S.limit).map((it, k) => itemRow(it, k)).join("");
  const left = list.length - S.limit;
  const empty = `<div class="quiet-box"><b>Nothing matches.</b> ${S.query ? "Try fewer words, or" : "Try"} another topic.${S.query || S.topic ? ` <button class="link" type="button" data-act="clear">Show every story</button>` : ""}</div>`;
  return `<div class="disc">
    <div class="disc-main">
      ${S.query || S.topic ? "" : topicTiles()}
      <header class="list-head"><h1>${esc(title)}</h1><p>${esc(count)}${S.query || S.topic ? ` <button class="link" type="button" data-act="clear">Clear</button>` : ""}</p></header>
      <div class="items">${rows || empty}</div>
      ${left > 0 ? `<div class="more"><button class="pill glass" type="button" data-act="more">Show ${Math.min(PAGE, left)} more</button></div>` : ""}
    </div>
    <aside class="disc-side" aria-label="This week">${sideCharts()}</aside>
  </div>`;
}
function sideCharts() {
  const c = S.charts;
  if (!c) return `<div class="glass-card skeleton" style="height:260px"></div>`;
  const n7 = incidentsWeek();
  S.after.push(() => {
    const src = Object.entries(c.sources || {}).filter(([k]) => k !== "github").sort((a, b) => b[1] - a[1]).slice(0, 8);
    if ($("#c-sources") && src.length) C.hbars($("#c-sources"), { data: src.map(([k, v]) => ({ label: k.replace(/-/g, " "), value: v, tip: `${k.replace(/-/g, " ")}\nStories this week|${v}` })), color: "var(--amber)", row: 24, fmt: compact });
    const inc = (c.status_incidents || []).slice(-14);
    if ($("#c-inc7") && inc.length) C.columns($("#c-inc7"), { data: inc.map((d) => ({ label: new Date(d.day + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" }), value: d.count, color: "var(--coral)", tip: `${d.day}\nIncidents|${d.count}\nMinutes affected|${Math.round(d.minutes)}` })), height: 110, fmt: whole });
    const langs = c.trending_languages || [];
    if ($("#c-langs") && langs.length) C.hbars($("#c-langs"), { data: langs.slice(0, 6).map((l) => ({ label: l.language, value: l.count, tip: `${l.language}\nTrending repos today|${l.count}` })), color: "var(--amber-2)", row: 24 });
  });
  return `<div class="glass-card"><h3>This week</h3><p class="sub">Stories per source, last 7 days</p><div id="c-sources"></div></div>
    <div class="glass-card"><h3>Claude incidents</h3><p class="sub">${plural(n7, "incident")} in the last 7 days · last 14 days shown</p><div id="c-inc7"></div><a class="link" href="#/discover/models">All charts${icon("chevron-right")}</a></div>
    ${(c.trending_languages || []).length ? `<div class="glass-card"><h3>Trending languages</h3><p class="sub">Languages of today’s trending repos</p><div id="c-langs"></div></div>` : ""}`;
}
function modelsView() {
  const c = S.charts;
  if (!c) return `<div class="glass-card skeleton" style="height:320px"></div>`;
  let prices = flagshipPrices(c.prices || []);
  const prov = S.provider && prices.some((p) => p.provider === S.provider) ? S.provider : "";
  const shown = prov ? prices.filter((p) => p.provider === prov || p.provider === "anthropic") : prices;
  const provChips = providers().map((p) => `<a class="chip sm" href="#/discover/models${prov === p.id ? "" : `?p=${esc(p.id)}`}" aria-current="${prov === p.id}">${esc(p.label)}</a>`).join("");
  const history = c.price_history || {};
  const days = new Set(Object.values(history).flatMap((h) => h.map((x) => x.day)));
  const newModels = S.items.filter((i) => i.kind === "model").slice(0, 12);
  const priceChanges = S.items.filter((i) => i.kind === "price").slice(0, 12);
  const outages = S.items.filter((i) => i.kind === "status").sort(byNewest).slice(0, 8);
  const inc = c.status_incidents || [];
  const totalMin = inc.reduce((a, d) => a + d.minutes, 0), totalInc = inc.reduce((a, d) => a + d.count, 0);
  S.after.push(() => {
    if ($("#c-prices") && shown.length) C.hbarsGrouped($("#c-prices"), {
      data: shown.map((p) => ({ label: cleanModel(p.name), values: [p.prompt, p.completion], extra: [`Context|${compact(p.context)} tokens`] })),
      series: [{ name: "Input per 1M", color: "var(--amber-2)" }, { name: "Output per 1M", color: "var(--amber)" }], fmt: money,
    });
    const weeks = c.new_models_per_week || [];
    if ($("#c-newmodels") && weeks.length) C.columns($("#c-newmodels"), {
      data: weeks.map((w) => ({ label: new Date(w.week_start + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" }), value: w.count, tip: [`Week of ${w.week_start}`, `New models|${w.count}`, ...w.models.slice(0, 8).map((m) => `${cleanModel(m)}|`)].join("\n") })),
      color: "var(--amber)", height: 150, fmt: whole,
    });
    if ($("#c-status") && inc.length) C.columns($("#c-status"), {
      data: inc.map((d) => ({ label: new Date(d.day + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" }), value: d.count, color: "var(--coral)", tip: `${d.day}\nIncidents|${d.count}\nMinutes affected|${Math.round(d.minutes)}` })),
      height: 130, fmt: whole,
    });
    const ctx = prices.filter((p) => p.context);
    if ($("#c-context") && ctx.length) C.hbars($("#c-context"), { data: ctx.map((p) => ({ label: cleanModel(p.name), value: p.context, tip: `${cleanModel(p.name)}\nContext|${compact(p.context)} tokens\nOutput|${money(p.completion)} per 1M` })), color: "var(--amber-3)", fmt: compact });
    if ($("#c-history") && days.size >= 2) {
      const pick = shown.slice(0, 1)[0];
      const h = history[pick?.model] || [];
      if (h.length >= 2) C.area($("#c-history"), { points: h.map((x) => ({ t: Date.parse(x.day + "T00:00:00"), v: x.completion })), color: "var(--amber)", fmt: money, label: "Output per 1M", tFmt: (t) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" }) });
    }
  });
  const list = (items) => `<div class="items">${items.map((it, k) => itemRow(it, k)).join("")}</div>`;
  return `<div class="charts">
      <div class="glass-card wide"><h3>What the top models cost</h3><p class="sub">US dollars per million tokens, from OpenRouter · shorter is cheaper${prov ? ` · ${esc(PROVIDER[prov] || prov)} against Claude` : ""}</p>
        <div class="provs">${provChips}</div>
        <div class="legend"><span><i style="background:var(--amber-2)"></i>Input</span><span><i style="background:var(--amber)"></i>Output</span></div><div id="c-prices"></div>
        ${C.table(["Model", "Input $/1M", "Output $/1M", "Context"], shown.map((p) => [cleanModel(p.name), p.prompt, p.completion, p.context]))}</div>
      <div class="glass-card"><h3>New models per week</h3><p class="sub">Last 12 weeks on OpenRouter · hover a bar for names</p><div id="c-newmodels"></div></div>
      <div class="glass-card"><h3>Claude outages</h3><p class="sub">${plural(totalInc, "incident")}, ${Math.round(totalMin / 60)} hours of open incidents in 30 days (status.anthropic.com)</p><div id="c-status"></div></div>
      <div class="glass-card wide" id="card-history"><h3>Price history</h3><p class="sub">Output price per million tokens${shown[0] ? `, ${esc(cleanModel(shown[0].name))}` : ""}</p>
        ${days.size >= 2 ? `<div id="c-history"></div>` : `<p class="quiet-box">MK News started checking prices ${days.size ? "today" : "recently"}: ${plural(days.size, "price check")} so far. The line draws itself as the daily checks add up.</p>`}</div>
      <div class="glass-card wide"><h3>How much each model can read at once</h3><p class="sub">Context window in tokens</p><div id="c-context"></div></div>
    </div>
    ${newModels.length ? `<section class="section"><h2 class="serif-h">New models <span>${newModels.length}</span></h2>${list(newModels)}</section>` : ""}
    ${priceChanges.length ? `<section class="section"><h2 class="serif-h">Price changes <span>${priceChanges.length}</span></h2>${list(priceChanges)}</section>` : ""}
    ${outages.length ? `<section class="section"><h2 class="serif-h">Recent outages</h2>${list(outages)}</section>` : ""}`;
}
function reposView() {
  const chips = REPO_LISTS.map(([v, l]) => `<button class="chip sm" type="button" data-act="repo-list" data-v="${v}" aria-pressed="${S.repoList === v}">${l}</button>`).join("");
  const list = S.repos[S.repoList];
  if (!list) { loadRepos(S.repoList); return `<div class="chip-row">${chips}</div><div class="glass-card skeleton" style="height:300px"></div>`; }
  const period = S.repoList === "today" ? "today" : S.repoList === "week" ? "this week" : "";
  const top = S.repoList === "today" ? S.charts?.top_repos_today || [] : [];
  if (top.length) S.after.push(() => { if ($("#c-toprepos")) C.hbars($("#c-toprepos"), { data: top.slice(0, 10).map((r) => ({ label: r.name.split("/")[1] || r.name, value: r.stars_period, tip: `${r.name}\nStars today|${r.stars_period.toLocaleString()}` })), color: "var(--amber)", fmt: compact }); });
  const rows = list.map((r, k) => {
    const m = r.metrics || {};
    return `<article class="item repo" data-id="${esc(r.id)}">
      <span class="gh lg" aria-hidden="true">${icon("github")}</span>
      <div class="item-body">
        <h3 class="item-title">${link(r, r.title, "stretch")}</h3>
        ${r.summary ? `<p class="item-sum" dir="auto">${esc(r.summary)}</p>` : ""}
      </div>
      <div class="item-foot"><div class="acts">
          ${m.stars_period ? `<span class="tag amber">+${compact(m.stars_period)} ${esc(period)}</span>` : ""}<span class="tag">${icon("star")}${compact(m.stars || 0)}</span>${m.language ? `<span class="tag">${esc(m.language)}</span>` : ""}
          <span class="grow"></span>${askBtn(r, "sm")}${saveBtn(r, "sm")}</div></div></article>`;
  }).join("");
  return `<div class="chip-row" role="toolbar" aria-label="Repo lists">${chips}</div>
    ${top.length ? `<div class="glass-card"><h3>Most stars today</h3><p class="sub">GitHub trending</p><div id="c-toprepos"></div></div>` : ""}
    <div class="items repos">${rows || `<p class="quiet-box">Nothing in this list yet. Tap Refresh.</p>`}</div>`;
}
function discoverView() {
  const body = S.sub === "models" ? modelsView() : S.sub === "repos" ? reposView() : storiesView();
  return `<div class="page">${segNav()}${body}</div>`;
}

// ---------- Saved ----------
function savedView() {
  const rows = S.saved.map((e, k) => {
    const it = S.byId.get(e.item?.id) || { ...e.item, tags: [], metrics: {} };
    const t = thumb(it);
    return `<article class="item saved" data-key="${esc(e.key)}">
      <a class="thumb${t.cls}" href="${esc(safeUrl(e.item.url))}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true" style="${artStyle(artName(it), k)}"><span class="art">${t.inner}</span></a>
      <div class="item-body">
        <p class="kicker"><b>${esc(e.mode === "idea" ? "Discuss my idea" : "Does this help me?")}</b><i aria-hidden="true">·</i><span>saved ${esc(ago(e.at))}</span></p>
        <h3 class="item-title"><a class="stretch" href="${esc(safeUrl(e.item.url))}" target="_blank" rel="noopener" dir="auto">${esc(e.item.title)}</a></h3>
        <p class="item-sum">${esc(e.item.source_name || "")}</p>
      </div>
      <div class="item-foot">
        ${e.idea ? `<p class="why" dir="auto">${icon("lightbulb")}<span>Idea: ${esc(e.idea)}</span></p>` : ""}
        <div class="acts"><a class="pill white sm" href="${esc(claudeUrl(promptFor(e.item, e.mode, e.idea)))}" target="_blank" rel="noopener">${icon("sparkle")}<span>Open in Claude</span></a>
          <button class="pill glass sm" type="button" data-act="copy-saved" data-k="${k}">${icon("copy")}<span>Copy prompt</span></button>
          <button class="pill quiet sm" type="button" data-act="unsave" data-key="${esc(e.key)}">${icon("x")}<span>Remove</span></button></div>
      </div></article>`;
  }).join("");
  return `<div class="page saved-page">
    <a class="link back-link" href="#/settings">${icon("chevron-left")}Settings</a>
    <header class="list-head"><h1>Saved for Claude</h1><p>Things you sent to Claude. They’re also on the PC as <b>for-claude.md</b> in the launcher’s data folder, so any Claude or Codex session can read them.</p></header>
    ${rows ? `<div class="items">${rows}</div>` : `<section class="empty lit small" style="${artStyle("default", 2)}"><div class="art" aria-hidden="true"></div><div class="body"><h2>Nothing saved yet</h2><p>Tap Ask Claude or Save on any story and it waits here, ready to open in Claude.</p><div class="acts"><a class="pill white" href="#/home">${icon("home")}<span>Back to the news</span></a></div></div></section>`}
  </div>`;
}

// ---------- Ask Claude ----------
let closeTimer;
const askIdea = () => (S.askMode === "idea" ? S.askIdea || "" : ""); // an abandoned idea never rides along
function openAsk(it, trigger) {
  clearTimeout(closeTimer);
  if (S.ask?.id !== it.id) S.askIdea = "";
  S.ask = it;
  S.askTrigger = trigger;
  paintAsk();
  const sheet = $("#sheet");
  sheet.hidden = false;
  document.body.classList.add("sheet-open");
  requestAnimationFrame(() => {
    sheet.classList.add("on");
    syncInk($(".seg.mode", sheet));
    $("#ask-h")?.focus({ preventScroll: true });
  });
}
function paintAsk() {
  const it = S.ask, d = view(it);
  const prompt = promptFor(it, S.askMode, S.askIdea);
  $("#sheet").innerHTML = `<div class="scrim" data-act="close"></div>
    <div class="sheet-card" role="dialog" aria-modal="true" aria-labelledby="ask-h">
      <div class="sheet-art" style="${artStyle(artName(it), 1)}" aria-hidden="true"><div class="art"></div></div>
      <button class="round close" type="button" data-act="close" aria-label="Close">${icon("x")}</button>
      <div class="sheet-head">
        <p class="eyebrow">${icon("sparkle")}Ask Claude</p>
        <p class="about">Claude opens with everything filled in.</p>
        <h2 id="ask-h" tabindex="-1" dir="auto">${esc(d.title)}</h2>
        <p class="kicker">${kicker(it)}</p>
      </div>
      <div class="sheet-body">
        <div class="seg mode" role="group" aria-label="What do you want"><span class="ink" aria-hidden="true"></span>
          <button type="button" data-act="ask-mode" data-v="help" aria-pressed="${S.askMode === "help"}">${icon("help")}Does this help me?</button>
          <button type="button" data-act="ask-mode" data-v="idea" aria-pressed="${S.askMode === "idea"}">${icon("lightbulb")}Discuss my idea</button></div>
        ${S.askMode === "idea" ? `<label class="sr" for="idea">Your idea</label><textarea id="idea" placeholder="Type or dictate your idea. A sentence is enough.">${esc(S.askIdea)}</textarea>` : ""}
        <div class="acts"><a class="pill white lg" id="open-claude" href="${esc(claudeUrl(prompt))}" target="_blank" rel="noopener" data-link="open-claude">${icon("sparkle")}<span>Open in Claude</span></a>
          <button class="pill glass lg" type="button" data-act="copy-prompt">${icon("copy")}<span>Copy prompt</span></button></div>
        <details class="peek"><summary>See what Claude gets</summary><pre id="prompt-preview">${esc(prompt)}</pre></details>
        <p class="fine">It’s also saved to For Claude, here and on the PC.</p>
      </div>
    </div>`;
  const ta = $("#idea");
  if (ta) {
    ta.addEventListener("input", () => {
      S.askIdea = ta.value;
      const p = promptFor(it, S.askMode, ta.value);
      $("#open-claude").href = claudeUrl(p);
      $("#prompt-preview").textContent = p;
    });
  }
}
function closeAsk() {
  const sheet = $("#sheet");
  if (sheet.hidden) return;
  sheet.classList.remove("on");
  document.body.classList.remove("sheet-open");
  C.hideTip();
  const back = S.askTrigger;
  closeTimer = setTimeout(() => { sheet.hidden = true; sheet.innerHTML = ""; }, reduced.matches ? 0 : 260);
  if (back?.isConnected) back.focus({ preventScroll: true });
}
async function saveFor(item, mode = "help", idea = "", quiet = false) {
  try {
    await post("/api/news/save", { item, mode, idea });
    await loadSaved();
    paintSaveButtons(item.id);
    if (!quiet) toast("Saved for Claude");
  } catch (e) { toast(e.message); }
}

// ---------- actions ----------
const itemFor = (el) => S.byId.get(el.dataset.id) || S.synth.get(el.dataset.id);
async function act(name, el) {
  if (name.startsWith("reel-")) return reels.act(name, el);
  if (name.startsWith("set-")) return settings.act(name, el);
  switch (name) {
    case "needs-pc": toast(source.REASON[el.dataset.why] || source.REASON.default); break;
    case "clear": S.query = ""; $("#q").value = ""; S.limit = PAGE; if (S.topic) location.hash = "#/discover"; else renderView(); break;
    case "more": S.limit += PAGE; renderView(true); break;
    case "page": page(el.closest("[data-row]"), Number(el.dataset.dir)); break;
    case "pick-repo": {
      S.repoPick = Number(el.dataset.k);
      for (const t of $$('[data-act="pick-repo"]')) t.setAttribute("aria-pressed", String(t === el));
      const r = S.repos.today?.[S.repoPick];
      if (r && $("#repo-foot")) $("#repo-foot").innerHTML = repoFoot(r);
      break;
    }
    case "repo-list": S.repoList = el.dataset.v; renderView(true); break;
    case "ask": { const it = itemFor(el); if (it) openAsk(it, el); break; }
    case "save": {
      const it = itemFor(el);
      if (!it) break;
      const had = plainSaved(it.id);
      if (had) {
        try { await post("/api/news/unsave", { key: had.key }); await loadSaved(); paintSaveButtons(it.id); toast("Removed from Saved"); } catch (e) { toast(e.message); }
      } else saveFor(it);
      break;
    }
    case "ask-mode": {
      S.askMode = el.dataset.v;
      paintAsk();
      syncInk($("#sheet .seg.mode"));
      ($("#idea") || $('#sheet [data-act="ask-mode"][aria-pressed="true"]'))?.focus();
      break;
    }
    case "copy-prompt": {
      const p = promptFor(S.ask, S.askMode, askIdea());
      try { await navigator.clipboard.writeText(p); toast("Prompt copied. Paste it into Claude."); } catch { window.prompt("Copy this", p); }
      saveFor(S.ask, S.askMode, askIdea(), true);
      break;
    }
    case "copy-saved": {
      const e = S.saved[Number(el.dataset.k)];
      if (!e) break;
      const p = promptFor(e.item, e.mode, e.idea);
      try { await navigator.clipboard.writeText(p); toast("Prompt copied"); } catch { window.prompt("Copy this", p); }
      break;
    }
    case "unsave": await post("/api/news/unsave", { key: el.dataset.key }).catch(() => {}); await loadSaved(); renderView(true); break;
    case "close": closeAsk(); break;
    case "refresh": {
      try {
        await post("/api/news/refresh");
        S.status = { ...(S.status || {}), refreshing: true };
        paintEdition();
        toast("Pulling the latest news…");
        pollRefresh();
      } catch (e) { toast(e.message); }
      break;
    }
    case "search": {
      document.body.classList.toggle("searching");
      if (document.body.classList.contains("searching")) {
        $("#q").focus();
        if (S.route !== "discover") location.hash = "#/discover";
      }
      break;
    }
    default: break;
  }
}
function pollRefresh() {
  const tick = async () => {
    try {
      S.status = await api("/api/news/status");
      if (S.status.refreshing) { setTimeout(tick, 2500); return; }
      await Promise.all([loadFeed(), loadCharts()]);
      S.repos = {};
      loadRepos("today");
      toast(`Up to date · ${plural(S.status.last?.ok ?? 0, "story", "stories")}`);
      render();
    } catch { setTimeout(tick, 4000); }
  };
  setTimeout(tick, 2500);
}

// ---------- Reels and Settings: the launcher's own modules ----------
const reels = createReels({
  $, $$, esc, g, api, post, toast, copy, openPanel() {}, closePanel() {}, place: "news",
  ask: (item, trigger) => openAsk(S.byId.get(item.id) || item, trigger), // MK News' own Ask Claude sheet
});
const settings = createSettings({ $, esc, g, api, post, toast, ago, theme: () => "dark", setTheme() {}, place: "news", frame: settingsFrame }, reels);

// ---------- data ----------
function index() {
  S.byId = new Map();
  for (const it of S.items) S.byId.set(it.id, it);
  for (const list of Object.values(S.repos)) for (const r of list || []) S.byId.set(r.id, r);
}
async function loadFeed() {
  try {
    S.items = (await api("/api/news/feed?limit=300")).items || [];
    S.offline = false; S.error = ""; S.feedAt = Date.now();
    localSet("feed", S.items); localSet("feedAt", S.feedAt);
  } catch (e) {
    S.offline = !!e.offline; S.error = e.offline ? "" : e.message;
  }
  index();
}
async function loadCharts() { try { S.charts = await api("/api/news/charts"); localSet("charts", S.charts); } catch { /* the cached copy stays */ } }
async function loadStatus() { try { S.status = await api("/api/news/status"); setMyWork(S.status?.my_work); localSet("status", S.status); } catch { /* optional */ } }
async function loadSaved() { try { S.saved = (await api("/api/news/saved")).items || []; } catch { /* optional */ } }
async function loadRepos(list) {
  const store = S.repos;
  if (store[list] === null) return; // already on its way
  store[list] = null;
  let items = [];
  try { items = (await api(`/api/news/repos?list=${encodeURIComponent(list)}&limit=30`)).items || []; } catch { /* empty list */ }
  if (S.repos !== store) return; // a refresh replaced the lists meanwhile
  store[list] = items;
  for (const r of items) S.byId.set(r.id, r);
  if (list === "today" && S.route === "home") {
    const panel = $(".panel.repos");
    if (panel) { panel.outerHTML = reposPanel(); mountRows($("#view")); }
  }
  if (S.route === "discover" && S.sub === "repos" && S.repoList === list) renderView(true);
}

function lightHero() {
  const hero = $(".billboard");
  if (!hero) { ambient.dim(true); return; }
  ambient.dim(false);
  liftHero();
  const img = $(".hero-img", hero);
  const ready = () => img.classList.add("on");
  if (img.complete && img.naturalWidth) ready(); else img.addEventListener("load", ready, { once: true });
  ambient.light(img.getAttribute("src"));
}

// The billboard's picture reaches up behind the bar to the top of the page.
function liftHero() {
  const hero = $(".billboard");
  if (hero) hero.style.setProperty("--lift", `${hero.offsetTop}px`);
}

// ---------- shell ----------
function paintEdition() {
  const el = $("#edition");
  if (!el) return;
  const st = S.status, last = st?.last;
  let a, b;
  if (S.offline) {
    a = `${icon("offline")}Offline`;
    b = S.items.length ? `showing the feed saved ${esc(ago(S.feedAt))} (${plural(S.items.length, "story", "stories")})` : "nothing saved on this device yet";
  } else if (st?.refreshing) {
    a = `<span class="pulse" aria-hidden="true"></span>Pulling the latest news…`;
    b = last ? `last update ${esc(ago(last.at))}` : "";
  } else if (last && S.route !== "home") {
    a = `Updated ${esc(ago(last.at))}`;
    b = "";
  } else if (last) {
    const n = last.ok || S.items.length;
    const srcs = Object.keys(last.counts || {}).length;
    a = `${plural(n, "story", "stories")}${srcs ? ` from ${plural(srcs, "source")}` : ""}`;
    b = `updated ${esc(ago(last.at))}`;
  } else {
    a = S.items.length ? plural(S.items.length, "story", "stories") : "Not updated yet";
    b = "";
  }
  el.classList.toggle("compact", !b);
  el.innerHTML = `<span class="ed-a">${a}</span><span class="ed-b">${b ? `<i aria-hidden="true">·</i>${b}` : ""}<i aria-hidden="true">·</i><button class="link" type="button" data-act="refresh"${st?.refreshing ? " disabled" : ""}>${icon("refresh")}Refresh</button></span>`;
}
function paintChips() {
  const el = $("#chips");
  const home = S.route === "home";
  const visible = TOPICS.filter((t) => !S.items.length || S.items.some(t.test));
  const onTopic = (id) => S.route === "discover" && S.sub === "stories" && S.topic === id;
  el.innerHTML = (home ? `<a class="chip lead" href="#/home" aria-current="page">For you</a>` : `<a class="chip lead" href="#/discover" aria-current="${onTopic("") ? "page" : "false"}">All</a>`)
    + visible.map((t) => `<a class="chip" href="#/discover?t=${t.id}" aria-current="${onTopic(t.id) ? "page" : "false"}">${esc(t.label)}</a>`).join("");
}
function renderView(keepScroll = false) {
  const y = scrollY;
  S.after = [];
  const v = $("#view");
  if (S.route !== "reels") reels.unmount();
  if (S.route === "reels") { v.innerHTML = reels.render(); S.after.push(() => reels.mount()); }
  else if (S.route === "settings") { v.innerHTML = settingsFrame(settings.render()); S.after.push(() => settings.mount()); }
  else v.innerHTML = S.route === "discover" ? discoverView() : S.route === "saved" ? savedView() : homeView();
  mountRows(v);
  syncInk($(".seg", v));
  const jobs = S.after;
  S.after = [];
  for (const fn of jobs) { try { fn(); } catch (e) { console.error(e); } }
  if (S.route === "home") lightHero(); else ambient.dim(true);
  document.documentElement.classList.toggle("route-reels", S.route === "reels");
  if (keepScroll) scrollTo(0, y);
}
function render() {
  document.body.dataset.view = S.route;
  const tabOf = S.route === "saved" ? "settings" : S.route; // Saved sits inside Settings
  for (const a of $$(".tabs [data-route], .tabbar [data-route]")) a.setAttribute("aria-current", a.dataset.route === tabOf ? "page" : "false");
  for (const a of $$(".tabbar a")) a.innerHTML = tabInner(a.dataset.route, a.dataset.route === tabOf);
  syncInk($(".tabs"));
  paintChips();
  paintEdition();
  const titles = { home: "MK News", reels: "Reels · MK News", discover: "Topics · MK News", settings: "Settings · MK News", saved: "Saved · MK News" };
  document.title = titles[S.route];
  renderView();
}
function tabInner(route, on) {
  const [, label, , name] = TABS.find((t) => t[0] === route);
  return `${icon(on ? `${name}-fill` : name)}<span>${label}</span>`;
}
function settingsFrame(html) { return `<div class="page"><header class="list-head"><h1>Settings</h1></header>${html}</div>`; }
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function parseHash() {
  const h = location.hash.startsWith("#/") ? location.hash.slice(2) : "";
  const [path, qs] = h.split("?");
  const q = new URLSearchParams(qs || "");
  const parts = path.split("/").filter(Boolean);
  const legacy = { foryou: ["home"], models: ["discover", "models"], repos: ["discover", "repos"] };
  let [route, sub] = own(legacy, parts[0]) ? legacy[parts[0]] : parts;
  if (!ROUTES.includes(route)) route = "home";
  S.route = route;
  S.sub = route === "discover" ? (["models", "repos"].includes(sub) ? sub : "stories") : "";
  S.topic = route === "discover" && own(TOPIC, q.get("t")) ? q.get("t") : "";
  S.provider = q.get("p") || "";
  S.limit = PAGE;
}
function route() {
  if (location.hash && !location.hash.startsWith("#/")) return; // the skip link, not a route
  const was = `${S.route}/${S.sub}`;
  parseHash();
  if (S.route !== "discover") document.body.classList.remove("searching");
  if (`${S.route}/${S.sub}` !== was) window.scrollTo(0, 0);
  render();
}
function shell() {
  const tabs = TABS.map(([r, l, h]) => [r, r === "discover" ? "Discover" : l, h]);
  $("#bar").innerHTML = `
    <a class="wordmark" href="#/home" aria-label="MK News, home">MK News</a>
    <div class="bar-mid">
      <nav class="tabs" aria-label="Sections"><span class="ink" aria-hidden="true"></span>${tabs.map(([r, l, h]) => `<a class="tab" href="${h}" data-route="${r}">${l}</a>`).join("")}</nav>
      <label class="search">${icon("search")}<span class="sr">Search news</span><input id="q" type="search" placeholder="Search news…" autocomplete="off" spellcheck="false" enterkeyhint="search"></label>
    </div>
    <div class="bar-end">
      <a class="launcher" href="../">${icon("back")}<span>Launcher</span></a>
      <a class="round phone-only" href="../" aria-label="Back to the launcher">${icon("grid")}</a>
      <button class="round phone-only" type="button" data-act="search" aria-label="Search news">${icon("search")}</button>
    </div>`;
  $("#tabbar").innerHTML = TABS.map(([r, , h]) => `<a href="${h}" data-route="${r}">${tabInner(r, false)}</a>`).join("");
}
function bind() {
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-act]");
    if (a && !a.disabled) { e.preventDefault(); act(a.dataset.act, a); return; }
    if (e.target.closest('[data-link="open-claude"]') && S.ask) saveFor(S.ask, S.askMode, askIdea(), true);
  });
  document.addEventListener("keydown", (e) => {
    const sheet = $("#sheet");
    if (!sheet.hidden) {
      if (e.key === "Escape") { closeAsk(); return; }
      if (e.key === "Tab") { // keep focus inside the open sheet
        const f = $$("button, a[href], textarea, summary, [tabindex='0']", sheet).filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        if (!sheet.contains(document.activeElement)) { e.preventDefault(); f[0].focus(); }
        else if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
      return;
    }
    if (S.route === "reels" && reels.keydown(e)) { e.preventDefault(); return; }
    if (e.key === "/" && !/input|textarea/i.test(document.activeElement?.tagName || "")) { e.preventDefault(); $("#q").focus(); }
  });
  const q = $("#q");
  let timer;
  q.addEventListener("input", () => {
    S.query = q.value.trim();
    S.limit = PAGE;
    if (S.route !== "discover" || S.sub !== "stories") { location.hash = S.topic ? `#/discover?t=${S.topic}` : "#/discover"; return; }
    clearTimeout(timer);
    timer = setTimeout(() => renderView(true), 120);
  });
  q.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && q.value) { e.stopPropagation(); q.value = ""; S.query = ""; renderView(true); }
    if (e.key === "Enter") q.blur();
  });
  // Story pictures fade in once loaded; dead ones disappear and leave the artwork (inline handlers are blocked by the CSP).
  document.addEventListener("load", (e) => { if (e.target.tagName === "IMG" && e.target.classList.contains("pic")) e.target.classList.add("on"); }, true);
  document.addEventListener("load", (e) => { if (e.target.tagName === "IMG" && e.target.classList.contains("logo")) e.target.closest(".logo-tile")?.classList.add("on"); }, true);
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (img.tagName !== "IMG") return;
    if (img.classList.contains("pic") || img.classList.contains("logo")) {
      img.closest(".has-pic, .has-logo")?.classList.remove("has-pic", "has-logo", "card-pic"); // the artwork underneath returns
      (img.closest(".logo-tile") || img).remove();
    } else if (img.classList.contains("hero-img") && img.dataset.art && img.getAttribute("src") !== img.dataset.art) {
      img.src = img.dataset.art;
      ambient.light(img.dataset.art);
    }
  }, true);
  window.addEventListener("hashchange", route);
  const bar = () => document.documentElement.style.setProperty("--bar", Math.min(1, scrollY / 80).toFixed(3));
  window.addEventListener("scroll", bar, { passive: true });
  bar();
  let rz;
  window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { syncInk($(".tabs")); syncInk($("#view .seg")); liftHero(); }, 120); });
  document.fonts?.ready.then(() => { syncInk($(".tabs")); syncInk($("#view .seg")); liftHero(); });
}

async function boot() {
  ambient = createAmbient($("#light"));
  shell();
  bind();
  S.items = localGet("feed", []);
  S.feedAt = localGet("feedAt", 0);
  S.charts = localGet("charts", null);
  S.status = localGet("status", null);
  setMyWork(S.status?.my_work);
  index();
  parseHash();
  render();
  await Promise.all([loadFeed(), loadCharts(), loadStatus(), loadSaved()]);
  render();
  loadRepos("today");
  if (source.BACKUP && !source.token()) { location.href = "../#/connect"; return; }
  if (source.BACKUP && source.snapshotAt()) toast(`Backup: MK News as your PC last saw it, ${source.whenWords(source.snapshotAt())}`);
  else if (S.offline) toast(S.items.length ? "Offline: showing the last saved feed" : "Can’t reach the PC right now");
  if (S.status?.refreshing) pollRefresh();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("../sw.js").catch(() => {});
}
boot();
