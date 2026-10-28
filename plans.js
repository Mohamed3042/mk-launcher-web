// Plans: living business plans, read from the private plans repo through the PC (never the backup).
// A plan's page has six tabs: Overview (the hero card with the lit launch line, the next action, "What needs you" and
// the plan in layers), Decisions, Money, System map (every part, by status), Evidence and Where it lives. A part, a
// stop, a layer or a decision opens as the side panel on a computer and the bottom sheet on a phone. "Changed since
// your last look" compares the plan with what he last saw (the server remembers it). Home shows a Plans rail; the
// library lists every plan and starts a new one from the template on GitHub. English or Arabic (right to left).
// The plan's data and its English words come from the server (core/plans.py); rules without a DOM live in plans-rules.js.
import * as R from "./plans-rules.js";

const SERIES = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s7)", "var(--s8)", "var(--s6)"];
// A status is always a shape and a word: filled check, ring with a clock, dashed ring, filled person, triangle.
const SHAPES = {
  live: '<circle class="f" cx="8" cy="8" r="7"/><path class="k" d="M4.9 8.2l2 2.1 4.2-4.5"/>',
  built: '<circle class="r" cx="8" cy="8" r="6.2"/><path class="h" d="M8 4.9v3.4l2.1 1.3"/>',
  "not-built": '<circle class="d" cx="8" cy="8" r="6.2"/>',
  "needs-you": '<circle class="f" cx="8" cy="8" r="7"/><circle class="kf" cx="8" cy="6.1" r="2"/><path class="k" d="M4.7 11.9c.8-1.6 1.9-2.3 3.3-2.3s2.5.7 3.3 2.3"/>',
  conflict: '<path class="t" d="M8 1.9l6.4 11.2H1.6z"/><path class="x" d="M8 6.1v3.2M8 11.2v.05"/>',
  open: '<circle class="r" cx="8" cy="8" r="6.2"/><path class="h" d="M6.3 6.4a1.8 1.8 0 0 1 3.5.6c0 1.2-1.8 1.4-1.8 2.5M8 11.3v.05"/>',
};
const si = (s, cls = "") => `<svg class="pln-si ${cls}" data-s="${s}" viewBox="0 0 16 16" aria-hidden="true">${SHAPES[s] || SHAPES["not-built"]}</svg>`;
const CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.3 8.4l2.4 2.4 5-5.3"/></svg>';
const TAB_EYE = { decisions: "eye_decisions", money: "eye_money", map: "eye_map", evidence: "eye_evidence", where: "eye_where" };

export function createPlans(d) {
  const { $, $$, esc, g, api, post, toast, openPanel, closePanel, offlineBar, localGet, localSet, backup, redraw, liveOrigin } = d;
  const P = { data: null, error: "", needsPc: false, cachedAt: 0, loaded: false, timer: null, id: null, tab: "overview", sig: "",
    filter: localGet("plansFilter", "all"), expanded: localGet("plansExpanded", false), lang: R.langOf(localGet("plansLang", ""), globalThis.navigator?.language),
    shown: null, baseline: new Set(), focus: null, view: localGet("plansView", "map"), node: "", depth: 0, zoom: 1, ro: null };
  const t = (key, vars) => R.text(P.lang)(key, vars);
  const W = () => R.words(P.data, P.lang);
  const ar = () => P.lang === "ar";
  const dirAttr = () => (ar() ? ' dir="rtl" lang="ar"' : ' dir="ltr" lang="en"');
  const fwd = () => g(ar() ? "chevron-left" : "chevron-right");
  const ago = (x) => R.since(x, Date.now(), P.lang);

  // ---------- data ----------
  async function load() {
    try {
      const data = await api("/api/plans");
      // the page redraws only when a plan, its changes or the sync state change; the "N min ago" words update in place
      const sig = JSON.stringify([data.plans, data.sync?.state, data.sync?.source]);
      const fresh = sig !== P.sig || !P.loaded || P.needsPc || P.error || P.cachedAt;
      P.error = ""; P.needsPc = false; P.cachedAt = 0; P.data = data; P.sig = sig; P.loaded = true;
      localSet("plans", { data, at: Date.now() });
      if (fresh) redraw(); else touch();
    } catch (e) {
      P.loaded = true;
      if (e.code === "needs-pc" || backup) P.needsPc = true;
      else {
        P.error = e.message || "The PC didn't answer";
        const saved = localGet("plans", null); // his own device: the last copy it saw, shown under the offline bar
        if (saved?.data && !P.data) { P.data = saved.data; P.cachedAt = saved.at; }
      }
      redraw();
    }
  }
  function touch() {
    const e = current() || entries()[0];
    if (!e) return;
    const s = R.syncLine(P.data.sync, e, Date.now(), P.lang), short = R.syncShort(P.data.sync, e, Date.now(), P.lang);
    $$(".pln-sync-st").forEach((el) => {
      const line = el.dataset.short ? short : s;
      el.innerHTML = `<i aria-hidden="true"></i>${esc(line.text)}`;
      el.title = line.title;
      el.closest("[data-tone]")?.setAttribute("data-tone", line.tone);
    });
  }
  const entries = () => P.data?.plans || [];
  const current = () => R.pick(entries(), P.id);
  const entryOf = (id) => entries().find((e) => e.id === id) || current();

  // He has looked at a plan: the first look sets what "since your last look" compares with; a look at changes
  // counts once he taps Got it or leaves the plan for another place in the launcher (an app switch is not a look).
  async function markSeen(id, sig, then) {
    try { await post("/api/plans/seen", { id, sig: sig || "" }); } catch { return false; } // a stale or offline look is simply not recorded
    const e = entries().find((x) => x.id === id);
    if (e && e.sig === sig) { e.changes = []; e.seen_at = Date.now() / 1000; } // so the Home rail stops saying "new" at once
    if (then) load(); else redraw();
    return true;
  }
  function leave() {
    const s = P.shown;
    P.shown = null;
    if (s) markSeen(s.id, s.sig);
  }
  function remember(e) {
    if (backup || P.cachedAt || !e?.plan || !e.sig) return;
    if (e.changes === null && !P.baseline.has(e.id)) {
      P.baseline.add(e.id);
      markSeen(e.id, e.sig).then((ok) => { if (!ok) P.baseline.delete(e.id); }); // a failed first look is tried again
      return;
    }
    if (P.shown && P.shown.id !== e.id) leave();
    if (e.changes?.length && P.tab === "overview") P.shown = { id: e.id, sig: e.sig }; // only once the before and after were on screen
  }

  // ---------- the page ----------
  function render() {
    if (P.needsPc) return backupCard();
    if (!P.data) return P.error ? `${offlineBar()}${errorCard()}` : skeleton();
    const list = entries();
    if (!list.length) return `${offlineBar()}${emptyCard()}`;
    if (P.id === R.LIBRARY) return `${offlineBar()}${library(list)}`;
    const e = current();
    if (!e) return `${offlineBar()}${P.id ? `<div class="note">${g("alert")}<div>${esc(t("noPlanCalled", { id: P.id }))} <a class="link-btn" href="${R.href(R.LIBRARY)}">${esc(t("allPlans"))}</a></div></div>` : ""}${library(list)}`;
    if (!e.plan) return `${offlineBar()}${toolbar(e)}${brokenCard(e)}`;
    remember(e);
    return `${offlineBar()}${planPage(e)}`;
  }

  function skeleton() {
    const row = `<div class="skeleton pln-sk-row"></div>`;
    return `<div class="pln pln-loading" aria-busy="true" aria-label="${esc(t("loading"))}"><div class="skeleton pln-sk-bar"></div><div class="skeleton pln-sk-tabs"></div>
      <div class="pln-top"><div class="skeleton pln-sk-card"></div><div class="skeleton pln-sk-card side"></div></div>
      <div class="skeleton pln-sk-head"></div>${row.repeat(4)}</div>`;
  }
  function errorCard() {
    return `<div class="pln-empty"${dirAttr()}><span class="pln-empty-icon">${g("alert")}</span><h2>${esc(t("didntLoad"))}</h2><p>${esc(P.error)}</p>
      <button class="btn primary" type="button" data-act="pln-reload">${g("refresh")}${esc(t("tryAgain"))}</button></div>`;
  }
  function emptyCard() {
    const s = P.data.sync || {};
    const off = s.source === "off" || s.state === "off";
    const waiting = s.source === "github" && !s.synced_at && !["offline", "error"].includes(s.state);
    const where = s.source === "local" ? t("whereLocal", { folder: s.folder || "" }) : t("whereRepo");
    const body = off ? t("syncOffText", { why: s.detail ? ` (${s.detail})` : "" }) : waiting ? t("fetchingText") : t("noPlansText", { where });
    return `<div class="pln-empty"${dirAttr()}><span class="pln-empty-icon">${g("map")}</span>
      <h2>${esc(off ? t("syncOff") : waiting ? t("fetching") : t("noPlans"))}</h2><p>${esc(body)}</p>
      ${canMake() ? `<button class="btn primary" type="button" data-act="pln-new">${g("plus")}${esc(t("newPlan"))}</button>` : ""}
      ${s.url && s.source !== "local" ? `<a class="btn" href="${esc(s.url)}" target="_blank" rel="noopener">${g("github")}${esc(t("openRepo"))}</a>` : ""}
      ${["offline", "error"].includes(s.state) ? `<p class="pln-empty-why">${esc(R.syncLine(s, null, Date.now(), P.lang).text)}</p>` : ""}</div>`;
  }
  function backupCard() {
    const live = liveOrigin?.();
    return `${offlineBar()}<div class="pln-empty"${dirAttr()}><span class="pln-empty-icon">${g("lock")}</span><h2>${esc(t("privateHead"))}</h2>
      <p>${esc(t("privateText"))}</p>
      ${live ? `<a class="btn primary" href="${esc(live)}/#/plans">${g("monitor")}${esc(t("tryLive"))}</a>` : ""}</div>`;
  }
  function brokenCard(e) {
    const pr = e.problem || {};
    return `<div class="pln-empty"${dirAttr()}><span class="pln-empty-icon">${g("alert")}</span><h2>${esc(t("brokenHead"))}</h2>
      <p>${esc(t("brokenText", { file: e.file, n: pr.count > 1 ? t("brokenN", { n: pr.count }) : "" }))}</p>
      <ul class="pln-problems" dir="ltr">${(pr.lines || []).map((l) => `<li class="mono">${esc(l)}</li>`).join("")}</ul>
      ${e.file_url ? `<a class="btn" href="${esc(e.file_url)}" target="_blank" rel="noopener">${g("github")}${esc(t("openOnGithub"))}</a>` : ""}</div>`;
  }

  // A new plan is made on GitHub, so only when the plans come from GitHub (not a Mac's own folder, not with sync off).
  const canMake = () => !backup && !!P.data?.template && P.data?.sync?.source === "github" && !!P.data?.sync?.url;

  // ---------- the library: every plan, and a new one from the template ----------
  function miniLine(e) {
    const stops = e.plan.stops || [];
    if (!stops.length) return "";
    return `<span class="pln-mline" aria-hidden="true" style="--n:${stops.length}">${stops.map((s) => `<i data-state="${s.state}"></i>`).join("")}</span>`;
  }
  function miniRing(done, now, total, size = 52) {
    const r = R.ring(done, now, total, 22);
    return `<svg class="pln-mring" viewBox="0 0 52 52" style="width:${size}px;height:${size}px" aria-hidden="true"><circle class="trk" cx="26" cy="26" r="22"/>${r.now ? `<circle class="now" cx="26" cy="26" r="22" stroke-dasharray="${r.now.toFixed(2)} ${r.c.toFixed(2)}" stroke-dashoffset="${r.nowOffset.toFixed(2)}"/>` : ""}${r.done ? `<circle class="arc" cx="26" cy="26" r="22" stroke-dasharray="${r.done.toFixed(2)} ${r.c.toFixed(2)}"/>` : ""}</svg>`;
  }
  function library(list) {
    const cards = list.map((e) => {
      if (!e.plan) return `<a class="pln-lib broken" href="${R.href(e.id)}"><span class="pln-lib-top">${si("conflict")}<b dir="auto">${esc(e.id)}</b></span><span class="pln-lib-sum" dir="auto">${esc(t("hasProblem", { line: e.problem?.lines?.[0] || "" }))}</span></a>`;
      const s = e.derived.stops, n = e.derived.needs_you.length, next = R.nextOf(e);
      return `<a class="pln-lib" href="${R.href(e.id)}" style="--plan:${esc(e.plan.accent)}">
        ${miniLine(e)}
        <span class="pln-lib-top">${miniRing(s.done, s.now.length, s.total)}
        <span><b class="pln-lib-title" dir="auto">${esc(e.plan.title)}</b><span class="pln-lib-meta" dir="auto">${esc(e.plan.kind || t("plans"))} · ${esc(s.total ? t("libStops", { a: s.done, b: s.total }) : t("noStopsYet"))}</span></span></span>
        <span class="pln-lib-sum" dir="auto">${esc(e.plan.summary)}</span>
        ${next ? `<span class="pln-lib-next"><small>${esc(t("nextAction"))}</small><b dir="auto">${esc(next.text)}</b></span>` : ""}
        <span class="pln-lib-foot">${n ? `<span class="pln-badge" data-s="needs-you">${si("needs-you")}${esc(t(n === 1 ? "needsYouShort" : "needYouShort", { n }))}</span>` : `<span class="pln-badge" data-s="live">${si("live")}${esc(t("nothingNeedsYou"))}</span>`}
        <span class="pln-lib-when">${esc(t("updatedShort", { date: R.shortDate(e.plan.updated, P.lang) }))}</span></span></a>`;
    }).join("");
    const make = canMake() ? `<button type="button" class="pln-lib pln-lib-new" data-act="pln-new"><span class="pln-new-tile">${g("plus")}</span><b>${esc(t("newPlan"))}</b><span class="pln-lib-meta">${esc(t("fromTemplate"))}</span></button>` : "";
    const s = P.data?.sync;
    const sync = s ? R.syncShort(s, list[0], Date.now(), P.lang) : null;
    return `<div class="pln-libpage"${dirAttr()}><header class="pln-libhead"><div><h1 class="pln-libtitle">${esc(t("libTitle"))}</h1><p>${esc(t("libSub"))}</p>
      ${sync ? `<p class="pln-sync" data-tone="${sync.tone}">${g("github")}<span class="pln-sync-st" data-short="1" title="${esc(sync.title)}"><i aria-hidden="true"></i>${esc(sync.text)}</span></p>` : ""}</div>${langBtn()}</header>
      <div class="pln-lib-grid">${cards}${make}</div></div>`;
  }

  // The Plans rail on Home: each plan's progress, what needs him and its next action, one tap from the launcher.
  function homeRail() {
    if (backup || !P.data) return "";
    const list = entries().filter((e) => e.plan);
    if (!list.length) return "";
    const cards = list.slice(0, 3).map((e) => {
      const s = e.derived.stops, n = e.derived.needs_you.length, next = R.nextOf(e), ch = e.changes?.length || 0;
      return `<a class="pln-rc" href="${R.href(e.id)}" style="--plan:${esc(e.plan.accent)}">
        <span class="pln-rc-ring">${miniRing(s.done, s.now.length, s.total, 56)}<span class="num">${s.done}/${s.total}</span></span>
        <span class="pln-rc-main"><b class="pln-rc-title" dir="auto">${esc(e.plan.title)}</b>
          <span class="pln-rc-meta">${esc(s.total ? `${s.done} of ${s.total} stops done` : "No stops yet")}${ch ? ` · <span class="pln-rc-ch">${ch} new since your last look</span>` : ""}</span>${miniLine(e)}</span>
        <span class="pln-rc-need"><b class="num">${n}</b><span>${n === 1 ? "needs you" : "need you"}</span></span>
        ${next ? `<span class="pln-rc-next"><small>Next action</small><b dir="auto">${esc(next.text)}</b></span>` : ""}${g("chevron-right", "pln-rc-go")}</a>`;
    }).join("");
    return `<section class="section pln-rail" style="--plan:${esc(list[0].plan.accent)}"><div class="section-head"><h2>Plans</h2><span class="meta">${list.length} plan${list.length === 1 ? "" : "s"}</span><span class="grow"></span><a class="link-btn" href="${R.href(R.LIBRARY)}">See all</a></div>
      <div class="pln-rail-list">${cards}${canMake() ? `<button type="button" class="pln-rc-new" data-act="pln-new">${g("plus")}<span><b>New plan</b><small>From the template</small></span></button>` : ""}</div></section>`;
  }

  // ---------- one plan ----------
  function planPage(e) {
    const accent = e.plan.accent || "#e9a54b";
    document.documentElement.style.setProperty("--glow", accent); // the room takes the plan's own light
    const empty = !e.plan.stops.length && !e.plan.layers.length;
    if (P.tab === R.VIEW) return `<div class="pln pln-mapmode" style="--plan:${esc(accent)}"${dirAttr()} data-tab="view">${toolbar(e)}${banners(e)}${empty || !e.plan.layers.length ? emptyPlan(e) : mapPage(e)}</div>`;
    const body = { overview: () => overview(e, empty), decisions: () => decisionsTab(e), money: () => moneyTab(e), map: () => mapTab(e),
      evidence: () => evidenceTab(e), where: () => whereTab(e) }[P.tab] || (() => overview(e, empty));
    return `<div class="pln" style="--plan:${esc(accent)}"${dirAttr()} data-tab="${P.tab}">${toolbar(e)}${banners(e)}${tabs(e)}<div class="pln-body">${body()}</div></div>`;
  }

  function langBtn() {
    return `<button type="button" class="pln-langbtn" data-act="pln-lang" aria-label="${esc(t("langLabel"))}" lang="${ar() ? "en" : "ar"}">${esc(t("lang"))}</button>`;
  }
  function syncButton() {
    if (backup) return "";
    const local = P.data.sync?.source === "local";
    return `<button class="icon-btn pln-syncbtn" type="button" data-act="pln-sync" aria-label="${esc(local ? t("readAgain") : t("syncNowLong"))}" title="${esc(local ? t("readAgain") : t("syncNow"))}">${g("refresh")}</button>`;
  }
  function toolbar(e) {
    const sync = R.syncShort(P.data.sync, e, Date.now(), P.lang);
    const ch = e.changes?.length || 0;
    return `<div class="pln-bar">
      <nav class="pln-crumbs" aria-label="${esc(t("plans"))}"><a href="${R.href(R.LIBRARY)}" class="pln-crumb-back">${g(ar() ? "chevron-right" : "chevron-left")}<span>${esc(t("plans"))}</span></a>
        ${e.plan ? `<span class="pln-crumb-sep" aria-hidden="true">${fwd()}</span><span class="pln-crumb-here" dir="auto" aria-current="page">${esc(e.plan.title)}</span>` : ""}</nav>
      <span class="grow"></span>
      ${ch && P.tab !== "overview" ? `<a class="pln-chpill" href="${R.href(e.id, "overview")}">${g("history")}<span>${esc(t(ch === 1 ? "changed1" : "changedN", { n: ch }))}</span></a>` : ""}
      ${e.plan ? `<nav class="seg pln-viewseg" aria-label="${esc(t("viewLabel"))}"><a href="${R.mapHref(e.id)}"${P.tab === R.VIEW ? ' aria-current="page"' : ""}>${g("map")}<span>${esc(t("viewMap"))}</span></a><a href="${R.href(e.id, "overview")}"${P.tab !== R.VIEW ? ' aria-current="page"' : ""}>${g("list")}<span>${esc(t("viewDetails"))}</span></a></nav>` : ""}
      <span class="pln-barsync" data-tone="${sync.tone}">${g("github")}<span class="pln-sync-st" data-short="1" title="${esc(sync.title)}"><i aria-hidden="true"></i>${esc(sync.text)}</span></span>
      ${syncButton()}${langBtn()}</div>`;
  }

  function banners(e) {
    const s = P.data.sync || {};
    let out = "";
    if (["offline", "error"].includes(s.state) && s.source !== "local") {
      const line = R.syncLine(s, e, Date.now(), P.lang);
      out += `<div class="note pln-note" data-tone="${line.tone}" role="status">${g("offline")}<div><b>${esc(s.state === "offline" ? t("offlineHead") : t("errorHead"))}</b> ${esc(s.synced_at ? t("copyFrom", { when: R.stamp(s.synced_at, Date.now(), P.lang) }) : t("nothingSynced"))}${s.detail ? `<span class="pln-detail" dir="ltr">${esc(s.detail)}</span>` : ""}</div>${backup ? "" : `<button class="btn sm" type="button" data-act="pln-sync">${esc(t("tryAgain"))}</button>`}</div>`;
    }
    if (e.problem) {
      out += `<div class="note pln-note" data-tone="warn" role="status">${g("alert")}<div><b>${esc(t("problemHead"))}</b> ${esc(t("problemRest"))} <span dir="ltr">${esc(e.problem.lines?.[0] || "")}</span>${e.problem.count > 1 ? ` ${esc(t("andMore", { n: e.problem.count - 1 }))}` : ""}
        ${e.file_url ? `<a class="link-btn" href="${esc(e.file_url)}" target="_blank" rel="noopener">${esc(t("openFile"))}</a>` : ""}</div></div>`;
    }
    return out;
  }

  function tabs(e) {
    const p = e.plan, dv = e.derived;
    const count = { decisions: dv.decisions_open, map: dv.parts, evidence: p.evidence.length, where: p.sources.length };
    const shown = R.TABS.filter((k) => !(k === "money" && !hasCosts(p)));
    return `<nav class="pln-tabs" aria-label="${esc(t("tabsLabel"))}"><div class="pln-tabs-in">${shown.map((k) => `<a class="pln-tab" href="${R.href(e.id, k)}"${P.tab === k ? ' aria-current="page"' : ""}>${esc(t(`tab_${k}`))}${count[k] ? `<span class="count num">${count[k]}</span>` : ""}</a>`).join("")}</div></nav>`;
  }
  const hasCosts = (p) => !!(p.costs && ((p.costs.stages || []).length || (p.costs.fees || []).length || (p.costs.items || []).length));
  const tabHead = (key, title, meta = "") => `<header class="pln-tabhead"><p class="pln-eye">${esc(t(TAB_EYE[key]))}</p><div class="pln-tabhead-row"><h2 class="pln-tabtitle" id="pln-${key}-h">${esc(title)}</h2>${meta ? `<span class="meta">${esc(meta)}</span>` : ""}</div></header>`;

  // ---------- the map view (the owner's concept, 28 Oct): one big map of areas linked by arrows in launch order; tap an
  // area, a block or a stop and its own map opens; Back goes up one level to the whole picture ----------
  const HUES = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s7)", "var(--s8)", "var(--s6)"];
  const place = (i) => [2, 3, 4].map((c) => { const at = R.snakeAt(i, c); return `--r${c}:${at.r};--c${c}:${at.c}`; }).join(";");
  const FULL = '<svg class="g" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
  function mapPage(e) {
    const node = R.mapNode(P.node), p = e.plan;
    const depth = node.kind === "plan" ? 0 : node.kind === "part" ? 2 : 1;
    const motion = depth > P.depth ? " zin" : depth < P.depth ? " zout" : "";
    P.depth = depth;
    const level = node.kind === "layer" ? layerMap(e, node.id) : node.kind === "stop" ? stopMap(e, Number(node.id))
      : node.kind === "part" ? partMap(e, node.id) : wholeMap(e);
    const up = R.mapUp(p, P.node);
    const crumbs = [`<a href="${R.mapHref(e.id)}" dir="auto">${esc(p.title)}</a>`];
    if (node.kind === "part") {
      const hit = R.findPart(p, node.id);
      if (hit) crumbs.push(`<a href="${R.mapHref(e.id, "layer", hit.layer.id)}" dir="auto">${esc(hit.layer.name)}</a>`, `<span dir="auto">${esc(hit.part.title)}</span>`);
    } else if (node.kind === "layer") crumbs.push(`<span dir="auto">${esc(p.layers.find((l) => l.id === node.id)?.name || "")}</span>`);
    else if (node.kind === "stop") crumbs.push(`<span>${esc(t("stopShort", { n: node.id }))}</span>`);
    const nav = up === null ? "" : `<div class="pln-mv-nav"><a class="pln-mv-back" href="${up ? `${R.href(e.id, R.VIEW)}/${up}` : R.mapHref(e.id)}">${g(ar() ? "chevron-right" : "chevron-left")}<span>${esc(t("back"))}</span></a>
      <nav class="pln-mv-crumbs" aria-label="${esc(t("wholePlan"))}">${crumbs.join(`<span class="sep" aria-hidden="true">${fwd()}</span>`)}</nav></div>`;
    const tools = `<div class="pln-mv-tools" role="group" aria-label="${esc(t("viewMap"))}">
      <button type="button" class="icon-btn" data-act="pln-zoom" data-v="1" aria-label="${esc(t("zoomIn"))}">${g("plus")}</button>
      <span class="pln-mv-pct num" aria-live="polite">${Math.round(P.zoom * 100)}%</span>
      <button type="button" class="icon-btn" data-act="pln-zoom" data-v="-1" aria-label="${esc(t("zoomOut"))}">${g("minus")}</button>
      <button type="button" class="icon-btn" data-act="pln-zoom" data-v="0" aria-label="${esc(t("recenter"))}">${g("rotate-ccw")}</button>
      ${document.fullscreenEnabled ? `<button type="button" class="icon-btn pln-mv-full" data-act="pln-full" aria-label="${esc(t("fullscreen"))}">${FULL}</button>` : ""}</div>`;
    return `<section class="pln-mapv${motion}" data-level="${node.kind}">${nav}
      <header class="pln-mv-head">${level.badge}<div><h2 dir="auto">${esc(level.title)}</h2>${level.sub ? `<p>${level.sub}</p>` : ""}</div></header>${level.facts || ""}
      <div class="pln-mv-port"><div class="pln-mv-sizer"><div class="pln-mv-zoomer">${level.flow}</div></div></div>${level.after || ""}${tools}</section>`;
  }
  // A flow: nodes laid out like a snake (2 columns on a phone, 3 or 4 on a computer), dashed arrows drawn between the
  // nodes marked data-link once the page has its layout (drawLinks).
  const flow = (kind, nodes) => `<div class="pln-flow" data-kind="${kind}"><svg class="pln-links" aria-hidden="true"></svg>${nodes.join("")}</div>`;
  const statusMark = (part) => `<span class="pln-bmark" title="${esc(W().status[part.status])}">${si(part.status)}</span>`;
  function block(e, part, i, opts = {}) {
    const words = W(), st = R.steps(part), hue = opts.hue || "var(--plan)";
    const meta = opts.small ? "" : `<span class="pln-block-meta"><span class="pln-block-st" data-s="${part.status}">${esc(words.status[part.status])}</span>${st.total ? `<span class="pln-block-steps num">${esc(t("of", { a: st.done, b: st.total }))}</span>` : ""}</span>
      <small class="pln-block-where" dir="auto">${esc(opts.where || (part.stop != null ? t("stopShort", { n: part.stop }) : t("noStop")))} · ${esc(words.who[part.who])}</small>`;
    const moved = R.changedIds(e.changes).parts.has(part.id);
    return `<a class="pln-fnode pln-block${opts.small ? " sm" : ""}" href="${R.mapHref(e.id, "part", part.id)}" style="${place(i)};--a:${hue}" data-s="${part.status}"${opts.link ? " data-link" : ""}${moved ? " data-changed" : ""}
      aria-label="${esc(`${part.title}: ${words.status[part.status]}${part.stop != null ? `. ${t("stopShort", { n: part.stop })}` : ""}`)}">
      <span class="pln-block-icon">${g(part.icon || opts.icon || "layers")}</span><span class="pln-block-t"><b dir="auto">${esc(part.title)}</b>${meta}${moved ? `<span class="sr">${esc(t("changedTag"))}</span>` : ""}</span>${statusMark(part)}${!opts.small && st.total ? fwd() : ""}</a>`;
  }
  function wholeMap(e) {
    const p = e.plan, s = e.derived.stops, words = W(), n = e.derived.needs_you.length;
    const focus = R.focusLayer(p, R.nextOf(e));
    const areas = R.areaOrder(p).map(({ layer: l, n: num }, i, all) => {
      const sum = R.layerSummary(l, words.status_order), needs = sum.counts["needs-you"] || 0, hue = HUES[(num - 1) % HUES.length];
      const blocks = R.byStop(l.parts).map((part, k) => block(e, part, k, { small: true, icon: l.icon, hue })).join("");
      return `<div class="pln-fnode pln-area" style="${place(i)};--a:${hue}"${i < all.length - 1 ? " data-link" : ""}${l.id === focus ? " data-focus" : ""}>
        <a class="pln-area-head" href="${R.mapHref(e.id, "layer", l.id)}"><span class="pln-area-n num">${num}</span>
          <span class="pln-area-name"><b dir="auto">${esc(l.name)}</b><small>${si(needs ? "needs-you" : sum.live === sum.total && sum.total ? "live" : "not-built")}<span class="num">${esc(t("liveOf", { a: sum.live, b: sum.total }))}</span>${needs ? `<span class="pln-area-needs">${esc(t("mapNeeds", { n: needs }))}</span>` : ""}</small></span>${fwd()}</a>
        <div class="pln-area-blocks">${blocks}</div></div>`;
    });
    return { badge: `<span class="pln-mv-badge">${g("map")}</span>`, title: p.title,
      sub: `${esc(t("mapStopsOf", { a: s.done, b: s.total }))} · <b>${esc(t("mapNeeds", { n }))}</b> · ${esc(t("tapArea"))}`,
      flow: flow("areas", areas), after: `<p class="pln-mv-note">${esc(t("arrowsNote"))}</p>` };
  }
  function layerMap(e, id) {
    const order = R.areaOrder(e.plan), at = order.find((a) => a.layer.id === id);
    if (!at) return { badge: "", title: t("noParts"), flow: "" };
    const l = at.layer, sum = R.layerSummary(l, W().status_order), hue = HUES[(at.n - 1) % HUES.length];
    const parts = R.byStop(l.parts);
    const nodes = parts.map((part, i) => block(e, part, i, { icon: l.icon, hue, link: i < parts.length - 1 && part.stop != null && parts[i + 1].stop != null }));
    return { badge: `<span class="pln-mv-n num" style="--a:${hue}">${at.n}</span>`, title: l.name,
      sub: `${l.note ? `<span dir="auto">${esc(l.note)}</span> · ` : ""}${esc(t("liveOf", { a: sum.live, b: sum.total }))} · ${esc(t("tapBlock"))}`,
      flow: nodes.length ? flow("blocks", nodes) : `<p class="pln-line-empty">${esc(t("noParts"))}</p>` };
  }
  function stopMap(e, n) {
    const st = e.plan.stops.find((x) => x.n === n);
    if (!st) return { badge: "", title: t("noPartsTied"), flow: "" };
    const words = W(), parts = R.partsOfStop(e.plan, n);
    const nodes = parts.map(({ part, layer }, i) => block(e, part, i, { icon: layer.icon, where: layer.name }));
    return { badge: `<span class="pln-ph-stop" data-state="${st.state}"><span class="pln-node">${st.state === "done" ? CHECK : `<span class="num">${st.n}</span>`}</span></span>`, title: st.title,
      sub: `${esc(t("stopShort", { n }))} · ${esc(words.stop[st.state])} · ${esc(words.who[st.who])}${st.note ? ` · <span dir="auto">${esc(st.note)}</span>` : ""}`,
      flow: nodes.length ? flow("blocks", nodes) : `<p class="pln-line-empty">${esc(t("noPartsTied"))}</p>` };
  }
  function partMap(e, id) {
    const hit = R.findPart(e.plan, id);
    if (!hit) return { badge: "", title: t("noParts"), flow: "" };
    const { part, layer } = hit, words = W(), st = R.steps(part);
    const word = { done: t("st_done"), now: t("st_now"), todo: t("st_todo") };
    const step = (x, i, link) => `<div class="pln-fnode pln-step" data-state="${x.state}" style="${place(i)}"${link ? " data-link" : ""}>
      <span class="pln-step-n">${x.state === "done" ? CHECK : `<span class="num">${i + 1}</span>`}</span><span class="pln-step-t"><span dir="auto">${esc(x.text)}</span><small>${esc(word[x.state])}</small></span></div>`;
    let body;
    if (st.total) {
      const list = R.partStations(part);
      body = flow("steps", list.map((x, i) => step(x, i, i < list.length - 1)));
    } else {
      const done = (part.exists || []).map((x) => ({ text: x, state: "done" })), todo = (part.missing || []).map((x) => ({ text: x, state: "todo" }));
      body = `${todo.length ? `<h3 class="pln-mv-group">${esc(t("stillMissing"))}</h3>${flow("steps", todo.map((x, i) => step(x, i, false)))}` : ""}
        ${done.length ? `<h3 class="pln-mv-group">${esc(t("alreadyDone"))}</h3>${flow("steps", done.map((x, i) => step(x, i, false)))}` : ""}`.trim() || `<p class="pln-lead" dir="auto">${esc(part.summary)}</p>`;
    }
    return { badge: `<span class="pln-mv-badge">${g(part.icon || layer.icon || "layers")}</span>`, title: part.title,
      sub: part.purpose ? `<span dir="auto">${esc(part.purpose)}</span>` : "",
      facts: `<div class="pln-facts pln-mv-facts"><span class="pln-badge" data-s="${part.status}">${si(part.status)}${esc(words.status[part.status])}</span>${whoChip(part.who)}${st.total ? `<span class="pln-mv-count num">${esc(t("tapStep", { n: st.total }))} · ${esc(t("of", { a: st.done, b: st.total }))}</span>` : ""}</div>`,
      flow: body, after: `<div class="btns pln-mv-btns"><button type="button" class="btn primary" data-act="pln-part" data-plan="${esc(e.id)}" data-id="${esc(part.id)}">${g("file-text")}${esc(t("openDetails"))}</button></div>` };
  }
  // The dashed arrows: from each node marked data-link to the next one, sideways in a row and curving down between
  // rows. Drawn in layout coordinates, so zooming (a transform) never moves them off their blocks.
  function drawLinks() {
    $$(".pln-flow").forEach((f, k) => {
      const svg = f.querySelector(":scope > .pln-links");
      const nodes = [...f.querySelectorAll(":scope > .pln-fnode")];
      if (!svg) return;
      const box = (el) => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
      const paths = [];
      nodes.forEach((a, i) => {
        const b = nodes[i + 1];
        if (!b || !a.hasAttribute("data-link")) return;
        const A = box(a), B = box(b);
        let d;
        if (B.y + B.h / 2 > A.y && B.y + B.h / 2 < A.y + A.h) { // same row: across
          const right = B.x > A.x, sx = right ? A.x + A.w : A.x, ex = right ? B.x : B.x + B.w, sy = A.y + A.h / 2, ey = B.y + B.h / 2, dx = (ex - sx) / 2;
          d = `M${sx},${sy} C${sx + dx},${sy} ${ex - dx},${ey} ${ex},${ey}`;
        } else { // the next row: down, curving
          const sx = A.x + A.w / 2, sy = A.y + A.h, ex = B.x + B.w / 2, ey = B.y, dy = (ey - sy) / 2;
          d = `M${sx},${sy} C${sx},${sy + dy} ${ex},${ey - dy} ${ex},${ey}`;
        }
        paths.push(`<path d="${d}" style="--a:${a.style.getPropertyValue("--a") || "var(--ink-3)"}" marker-end="url(#pln-ah-${k})"/>`);
      });
      svg.setAttribute("width", f.offsetWidth); svg.setAttribute("height", f.offsetHeight);
      svg.innerHTML = `<defs><marker id="pln-ah-${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1L8 5L1 9" fill="none" stroke="context-stroke" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>${paths.join("")}`;
    });
  }
  function applyZoom() {
    const port = $(".pln-mv-port"), z = $(".pln-mv-zoomer"), sizer = $(".pln-mv-sizer");
    if (!port || !z || !sizer) return;
    if (P.zoom === 1) {
      z.style.width = ""; z.style.transform = ""; sizer.style.width = ""; sizer.style.height = "";
    } else { // the map keeps the port's width at 100% and is scaled from there, so its size never feeds back
      const base = port.clientWidth;
      z.style.width = `${base}px`; z.style.transform = `scale(${P.zoom})`;
      sizer.style.width = `${base * P.zoom}px`; sizer.style.height = `${z.offsetHeight * P.zoom}px`;
    }
    const pct = $(".pln-mv-pct");
    if (pct) pct.textContent = `${Math.round(P.zoom * 100)}%`;
  }

  // ---------- Overview ----------
  function overview(e, empty) {
    if (empty) return `<div class="pln-top solo"><section class="pln-card" aria-labelledby="pln-title">${hero(e)}</section></div>${emptyPlan(e)}`;
    return `${changesCard(e)}<div class="pln-top"><section class="pln-card" aria-labelledby="pln-title">${hero(e)}${line(e)}</section>${needs(e)}</div>${layers(e, false)}`;
  }

  function nextCard(e, cls = "") {
    const next = R.nextOf(e);
    if (!next) return "";
    const inner = `<span class="pln-next-icon">${g("file-text")}</span><span class="pln-next-t"><small>${esc(t("nextAction"))}</small><b dir="auto">${esc(next.text)}</b>${next.note ? `<span dir="auto">${esc(next.note)}</span>` : ""}</span>`;
    return next.part ? `<button type="button" class="pln-nextcard ${cls}" data-act="pln-part" data-plan="${esc(e.id)}" data-id="${esc(next.part)}">${inner}${fwd()}</button>`
      : `<div class="pln-nextcard ${cls}">${inner}</div>`;
  }

  function hero(e) {
    const p = e.plan, s = e.derived.stops;
    const sync = R.syncLine(P.data.sync, e, Date.now(), P.lang);
    const r = R.ring(s.done, s.now.length, s.total);
    const words = W(), counts = e.derived.counts, total = e.derived.parts, n = e.derived.needs_you.length;
    const kinds = words.status_order.filter((k) => counts[k]);
    const cw = (k) => R.countWord(k, counts[k], P.lang);
    const health = total ? `<div class="pln-health"><div class="pln-hbar" role="img" aria-label="${esc(`${t("partsN", { n: total })}: ${kinds.map((k) => `${counts[k]} ${cw(k)}`).join(", ")}`)}">${kinds.map((k) => `<i data-s="${k}" style="flex:${counts[k]}"></i>`).join("")}</div>
      <ul class="pln-hkey" aria-label="${esc(t("partsByStatus"))}">${kinds.map((k) => `<li><button type="button" class="pln-hrow" data-act="pln-health" data-v="${k}" data-s="${k}">${si(k)}<b class="num">${counts[k]}</b><span>${esc(cw(k))}</span></button></li>`).join("")}</ul></div>` : "";
    const doing = p.stops.filter((x) => x.state === "now").map((x) => x.title);
    const nextYou = p.stops.find((x) => x.n === s.next_you);
    const nextList = [
      doing.length ? `<div><dt>${esc(t("doingNow"))}</dt><dd dir="auto">${esc(doing.join(", "))}</dd></div>` : "",
      nextYou ? `<div><dt>${esc(t("nextForYou"))}</dt><dd dir="auto">${esc(nextYou.title)}</dd></div>` : "",
    ].join("");
    const ringSvg = (size) => `<svg viewBox="0 0 120 120" aria-hidden="true" style="width:${size};height:${size}"><circle class="trk" cx="60" cy="60" r="52"/>
        ${r.now ? `<circle class="now" cx="60" cy="60" r="52" stroke-dasharray="${r.now.toFixed(2)} ${r.c.toFixed(2)}" stroke-dashoffset="${r.nowOffset.toFixed(2)}"/>` : ""}
        ${r.done ? `<circle class="arc" cx="60" cy="60" r="52" stroke-dasharray="${r.done.toFixed(2)} ${r.c.toFixed(2)}"/>` : ""}</svg>`;
    const ringEl = s.total ? `<div class="pln-ring" role="img" aria-label="${esc(`${t("of", { a: s.done, b: s.total })} ${t("stopsDone")}`)}">${ringSvg("100%")}
        <div class="pln-ring-t"><b class="num">${esc(t("of", { a: s.done, b: s.total }))}</b><span>${esc(t("stopsDone"))}</span></div></div>` : "";
    const next = nextList ? `<dl class="pln-next">${nextList}</dl>` : "";
    // the phone's row: the ring, how many things need him, and the one next action
    const stats = `<div class="pln-stats">${ringEl}<button type="button" class="pln-needcount" data-act="pln-needs"${n ? "" : " disabled"}><b class="num">${n}</b><span>${esc(R.countWord("needs-you", n, P.lang))}</span></button>
      ${doing.length ? `<p class="pln-doingnow"><small>${esc(t("doingNow"))}</small><b dir="auto">${esc(doing.join(", "))}</b></p>` : ""}${nextCard(e, "in-hero")}</div>`;
    return `<header class="pln-head">
      <div class="pln-id">
        <h1 class="pln-title" id="pln-title" dir="auto">${esc(p.title)}</h1>
        <p class="pln-summary" dir="auto">${esc(p.summary)}</p>
        <p class="pln-sync" data-tone="${sync.tone}">${g("github")}<span>${esc(t("updated", { date: R.longDate(p.updated, P.lang) }))}</span><span class="sep" aria-hidden="true">·</span><span class="pln-sync-st" title="${esc(sync.title)}"><i aria-hidden="true"></i>${esc(sync.text)}</span>${syncButton()}</p>
        ${health}
      </div>
      ${ringEl || next ? `<div class="pln-progress">${ringEl}${next}</div>` : ""}
      ${stats}
    </header>`;
  }

  function line(e) {
    const words = W(), stops = e.plan.stops;
    if (!stops.length) return `<div class="pln-linebox"><p class="pln-line-empty">${esc(t("noStops"))}</p></div>`;
    const lit = e.derived.stops.lit, changed = R.changedIds(e.changes).stops;
    const items = stops.map((s, i) => `<li class="pln-stop" data-state="${s.state}"${i <= lit ? " data-lit" : ""}${i < lit ? " data-lit-next" : ""}${changed.has(String(s.n)) ? " data-changed" : ""}>
      <button type="button" class="pln-stop-btn" data-act="pln-stop" data-plan="${esc(e.id)}" data-n="${s.n}" aria-label="${esc(t("stopAria", { n: s.n, title: s.title, state: words.stop[s.state], who: words.who[s.who] }))}">
        ${s.state === "now" ? `<span class="pln-doing">${esc(words.stop.now)}</span>` : ""}
        <span class="pln-node">${s.state === "done" ? CHECK : `<span class="num">${s.n}</span>`}</span>
        <span class="pln-stop-n num">${s.n}</span>
        <span class="pln-stop-t" dir="auto">${esc(s.title)}</span>
        <span class="pln-stop-note" dir="auto">${esc(s.note || "")}</span>
        <span class="pln-stop-st" data-state="${s.state}">${esc(words.stop[s.state])}</span>
        <span class="pln-who" data-state="${s.state}">${esc(words.who[s.who])}</span>
      </button></li>`).join("");
    const key = ["done", "now", "you", "later"].filter((k) => stops.some((s) => s.state === k))
      .map((k) => `<li data-state="${k}"><i aria-hidden="true"></i>${esc(words.stop[k])}</li>`).join("");
    return `<div class="pln-linebox"><h2 class="pln-line-h">${esc(t("launchLine"))}</h2><ol class="pln-line" aria-label="${esc(t("lineLabel"))}" style="--n:${stops.length};--lit:${Math.max(lit, 0)}"${lit < 0 ? " data-unlit" : ""}>${items}</ol>
      <ul class="pln-key" aria-label="${esc(t("keyLabel"))}">${key}</ul>${e.plan.notes?.line ? `<p class="pln-line-note" dir="auto">${esc(e.plan.notes.line)}</p>` : ""}</div>`;
  }

  function needs(e) {
    const list = e.derived.needs_you, open = e.derived.decisions_open;
    const items = list.slice(0, 3).map((n, i) => `<li><button type="button" class="pln-need" data-act="pln-part" data-plan="${esc(e.id)}" data-id="${esc(n.part)}">
        <span class="pln-num num">${i + 1}</span><span class="pln-need-t"><b dir="auto">${esc(n.title)}</b><span dir="auto">${esc(n.ask)}</span></span>${fwd()}</button></li>`).join("");
    const body = list.length ? `<ol class="pln-needs-list">${items}</ol>` : `<p class="pln-none">${si("live")}<span>${esc(t("nothingWaits"))}</span></p>`;
    const foot = [
      list.length > 3 ? `<button type="button" class="pln-more" data-act="pln-needs">${esc(t("showAll", { n: list.length }))}${fwd()}</button>` : "",
      open ? `<a class="pln-more quiet" href="${R.href(e.id, "decisions")}">${esc(open === 1 ? t("toSettle1") : t("toSettle", { n: open }))}${fwd()}</a>` : "",
    ].join("");
    return `<aside class="pln-needs" aria-labelledby="pln-needs-h"><div class="pln-needs-head"><h2 id="pln-needs-h">${esc(t("whatNeedsYou"))}</h2>${list.length ? `<span class="pln-count num">${list.length}</span>` : ""}</div>
      ${nextCard(e, "in-needs")}${body}${foot ? `<div class="pln-needs-foot">${foot}</div>` : ""}</aside>`;
  }

  // One layer's row: its glyph, name and note; on a computer its parts as chips, on a phone a summary (a shape per
  // status, "1 / 4 live") that opens the layer, with "Show all parts" unfolding every layer's chips at once.
  function layerRow(e, l, all) {
    const words = W(), f = P.filter;
    const sum = R.layerSummary(l, words.status_order);
    const changed = R.changedIds(e.changes).parts;
    const shapes = sum.kinds.map((k) => `<span class="pln-mini" data-s="${k}" title="${esc(`${sum.counts[k]} ${words.status[k]}`)}">${si(k)}<span class="num">${sum.counts[k]}</span><span class="sr">${esc(words.status[k])}</span></span>`).join("");
    const chips = l.parts.map((part) => `<button type="button" class="pln-chip" data-s="${part.status}" data-act="pln-part" data-plan="${esc(e.id)}" data-id="${esc(part.id)}"${all && f !== "all" && part.status !== f ? " data-dim" : ""}${changed.has(part.id) ? " data-changed" : ""}${P.focus === part.id ? " data-focus" : ""}>
        ${si(part.status)}<span class="pln-chip-t" dir="auto">${esc(part.title)}</span><span class="pln-chip-s">${esc(words.status[part.status])}</span>${changed.has(part.id) ? `<span class="sr">${esc(t("changedTag"))}</span>` : ""}</button>`).join("");
    return `<div class="pln-layer" data-layer="${esc(l.id)}">
        <button type="button" class="pln-layer-head" data-act="pln-layer" data-id="${esc(l.id)}" aria-label="${esc(t("allOfLayer", { name: l.name }))}">
          <span class="pln-layer-icon">${g(l.icon || "layers")}</span>
          <span class="pln-layer-name"><b dir="auto">${esc(l.name)}</b>${l.note ? `<span dir="auto">${esc(l.note)}</span>` : ""}</span>
          <span class="pln-layer-end"><span class="pln-layer-sum">${shapes}</span><span class="pln-layer-live num">${esc(t("liveOf", { a: sum.live, b: sum.total }))}</span></span>${fwd()}</button>
        <div class="pln-chips">${chips || `<p class="pln-line-empty">${esc(t("noParts"))}</p>`}</div>
        <button type="button" class="icon-btn pln-layer-open" data-act="pln-layer" data-id="${esc(l.id)}" aria-label="${esc(t("allOfLayer", { name: l.name }))}">${fwd()}</button></div>`;
  }
  function layers(e, all) {
    const p = e.plan, dv = e.derived;
    if (!p.layers.length) return `<section class="section pln-layers"><div class="pln-sec-head"><h2>${esc(t("layers"))}</h2></div><p class="pln-line-empty">${esc(t("noLayers"))}</p></section>`;
    const rows = p.layers.map((l) => layerRow(e, l, all)).join("");
    const expand = all ? "" : `<button type="button" class="pln-expand" data-act="pln-expand" aria-expanded="${!!P.expanded}">${esc(P.expanded ? t("foldParts") : t("showParts"))}${g(P.expanded ? "chevron-up" : "chevron-down")}</button>`;
    return `<section class="section pln-layers${all || P.expanded ? " is-open" : ""}" aria-labelledby="${all ? "pln-map-h" : "pln-layers-h"}">
      ${all ? "" : `<div class="pln-sec-head"><h2 id="pln-layers-h">${esc(t("layers"))}</h2><span class="meta">${esc(dv.parts === 1 ? t("part1") : t("partsN", { n: dv.parts }))}</span><span class="grow"></span>${expand}</div>`}
      <div class="pln-layer-list">${rows}</div>${!all && p.notes?.layers ? `<p class="pln-sec-note" dir="auto">${esc(p.notes.layers)}</p>` : ""}</section>`;
  }

  // "Changed since your last look": what moved, before and after, until he leaves the plan or taps Got it.
  function changeMark(c, v) {
    if (v == null) return "";
    if (c.kind === "part") return si(v);
    if (c.kind === "decision") return si(v === "settled" ? "live" : "open");
    if (c.kind === "stop") return `<i class="pln-dot" data-state="${esc(v)}" aria-hidden="true"></i>`;
    return "";
  }
  function changesCard(e) {
    const list = e.changes || [];
    if (!list.length) return "";
    const words = W();
    const kind = (c) => (c.kind === "stop" ? t("ch_stop", { n: c.id }) : c.kind === "part" ? t("ch_part", { layer: c.layer || "" }) : c.kind === "decision" ? t("ch_decision") : t("ch_next"));
    const cards = list.slice(0, 6).map((c) => {
      const w = R.changeWords(c, words);
      const before = c.before == null ? `<span class="was new">${esc(t("isNew"))}</span>` : `<span class="was" data-s="${esc(c.before)}">${changeMark(c, c.before)}<span dir="auto">${esc(w.before)}</span></span>`;
      const after = c.after == null ? `<span class="now gone">${esc(t("isGone"))}</span>` : `<span class="now" data-s="${esc(c.after)}">${changeMark(c, c.after)}<span dir="auto">${esc(w.after)}</span></span>`;
      const open = c.kind === "part" && c.after != null ? ` data-act="pln-part" data-plan="${esc(e.id)}" data-id="${esc(c.id)}"` : c.kind === "stop" && c.after != null ? ` data-act="pln-stop" data-plan="${esc(e.id)}" data-n="${esc(c.id)}"` : "";
      const tag = open ? "button" : "div";
      return `<li><${tag} class="pln-change" data-kind="${c.kind}"${open}${open ? ' type="button"' : ""}><span class="pln-change-k">${esc(kind(c))}</span>
        ${c.kind === "next" ? "" : `<b dir="auto">${esc(c.title)}</b>`}
        <span class="pln-change-ba">${before}<span class="pln-change-arrow" aria-hidden="true">${g(ar() ? "chevron-left" : "arrow-right")}</span>${after}</span>
        ${c.note ? `<span class="pln-change-note" dir="auto">${esc(c.note)}</span>` : ""}</${tag}></li>`;
    }).join("");
    const more = list.length > 6 ? `<p class="pln-change-more">+${list.length - 6}</p>` : "";
    return `<section class="pln-changes" aria-labelledby="pln-ch-h"><div class="pln-changes-head"><span class="pln-changes-mark">${g("history")}</span>
      <div><h2 id="pln-ch-h">${esc(t("changed"))}</h2><p>${esc(t(list.length === 1 ? "changedSub1" : "changedSub", { n: list.length, ago: ago(e.seen_at) }))}</p></div>
      <button type="button" class="btn sm" data-act="pln-seen" data-plan="${esc(e.id)}" data-sig="${esc(e.sig || "")}">${g("check")}${esc(t("gotIt"))}</button></div>
      <ol class="pln-change-list">${cards}</ol>${more}</section>`;
  }

  function emptyPlan(e) {
    const sections = ["tab_overview", "tab_decisions", "tab_money", "tab_map"].map((k) => `<li>${esc(t(k))}</li>`).join("");
    return `<section class="pln-blank"><span class="pln-blank-icon">${g("map")}</span><h2>${esc(t("emptyHead"))}</h2><p>${esc(t("emptyBody"))}</p>
      <ul class="pln-blank-parts">${sections}</ul>
      ${e.file_url ? `<a class="btn primary" href="${esc(R.editUrl(e.file_url))}" target="_blank" rel="noopener">${g("pencil")}${esc(t("emptyEdit"))}</a>` : ""}</section>`;
  }

  // ---------- Decisions ----------
  function decisionsTab(e) {
    const words = W(), list = e.plan.decisions;
    if (!list.length) return `${tabHead("decisions", t("settleFirst"))}<p class="pln-line-empty">—</p>`;
    const settled = list.filter((x) => x.state === "settled").sort((a, b) => String(b.settled_on || "").localeCompare(String(a.settled_on || "")));
    const open = list.filter((x) => x.state === "open");
    const changed = R.changedIds(e.changes).decisions;
    const settledCards = settled.map((x) => `<button type="button" class="pln-settled" data-act="pln-dec" data-plan="${esc(e.id)}" data-id="${esc(x.id)}"${changed.has(x.id) ? " data-changed" : ""}>
        <span class="pln-dstate" data-state="settled">${si("live")}${esc(words.decision.settled)}${x.settled_on ? ` · ${esc(R.shortDate(x.settled_on, P.lang))}` : ""}</span>
        <span class="pln-settled-row"><span class="pln-settled-was"><small>${esc(t("before"))}</small><span dir="auto">${esc(x.title)} · ${esc(words.decision.open)}</span></span>
        <span class="pln-settled-arrow" aria-hidden="true">${g(ar() ? "chevron-left" : "arrow-right")}</span>
        <span class="pln-settled-now"><small>${esc(t("now"))} · ${esc(x.pick_label || words.decision.settled)}</small><b dir="auto">${esc(x.pick || x.title)}</b></span></span></button>`).join("");
    const openRows = open.map((x, i) => {
      const call = /your call/i.test(x.pick_label || "");
      return `<li><button type="button" class="pln-orow" data-act="pln-dec" data-plan="${esc(e.id)}" data-id="${esc(x.id)}"${call ? " data-call" : ""}>
        <span class="pln-orow-n num">${String(i + 1).padStart(2, "0")}</span><span class="pln-orow-q">${si("open")}</span>
        <span class="pln-orow-t"><b dir="auto">${esc(x.title)}</b>${x.context ? `<span dir="auto">${esc(x.context)}</span>` : ""}</span>
        <span class="pln-orow-end"><span class="pln-dstate" data-state="open"${call ? " data-call" : ""}>${si("open")}${esc(words.decision.open)}</span>${x.pick_label ? `<small dir="auto">${esc(x.pick_label)}</small>` : ""}</span>${fwd()}</button></li>`;
    }).join("");
    const meta = open.length ? t("openSettled", { o: open.length, s: settled.length }) : t("settledN", { s: settled.length });
    return `${tabHead("decisions", t("settleFirst"), meta)}${e.plan.notes?.decisions ? `<p class="pln-sec-note top" dir="auto">${esc(e.plan.notes.decisions)}</p>` : ""}
      ${settled.length ? `<section class="pln-dsec" aria-label="${esc(t("recentlySettled"))}"><h3 class="pln-dsec-h ok">${esc(t("recentlySettled"))}</h3>${settledCards}</section>` : ""}
      ${open.length ? `<section class="pln-dsec" aria-label="${esc(t("stillOpen"))}"><div class="pln-dsec-headrow"><h3 class="pln-dsec-h">${esc(t("stillOpen"))}</h3><span class="meta num">${open.length}</span></div><ol class="pln-orows">${openRows}</ol></section>` : ""}`;
  }

  // ---------- Money ----------
  function moneyTab(e) {
    const c = e.plan.costs;
    if (!hasCosts(e.plan)) return `${tabHead("money", t("whatItCosts"))}<p class="pln-line-empty">—</p>`;
    const b = R.costBars(c, SERIES.length);
    const col = (i) => (i < 0 ? "" : `--c:${SERIES[i]}`);
    const rows = b.rows.map((r) => {
      const said = r.segs.map((s) => `${s.extra ? `${t("plus")} ` : ""}${s.label} ${R.money(s.low, s.high, c.currency)}`).join(", ");
      const h = Math.max(1.5, (r.sum / b.max) * 100);
      // the figure rides on its own bar, in the serif; the plan's own words ("about $55–65 a month") are its tooltip
      return `<div class="pln-col" title="${esc(r.total)}"><div class="pln-col-bar" role="img" aria-label="${esc(`${r.label}: ${r.total}. ${said}.`)}">
        <div class="pln-col-fig"><b class="pln-col-figure" dir="ltr">${esc(R.costFigure(r.total))}</b><span dir="auto">${esc(r.label)}</span></div>
        <div class="pln-col-stack" style="--k:${(h / 100).toFixed(4)}">${r.segs.map((s) => `<i class="${s.extra ? "extra" : ""}" style="flex:${Math.max(s.value, 0.0001)} 1 0;${col(s.colour)}" title="${esc(`${s.label}: ${R.money(s.low, s.high, c.currency)} ${t("aMonth")}${s.note ? ` · ${s.note}` : ""}`)}"></i>`).join("")}</div></div></div>`;
    }).join("");
    const legend = b.legend.length ? `<div class="legend pln-legend">${b.legend.map((l) => `<span><i class="${l.colour < 0 ? "extra" : ""}" style="${col(l.colour)}"></i><span dir="auto">${esc(l.label)}</span></span>`).join("")}</div>` : "";
    const fees = (c.fees || []).length ? `<section class="pln-fees-wrap"><h3>${esc(t("onEachSale"))}</h3><div class="pln-fees">${c.fees.map((f) => `<div class="pln-fee"><span class="pln-fee-mark" aria-hidden="true">${esc(String(f.label || "?").trim().charAt(0).toUpperCase())}</span><span class="pln-fee-t"><b dir="auto">${esc(f.label)}</b><span class="num" dir="auto">${esc(f.value)}</span>${f.note ? `<small dir="auto">${esc(f.note)}</small>` : ""}</span></div>`).join("")}</div></section>` : "";
    const items = (c.items || []).length ? `<section class="pln-apps"><h3>${esc(t("appByApp"))}</h3><div class="pln-appchips">${c.items.map((it, i) => `<button type="button" class="chip pln-appchip" data-act="pln-cost" data-plan="${esc(e.id)}" data-i="${i}"><span dir="auto">${esc(it.name)}</span>${fwd()}</button>`).join("")}</div></section>` : "";
    const table = `<div class="sr"><table><caption>${esc(t("costTable"))}</caption><tr><th>${esc(t("stage"))}</th><th>${esc(t("total"))}</th><th>${esc(t("madeOf"))}</th></tr>${b.rows.map((r) => `<tr><td>${esc(r.label)}</td><td>${esc(r.total)}</td><td>${esc(r.segs.map((s) => `${s.label} ${R.money(s.low, s.high, c.currency)}`).join(", "))}</td></tr>`).join("")}</table></div>`; // a table ignores a 1px width, so a div hides it
    return `${tabHead("money", t("whatItCosts"), t("perMonth", { cur: c.currency || "USD" }))}
      ${rows ? `<section class="pln-cost-card"><h3>${esc(t("byStage"))}</h3><div class="pln-cols" style="--cols:${b.rows.length}">${rows}</div>${legend}${c.note ? `<p class="pln-sec-note" dir="auto">${esc(c.note)}</p>` : ""}${table}</section>` : ""}
      <div class="pln-cost-side">${fees}${items}</div>
      ${c.total ? `<p class="pln-total" dir="auto">${esc(c.total)}</p>` : ""}`;
  }

  // ---------- System map ----------
  function mapTab(e) {
    const words = W(), dv = e.derived, p = e.plan;
    const f = dv.counts[P.filter] ? P.filter : "all";
    const filters = [`<button class="chip" type="button" data-act="pln-filter" data-v="all" aria-pressed="${f === "all"}">${esc(t("everything"))}<span class="count">${dv.parts}</span></button>`]
      .concat(words.status_order.filter((k) => dv.counts[k]).map((k) => `<button class="chip pln-fchip" type="button" data-act="pln-filter" data-v="${k}" data-s="${k}" aria-pressed="${f === k}">${si(k)}${esc(words.status[k])}<span class="count">${dv.counts[k]}</span></button>`)).join("");
    const kinds = words.status_order.filter((k) => dv.counts[k]);
    const bar = dv.parts ? `<div class="pln-hbar wide" role="img" aria-label="${esc(kinds.map((k) => `${dv.counts[k]} ${words.status[k]}`).join(", "))}">${kinds.map((k) => `<i data-s="${k}" style="flex:${dv.counts[k]}"></i>`).join("")}</div>` : "";
    return `${tabHead("map", t("layers"), t("partsInLayers", { p: dv.parts, l: p.layers.length }))}${bar}
      ${p.layers.length ? `<div class="chips pln-filters" role="group" aria-label="${esc(t("byStatus"))}">${filters}</div>` : ""}${layers(e, true)}${p.notes?.layers ? `<p class="pln-sec-note" dir="auto">${esc(p.notes.layers)}</p>` : ""}`;
  }

  // ---------- Evidence, Where it lives ----------
  function evidenceTab(e) {
    const p = e.plan, list = p.evidence;
    const latest = p.latest ? `<section class="pln-latest"><p class="pln-eye small">${esc(t("latest", { date: R.shortDate(p.latest.on, P.lang) }))}</p><p dir="auto">${esc(p.latest.text)}</p></section>` : "";
    return `${tabHead("evidence", t("checked"), R.longDate(p.updated, P.lang))}${latest}
      ${list.length ? `<ul class="pln-ev">${list.map((x) => `<li data-ok="${x.ok}">${si(x.ok ? "live" : "conflict")}<span dir="auto">${esc(x.text)}</span>${x.ok ? "" : `<span class="sr">${esc(t("warning"))}</span>`}</li>`).join("")}</ul>` : `<p class="pln-line-empty">—</p>`}
      ${p.basis ? `<p class="pln-basis" dir="auto">${esc(p.basis)}</p>` : ""}`;
  }
  function whereTab(e) {
    const list = e.plan.sources;
    const links = [
      e.page_url ? `<a class="btn" href="${esc(e.page_url)}" target="_blank" rel="noopener">${g("github")}${esc(t("seeOnGithub"))}</a>` : "",
      e.file_url ? `<a class="btn ghost" href="${esc(e.file_url)}" target="_blank" rel="noopener">${g("file-text")}${esc(t("planFile"))}</a>` : "",
    ].join("");
    return `${tabHead("where", t("whereItLives"))}
      ${list.length ? `<dl class="pln-where">${list.map((s) => `<div><dt dir="auto">${esc(s.label)}</dt><dd>${s.url ? `<a class="pln-ext" href="${esc(s.url)}" target="_blank" rel="noopener"><span dir="auto">${esc(s.where)}</span>${g("external")}</a>` : `<span class="mono" dir="ltr">${esc(s.where)}</span>`}</dd></div>`).join("")}</dl>` : ""}
      ${links ? `<div class="btns pln-where-btns">${links}</div>` : ""}`;
  }

  // ---------- panels ----------
  const closeBtn = () => `<button class="icon-btn" data-act="close" aria-label="${esc(t("close"))}">${g("x")}</button>`;
  const panel = (e, head, body, foot = "") => openPanel(`<div class="pln-panel"${dirAttr()} style="--plan:${esc(e.plan.accent)}">${head}<div class="panel-body pln-pb">${body}</div>${foot ? `<div class="pln-pfoot">${foot}</div>` : ""}</div>`);
  function listOf(items, kind) {
    return `<ul class="pln-list" data-kind="${kind}">${items.map((x) => `<li>${kind === "ok" ? `<span class="pln-tick" aria-hidden="true">${CHECK}</span>` : `<span class="pln-gap" aria-hidden="true"></span>`}<span dir="auto">${esc(x)}</span></li>`).join("")}</ul>`;
  }
  function stepsEl(part) {
    const st = R.steps(part);
    if (!st.total) return "";
    const items = st.list.map((s, i) => {
      const state = s.done ? "done" : i === st.current ? "now" : "later";
      return `<li data-state="${state}"><span class="pln-snode">${s.done ? CHECK : `<span class="num">${i + 1}</span>`}</span><span class="pln-stext" dir="auto">${esc(s.text)}</span></li>`;
    }).join("");
    return `<section class="pln-psec"><div class="pln-psec-head"><h3>${esc(t("progress"))}</h3><span class="meta num">${esc(t("of", { a: st.done, b: st.total }))}</span></div>
      <ol class="pln-steps${st.total > 5 ? " many" : ""}" style="--n:${st.total}" aria-label="${esc(t("stepsDoneOf", { a: st.done, b: st.total }))}">${items}</ol></section>`;
  }
  function whoChip(who) {
    const words = W();
    return `<span class="pln-whochip" data-who="${who}">${g(who === "both" ? "users" : who === "you" ? "user" : "sparkles")}${esc(words.who[who])}</span>`;
  }
  function openPart(planId, partId) {
    const e = entryOf(planId);
    const hit = e?.plan && R.findPart(e.plan, partId);
    if (!hit) return;
    const { part, layer } = hit;
    const words = W(), at = layer.parts.indexOf(part) + 1;
    const stop = part.stop != null ? e.plan.stops.find((s) => s.n === part.stop) : null;
    const noted = R.notedIn(part.source, e.plan.sources);
    const head = `<div class="panel-head pln-ph"><span class="pln-ph-icon">${g(layer.icon || "layers")}</span><div class="main"><h2 dir="auto">${esc(part.title)}</h2>
      <div class="about" dir="auto">${esc(t("partOf", { layer: layer.name, at, n: layer.parts.length }))}</div></div>${closeBtn()}</div>`;
    const body = `${part.purpose ? `<p class="pln-purpose" dir="auto">${esc(part.purpose)}</p>` : ""}
      <div class="pln-facts"><span class="pln-badge" data-s="${part.status}">${si(part.status)}${esc(words.status[part.status])}</span>${whoChip(part.who)}
        ${stop ? `<button type="button" class="pln-stopref" data-act="pln-stop" data-plan="${esc(e.id)}" data-n="${stop.n}"><span class="pln-stopref-n num">${stop.n}</span><span dir="auto">${esc(stop.title)}</span> · ${esc(words.stop[stop.state])}</button>` : ""}</div>
      <p class="pln-lead" dir="auto">${esc(part.summary)}</p>
      ${stepsEl(part)}
      ${part.exists.length ? `<section class="pln-psec"><div class="pln-psec-head"><h3>${esc(t("whatsDone"))}</h3><span class="meta num">${part.exists.length}</span></div>${listOf(part.exists, "ok")}</section>` : ""}
      ${part.missing.length ? `<section class="pln-psec"><div class="pln-psec-head"><h3>${esc(t("whatsMissing"))}</h3><span class="meta num">${part.missing.length}</span></div>${listOf(part.missing, "miss")}</section>` : ""}
      ${noted.length ? `<section class="pln-psec"><div class="pln-psec-head"><h3>${esc(t("notedIn"))}</h3></div><div class="pln-noted">${noted.map((n) => n.url
        ? `<a class="pln-noted-row" href="${esc(n.url)}" target="_blank" rel="noopener">${g("file-text")}<span dir="auto">${esc(n.text)}</span>${g("external")}</a>`
        : n.source ? `<a class="pln-noted-row" href="${R.href(e.id, "where")}" data-act="pln-where" data-plan="${esc(e.id)}">${g("file-text")}<span dir="auto">${esc(n.text)}</span>${fwd()}</a>`
          : `<div class="pln-noted-row">${g("file-text")}<span dir="auto">${esc(n.text)}</span></div>`).join("")}</div></section>` : ""}`;
    const note = R.partFileUrl(e, part.id);
    const foot = `${note ? `<a class="btn pln-addnote" href="${esc(note)}" target="_blank" rel="noopener" title="${esc(t("addNoteHint"))}">${g("pencil")}${esc(t("addNote"))}</a>` : ""}
      <button type="button" class="btn primary" data-act="pln-inplan" data-plan="${esc(e.id)}" data-id="${esc(part.id)}">${esc(t("openInPlan"))}${g(ar() ? "chevron-left" : "arrow-right")}</button>`;
    panel(e, head, body, foot);
  }
  const partRows = (e, pairs) => `<div class="pln-prows">${pairs.map(({ part, layer }) => `<button type="button" class="pln-prow" data-act="pln-part" data-plan="${esc(e.id)}" data-id="${esc(part.id)}" data-s="${part.status}">
      ${si(part.status)}<span class="pln-prow-t"><b dir="auto">${esc(part.title)}</b><span dir="auto">${esc(part.purpose || part.summary)}</span></span><span class="pln-prow-s">${esc(W().status[part.status])}${layer ? `<small dir="auto">${esc(layer.name)}</small>` : ""}</span></button>`).join("")}</div>`;

  function openStop(planId, n) {
    const e = entryOf(planId);
    const stop = e?.plan?.stops.find((s) => s.n === Number(n));
    if (!stop) return;
    const words = W();
    const parts = R.partsOfStop(e.plan, stop.n);
    panel(e, `<div class="panel-head pln-ph"><span class="pln-ph-stop" data-state="${stop.state}"><span class="pln-node">${stop.state === "done" ? CHECK : `<span class="num">${stop.n}</span>`}</span></span>
      <div class="main"><h2 dir="auto">${esc(stop.title)}</h2><div class="about" dir="auto">${esc(t("stopOf", { n: stop.n, total: e.plan.stops.length, plan: e.plan.title }))}</div></div>${closeBtn()}</div>`,
    `<div class="pln-facts"><span class="pln-badge stop" data-state="${stop.state}"><i aria-hidden="true"></i>${esc(words.stop[stop.state])}</span>${whoChip(stop.who)}</div>
      ${stop.note ? `<p class="pln-lead" dir="auto">${esc(stop.note)}</p>` : ""}
      ${parts.length ? `<section class="pln-psec"><div class="pln-psec-head"><h3>${esc(t("itsParts"))}</h3><span class="meta num">${parts.length}</span></div>${partRows(e, parts)}</section>` : `<p class="pln-line-empty">${esc(t("noPartsTied"))}</p>`}`);
  }
  function openLayer(id) {
    const e = current();
    const layer = e?.plan?.layers.find((l) => l.id === id);
    if (!layer) return;
    const sum = R.layerSummary(layer, W().status_order);
    panel(e, `<div class="panel-head pln-ph"><span class="pln-ph-icon">${g(layer.icon || "layers")}</span><div class="main"><h2 dir="auto">${esc(layer.name)}</h2>
      <div class="about" dir="auto">${esc(layer.note || e.plan.title)} · ${esc(t("liveOf", { a: sum.live, b: sum.total }))}</div></div>${closeBtn()}</div>`,
    layer.parts.length ? partRows(e, layer.parts.map((part) => ({ part }))) : `<p class="pln-line-empty">${esc(t("noParts"))}</p>`);
  }
  function openNeeds() {
    const e = current();
    if (!e?.plan) return;
    const list = e.derived.needs_you;
    panel(e, `<div class="panel-head pln-ph"><span class="pln-ph-icon" data-s="needs-you">${si("needs-you", "lg")}</span><div class="main"><h2>${esc(t("whatNeedsYou"))}</h2>
      <div class="about">${esc(list.length === 1 ? t("thing1") : t("things", { n: list.length }))} · <span dir="auto">${esc(e.plan.title)}</span></div></div>${closeBtn()}</div>`,
    `${nextCard(e, "in-panel")}<ol class="pln-needs-list all">${list.map((n, i) => `<li><button type="button" class="pln-need" data-act="pln-part" data-plan="${esc(e.id)}" data-id="${esc(n.part)}">
        <span class="pln-num num">${i + 1}</span><span class="pln-need-t"><b dir="auto">${esc(n.title)}</b><span dir="auto">${esc(n.ask)}</span><small dir="auto">${esc(n.layer)}${n.stop ? ` · ${esc(t("ch_stop", { n: n.stop }))}` : ""}</small></span>${fwd()}</button></li>`).join("")}</ol>`);
  }
  function openDecision(planId, id) {
    const e = entryOf(planId);
    const list = e?.plan?.decisions || [];
    const x = list.find((dd) => dd.id === id);
    if (!x) return;
    const words = W(), call = x.state === "open" && /your call/i.test(x.pick_label || "");
    panel(e, `<div class="panel-head pln-ph"><span class="pln-ph-icon" data-s="${x.state === "settled" ? "live" : call ? "needs-you" : "open"}">${si(x.state === "settled" ? "live" : "open", "lg")}</span><div class="main"><h2 dir="auto">${esc(x.title)}</h2>
      <div class="about">${esc(t("decisionN", { n: list.indexOf(x) + 1, total: list.length }))} · <span dir="auto">${esc(e.plan.title)}</span></div></div>${closeBtn()}</div>`,
    `<div class="pln-facts"><span class="pln-dstate" data-state="${x.state}"${call ? " data-call" : ""}>${si(x.state === "settled" ? "live" : "open")}${esc(words.decision[x.state])}${x.settled_on ? ` · ${esc(R.shortDate(x.settled_on, P.lang))}` : ""}</span></div>
      ${x.context ? `<p class="pln-lead" dir="auto">${esc(x.context)}</p>` : ""}
      ${x.pick ? `<section class="pln-pick"${call ? " data-call" : ""}><small>${esc(x.pick_label || t("pick"))}</small><p dir="auto">${esc(x.pick)}</p></section>` : ""}`);
  }
  function openCost(planId, i) {
    const e = entryOf(planId);
    const it = e?.plan?.costs?.items?.[Number(i)];
    if (!it) return;
    const row = (k, v) => (v ? `<div><dt>${esc(t(k))}</dt><dd dir="auto">${esc(v)}</dd></div>` : "");
    panel(e, `<div class="panel-head pln-ph"><span class="pln-ph-icon letter">${esc(String(it.name).charAt(0).toUpperCase())}</span><div class="main"><h2 dir="auto">${esc(it.name)}</h2>
      <div class="about">${esc(t("appByApp"))} · <span dir="auto">${esc(e.plan.title)}</span></div></div>${closeBtn()}</div>`,
    `<dl class="pln-costrows">${row("everyMonth", it.monthly)}${row("yearlyOrOnce", it.yearly)}${row("perSale", it.per_sale)}</dl>`);
  }
  function today() {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  }
  function openNewPlan() {
    const s = P.data?.sync;
    if (!canMake()) return;
    const fake = { plan: { accent: "#e9a54b" } };
    panel(fake, `<div class="panel-head pln-ph"><span class="pln-ph-icon">${g("plus")}</span><div class="main"><h2>${esc(t("newPlanHead"))}</h2><div class="about">${esc(t("fromTemplate"))}</div></div>${closeBtn()}</div>`,
      `<form class="pln-newform" novalidate><label class="pln-field"><span>${esc(t("newPlanName"))}</span>
        <input class="pln-input" name="title" type="text" maxlength="80" autocomplete="off" enterkeyhint="go" dir="auto" placeholder="${esc(t("newPlanPlaceholder"))}"></label>
        <p class="pln-newfile"><span>${esc(t("newPlanFile"))}</span><code class="mono" dir="ltr">plans/…json</code></p>
        <p class="pln-newhelp">${g("github")}<span>${esc(t("newPlanHelp"))}</span></p><p class="pln-newerr" role="alert"></p></form>`,
      `<button type="button" class="btn primary" data-act="pln-new-go">${g("github")}${esc(t("newPlanGo"))}</button>`);
    const input = $("#panel .pln-input");
    const file = $("#panel .pln-newfile code");
    input?.addEventListener("input", () => { file.textContent = `plans/${R.slugify(input.value) || "…"}.json`; $("#panel .pln-newerr").textContent = ""; });
    $("#panel .pln-newform")?.addEventListener("submit", (ev) => { ev.preventDefault(); newPlanGo(); });
    setTimeout(() => input?.focus(), 80);
  }
  function newPlanGo() {
    const input = $("#panel .pln-input");
    const made = R.newPlan(P.data?.sync?.url, P.data?.template, input?.value, today(), entries().map((e) => e.id));
    if (made.problem) { const err = $("#panel .pln-newerr"); if (err) err.textContent = t(made.problem); input?.focus(); return; }
    window.open(made.url, "_blank", "noopener");
    closePanel();
  }

  // ---------- actions ----------
  function setFilter(v) {
    P.filter = v;
    localSet("plansFilter", v);
    $$(".pln-filters .chip").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v)));
    $$(".pln-chip").forEach((c) => c.toggleAttribute("data-dim", v !== "all" && c.dataset.s !== v));
  }
  function go(hash) {
    if (location.hash === hash) redraw(); else location.hash = hash;
  }
  async function act(name, el) {
    switch (name) {
      case "pln-part": openPart(el.dataset.plan, el.dataset.id); break;
      case "pln-stop": openStop(el.dataset.plan, el.dataset.n); break;
      case "pln-layer": openLayer(el.dataset.id); break;
      case "pln-needs": openNeeds(); break;
      case "pln-dec": openDecision(el.dataset.plan, el.dataset.id); break;
      case "pln-cost": openCost(el.dataset.plan, el.dataset.i); break;
      case "pln-new": openNewPlan(); break;
      case "pln-new-go": newPlanGo(); break;
      case "pln-health": {
        if (el.dataset.v === "needs-you") { openNeeds(); break; }
        P.filter = el.dataset.v; localSet("plansFilter", P.filter);
        const e = current();
        if (e) go(R.href(e.id, "map"));
        break;
      }
      case "pln-filter": setFilter(el.dataset.v); break;
      case "pln-expand":
        P.expanded = !P.expanded; localSet("plansExpanded", P.expanded);
        el.closest(".pln-layers")?.classList.toggle("is-open", P.expanded);
        el.setAttribute("aria-expanded", String(P.expanded));
        el.innerHTML = `${esc(P.expanded ? t("foldParts") : t("showParts"))}${g(P.expanded ? "chevron-up" : "chevron-down")}`;
        break;
      case "pln-inplan": { // close the part and show it among the others, in the system map
        P.focus = el.dataset.id;
        closePanel();
        go(R.href(el.dataset.plan, "map"));
        break;
      }
      case "pln-where": closePanel(); go(R.href(el.dataset.plan, "where")); break;
      case "pln-zoom": {
        const v = Number(el.dataset.v);
        P.zoom = v ? Math.min(1.6, Math.max(0.6, Math.round((P.zoom + v * 0.2) * 10) / 10)) : 1;
        applyZoom();
        if (!v) $(".pln-mapv [data-focus], .pln-mapv .pln-fnode")?.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
        break;
      }
      case "pln-full": // the whole launcher: a tap into the map re-draws the page, and the details panel sits outside the map
        if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => {});
        break;
      case "pln-seen": {
        P.shown = null;
        el.disabled = true;
        await markSeen(el.dataset.plan, el.dataset.sig, true);
        break;
      }
      case "pln-lang":
        P.lang = ar() ? "en" : "ar"; localSet("plansLang", P.lang);
        redraw();
        break;
      case "pln-reload": P.error = ""; P.data = null; redraw(); load(); break;
      case "pln-sync": {
        el.classList.add("spin");
        try {
          await post("/api/plans/sync");
          toast(P.data?.sync?.source === "local" ? t("readingToast") : t("syncingToast"));
          setTimeout(load, 2500); setTimeout(() => { load(); el.classList.remove("spin"); }, 8000);
        } catch (err) { toast(err.message); el.classList.remove("spin"); }
        break;
      }
      default: break;
    }
  }

  // ---------- lifecycle ----------
  function mount() {
    if (!P.timer && !backup) P.timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, 60000);
    P.ro?.disconnect(); P.ro = null;
    if ($(".pln-flow")) {
      drawLinks(); applyZoom();
      let width = $(".pln-mv-port")?.clientWidth || 0;
      P.ro = new ResizeObserver(() => {
        const now = $(".pln-mv-port")?.clientWidth || 0;
        if (now !== width) { width = now; applyZoom(); }
        drawLinks();
      });
      $$(".pln-flow, .pln-mv-port").forEach((f) => P.ro.observe(f));
    }
    if (P.focus) { // "Open in plan": the part, ringed for a moment among the others
      const el = $(`.pln-chip[data-id="${CSS.escape(P.focus)}"]`);
      el?.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      el?.focus({ preventScroll: true });
      setTimeout(() => { P.focus = null; $$(".pln-chip[data-focus]").forEach((c) => c.removeAttribute("data-focus")); }, 2400);
    }
  }
  function unmount() {
    clearInterval(P.timer); P.timer = null;
    P.ro?.disconnect(); P.ro = null;
    leave();
  }
  const setId = (id, tab, node) => {
    const next = id || null;
    if (P.shown && P.shown.id !== (R.pick(entries(), next)?.id ?? next)) leave();
    if (tab === R.VIEW || R.TABS.includes(tab)) { P.view = tab === R.VIEW ? "map" : "details"; localSet("plansView", P.view); } // his last choice opens next time
    P.id = next; P.tab = R.tabOf(tab, P.view === "map" ? R.VIEW : "overview"); P.node = P.tab === R.VIEW ? node || "" : "";
    if (P.tab !== R.VIEW) P.depth = 0;
  };
  const search = (q) => R.searchParts(entries(), q);
  const isLoaded = () => P.loaded;
  const statusWord = (k) => R.words(P.data).status[k] || k;
  return { render, mount, unmount, act, load, search, openPart, setId, isLoaded, si, statusWord, homeRail };
}
