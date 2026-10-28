// Plans: living business plans, read from the private plans repo through the PC (never the backup).
// A plan's page: the hero card (serif title, sync line, progress ring) with the lit launch line, "What needs you",
// the plan in layers (one chip per part), then decisions, costs, what was checked and where it lives. A part, a
// stop or a layer opens as the side panel on a computer and the bottom sheet on a phone. The plan's data and its
// words come from the server (core/plans.py); rules without a DOM live in plans-rules.js.
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

export function createPlans(d) {
  const { $, $$, esc, g, api, post, toast, openPanel, offlineBar, localGet, localSet, backup, redraw, liveOrigin } = d;
  const P = { data: null, error: "", needsPc: false, cachedAt: 0, loaded: false, timer: null, id: null, sig: "",
    filter: localGet("plansFilter", "all"), open: localGet("plansOpen", {}) };

  // ---------- data ----------
  async function load() {
    try {
      const data = await api("/api/plans");
      // the page redraws only when a plan or the sync state changes; the "N min ago" words update in place
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
    const el = $(".pln-sync-st"), e = current();
    if (!el || !e) return;
    const s = R.syncLine(P.data.sync, e);
    el.innerHTML = `<i aria-hidden="true"></i>${esc(s.text)}`;
    el.title = s.title;
    el.closest(".pln-sync")?.setAttribute("data-tone", s.tone);
  }
  const W = () => R.words(P.data);
  const entries = () => P.data?.plans || [];
  const current = () => R.pick(entries(), P.id);
  const entryOf = (id) => entries().find((e) => e.id === id) || current();

  // ---------- the page ----------
  function render() {
    if (P.needsPc) return backupCard();
    if (!P.data) return P.error ? `${offlineBar()}${errorCard()}` : skeleton();
    const list = entries();
    if (!list.length) return `${offlineBar()}${emptyCard()}`;
    const e = current();
    if (!e) return `${offlineBar()}${P.id ? `<div class="note">${g("alert")}<div>There is no plan called “${esc(P.id)}” any more. <a class="link-btn" href="#/plans">All plans</a></div></div>` : ""}${library(list)}`;
    if (!e.plan) return `${offlineBar()}${backTo(list)}${brokenCard(e)}`;
    return `${offlineBar()}${planPage(e, list)}`;
  }

  function skeleton() {
    const row = `<div class="skeleton pln-sk-row"></div>`;
    return `<div class="pln pln-loading" aria-busy="true" aria-label="Loading plans"><div class="pln-top"><div class="skeleton pln-sk-card"></div><div class="skeleton pln-sk-card side"></div></div>
      <div class="skeleton pln-sk-head"></div>${row.repeat(5)}</div>`;
  }
  function errorCard() {
    return `<div class="pln-empty"><span class="pln-empty-icon">${g("alert")}</span><h2>Plans didn't load</h2><p>${esc(P.error)}</p>
      <button class="btn primary" type="button" data-act="pln-reload">${g("refresh")}Try again</button></div>`;
  }
  function emptyCard() {
    const s = P.data.sync || {};
    const off = s.source === "off" || s.state === "off";
    const waiting = s.source === "github" && !s.synced_at && !["offline", "error"].includes(s.state);
    const where = s.source === "local" ? `the plans folder on this Mac (${esc(s.folder || "")})` : "your private plans repo on GitHub";
    const text = off ? `This launcher doesn't sync plans${s.detail ? ` (${esc(s.detail)})` : ""}. The PC's launcher does.`
      : waiting ? "The PC is fetching them now. They show here in a moment."
      : `A plan is one file in ${where}. Ask Claude to add one, and it shows here within 5 minutes.`;
    return `<div class="pln-empty"><span class="pln-empty-icon">${g("map")}</span>
      <h2>${off ? "Plans sync is off here" : waiting ? "Getting your plans from GitHub" : "No plans yet"}</h2>
      <p>${text}</p>
      ${s.url && s.source !== "local" ? `<a class="btn primary" href="${esc(s.url)}" target="_blank" rel="noopener">${g("github")}Open the plans repo</a>` : ""}
      ${["offline", "error"].includes(s.state) ? `<p class="pln-empty-why">${esc(R.syncLine(s, null).text)}</p>` : ""}</div>`;
  }
  function backupCard() {
    const live = liveOrigin?.();
    return `${offlineBar()}<div class="pln-empty"><span class="pln-empty-icon">${g("lock")}</span><h2>Plans stay private</h2>
      <p>They open in the live launcher on your PC, and on GitHub. The backup never carries them.</p>
      ${live ? `<a class="btn primary" href="${esc(live)}/#/plans">${g("monitor")}Try the live launcher</a>` : ""}</div>`;
  }
  function brokenCard(e) {
    const pr = e.problem || {};
    return `<div class="pln-empty"><span class="pln-empty-icon">${g("alert")}</span><h2>This plan has a problem</h2>
      <p>${esc(e.file)} can't show until it's fixed${pr.count > 1 ? ` (${pr.count} problems)` : ""}:</p>
      <ul class="pln-problems">${(pr.lines || []).map((l) => `<li class="mono">${esc(l)}</li>`).join("")}</ul>
      ${e.file_url ? `<a class="btn" href="${esc(e.file_url)}" target="_blank" rel="noopener">${g("github")}Open the file on GitHub</a>` : ""}</div>`;
  }
  const backTo = (list) => (list.length > 1 ? `<a class="pln-back" href="#/plans">${g("chevron-left")}<span>Plans</span></a>` : "");

  function library(list) {
    const cards = list.map((e) => {
      if (!e.plan) return `<a class="pln-lib" href="#/plans/${esc(encodeURIComponent(e.id))}"><span class="pln-lib-top">${si("conflict")}<b>${esc(e.id)}</b></span><span class="pln-lib-sum">Has a problem: ${esc(e.problem?.lines?.[0] || "")}</span></a>`;
      const s = e.derived.stops, n = e.derived.needs_you.length;
      const r = R.ring(s.done, s.now.length, s.total, 22);
      return `<a class="pln-lib" href="#/plans/${esc(encodeURIComponent(e.id))}" style="--plan:${esc(e.plan.accent)}">
        <span class="pln-lib-top"><svg class="pln-mring" viewBox="0 0 52 52" aria-hidden="true"><circle class="trk" cx="26" cy="26" r="22"/>${r.done ? `<circle class="arc" cx="26" cy="26" r="22" stroke-dasharray="${r.done} ${r.c}"/>` : ""}</svg>
        <span><b class="pln-lib-title" dir="auto">${esc(e.plan.title)}</b><span class="pln-lib-meta">${esc(e.plan.kind || "Plan")} · ${s.total ? `${s.done} of ${s.total} stops` : "no stops yet"}</span></span></span>
        <span class="pln-lib-sum" dir="auto">${esc(e.plan.summary)}</span>
        <span class="pln-lib-foot">${n ? `<span class="pln-badge" data-s="needs-you">${si("needs-you")}${n} need you</span>` : `<span class="pln-badge" data-s="live">${si("live")}Nothing needs you</span>`}<span class="pln-lib-when">updated ${esc(R.shortDate(e.plan.updated))}</span></span></a>`;
    }).join("");
    return `<h1 class="page-title pln-page-title">Plans</h1><div class="pln-lib-grid">${cards}</div>`;
  }

  function planPage(e, list) {
    const accent = e.plan.accent || "#e9a54b";
    document.documentElement.style.setProperty("--glow", accent); // the room takes the plan's own light
    return `<div class="pln" style="--plan:${esc(accent)}">${backTo(list)}${banners(e)}
      <div class="pln-top"><section class="pln-card" aria-labelledby="pln-title">${hero(e)}${line(e)}</section>${needs(e)}</div>
      ${layers(e)}${decisions(e)}${costs(e)}
      <div class="pln-pair">${evidence(e)}${sources(e)}</div>${foot(e)}</div>`;
  }

  function banners(e) {
    const s = P.data.sync || {};
    let out = "";
    if (["offline", "error"].includes(s.state) && s.source !== "local") {
      const line = R.syncLine(s, e);
      out += `<div class="note pln-note" data-tone="${line.tone}" role="status">${g("offline")}<div><b>${s.state === "offline" ? "GitHub can't be reached." : "The last sync didn't work."}</b> ${s.synced_at ? `This is the copy synced at ${esc(R.clock(s.synced_at))} (${esc(R.since(s.synced_at))}). It updates by itself when GitHub answers.` : "Nothing has synced yet."}${s.detail ? `<span class="pln-detail">${esc(s.detail)}</span>` : ""}</div>${backup ? "" : `<button class="btn sm" type="button" data-act="pln-sync">Try again</button>`}</div>`;
    }
    if (e.problem) {
      out += `<div class="note pln-note" data-tone="warn" role="status">${g("alert")}<div><b>The newest change to this plan has a problem,</b> so this is the last good version. ${esc(e.problem.lines?.[0] || "")}${e.problem.count > 1 ? ` (and ${e.problem.count - 1} more)` : ""}
        ${e.file_url ? `<a class="link-btn" href="${esc(e.file_url)}" target="_blank" rel="noopener">Open the file</a>` : ""}</div></div>`;
    }
    return out;
  }

  function syncButton() {
    if (backup) return "";
    const local = P.data.sync?.source === "local";
    return `<button class="icon-btn pln-syncbtn" type="button" data-act="pln-sync" aria-label="${local ? "Read the folder again" : "Sync from GitHub now"}" title="${local ? "Read the folder again" : "Sync now"}">${g("refresh")}</button>`;
  }

  function hero(e) {
    const p = e.plan, s = e.derived.stops;
    const sync = R.syncLine(P.data.sync, e);
    const r = R.ring(s.done, s.now.length, s.total);
    const words = W(), counts = e.derived.counts, total = e.derived.parts;
    const kinds = words.status_order.filter((k) => counts[k]);
    const health = total ? `<div class="pln-health"><div class="pln-hbar" role="img" aria-label="${esc(`${total} parts: ${kinds.map((k) => `${counts[k]} ${R.countWord(k, counts[k])}`).join(", ")}`)}">${kinds.map((k) => `<i data-s="${k}" style="flex:${counts[k]}"></i>`).join("")}</div>
      <ul class="pln-hcap">${kinds.map((k) => `<li>${si(k)}<b class="num">${counts[k]}</b>${esc(R.countWord(k, counts[k]))}</li>`).join("")}</ul>
      <ul class="pln-hkey" aria-label="Parts by status">${kinds.map((k) => `<li><button type="button" class="pln-hrow" data-act="pln-health" data-v="${k}" data-s="${k}">${si(k)}<b class="num">${counts[k]}</b><span>${esc(R.countWord(k, counts[k]))}</span></button></li>`).join("")}</ul></div>` : "";
    const doing = p.stops.filter((x) => x.state === "now").map((x) => x.title);
    const nextYou = p.stops.find((x) => x.n === s.next_you);
    const nextList = [
      doing.length ? `<div><dt>Doing now</dt><dd dir="auto">${esc(doing.join(", "))}</dd></div>` : "",
      nextYou ? `<div><dt>Next for you</dt><dd dir="auto">${esc(nextYou.title)}</dd></div>` : "",
    ].join("");
    const ringEl = s.total ? `<div class="pln-ring" role="img" aria-label="${s.done} of ${s.total} stops done">
        <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="trk" cx="60" cy="60" r="52"/>
        ${r.now ? `<circle class="now" cx="60" cy="60" r="52" stroke-dasharray="${r.now.toFixed(2)} ${r.c.toFixed(2)}" stroke-dashoffset="${r.nowOffset.toFixed(2)}"/>` : ""}
        ${r.done ? `<circle class="arc" cx="60" cy="60" r="52" stroke-dasharray="${r.done.toFixed(2)} ${r.c.toFixed(2)}"/>` : ""}</svg>
        <div class="pln-ring-t"><b class="num">${s.done} of ${s.total}</b><span>stops done</span></div></div>` : "";
    const next = nextList ? `<dl class="pln-next">${nextList}</dl>` : "";
    return `<header class="pln-head">
      <div class="pln-id">
        <h1 class="pln-title" id="pln-title" dir="auto">${esc(p.title)}</h1>
        <p class="pln-summary" dir="auto">${esc(p.summary)}</p>
        <p class="pln-sync" data-tone="${sync.tone}">${g("github")}<span>Updated ${esc(R.longDate(p.updated))}</span><span class="sep" aria-hidden="true">·</span><span class="pln-sync-st" title="${esc(sync.title)}"><i aria-hidden="true"></i>${esc(sync.text)}</span>${syncButton()}</p>
        ${health}
      </div>
      ${ringEl || next ? `<div class="pln-progress">${ringEl}${next}</div>` : ""}
    </header>`;
  }

  function line(e) {
    const words = W(), stops = e.plan.stops;
    if (!stops.length) return `<div class="pln-linebox"><p class="pln-line-empty">No stops yet. A launch line is the plan's shortest path, one stop after another.</p></div>`;
    const lit = e.derived.stops.lit;
    const items = stops.map((s, i) => `<li class="pln-stop" data-state="${s.state}"${i <= lit ? " data-lit" : ""}${i < lit ? " data-lit-next" : ""}>
      <button type="button" class="pln-stop-btn" data-act="pln-stop" data-n="${s.n}" aria-label="${esc(`Stop ${s.n}, ${s.title}: ${words.stop[s.state]}. ${words.who[s.who]}.`)}">
        ${s.state === "now" ? `<span class="pln-doing">Doing now</span>` : ""}
        <span class="pln-node">${s.state === "done" ? CHECK : `<span class="num">${s.n}</span>`}</span>
        <span class="pln-stop-n num">${s.n}</span>
        <span class="pln-stop-t" dir="auto">${esc(s.title)}</span>
        <span class="pln-who" data-state="${s.state}">${esc(words.who[s.who])}</span>
        <span class="pln-stop-note" dir="auto">${esc([words.stop[s.state], s.note].filter(Boolean).join(" · "))}</span>
      </button></li>`).join("");
    const key = ["done", "now", "you", "later"].filter((k) => stops.some((s) => s.state === k))
      .map((k) => `<li data-state="${k}"><i aria-hidden="true"></i>${esc(words.stop[k])}</li>`).join("");
    return `<div class="pln-linebox"><ol class="pln-line" aria-label="Launch line" style="--n:${stops.length};--lit:${Math.max(lit, 0)}"${lit < 0 ? " data-unlit" : ""}>${items}</ol>
      <ul class="pln-key" aria-label="What the stops mean">${key}</ul>${e.plan.notes?.line ? `<p class="pln-line-note" dir="auto">${esc(e.plan.notes.line)}</p>` : ""}</div>`;
  }

  function needs(e) {
    const list = e.derived.needs_you, open = e.derived.decisions_open;
    const items = list.slice(0, 3).map((n, i) => `<li><button type="button" class="pln-need" data-act="pln-part" data-plan="${esc(e.id)}" data-id="${esc(n.part)}">
        <span class="pln-num num">${i + 1}</span><span class="pln-need-t"><b dir="auto">${esc(n.title)}</b><span dir="auto">${esc(n.ask)}</span></span>${g("chevron-right")}</button></li>`).join("");
    const body = list.length ? `<ol class="pln-needs-list">${items}</ol>` : `<p class="pln-none">${si("live")}<span>Nothing waits on you right now.</span></p>`;
    const foot = [
      list.length > 3 ? `<button type="button" class="pln-more" data-act="pln-needs">Show all ${list.length}${g("chevron-right")}</button>` : "",
      open ? `<button type="button" class="pln-more quiet" data-act="pln-goto" data-to="pln-decisions">${open} decision${open > 1 ? "s" : ""} to settle${g("chevron-down")}</button>` : "",
    ].join("");
    return `<aside class="pln-needs" aria-labelledby="pln-needs-h"><div class="pln-needs-head"><h2 id="pln-needs-h">What needs you</h2>${list.length ? `<span class="pln-count num" aria-label="${list.length} things">${list.length}</span>` : ""}</div>
      ${body}${foot ? `<div class="pln-needs-foot">${foot}</div>` : ""}</aside>`;
  }

  function layers(e) {
    const words = W(), p = e.plan, dv = e.derived;
    if (!p.layers.length) return `<section class="section pln-layers"><div class="pln-sec-head"><h2>The plan in layers</h2></div><p class="pln-line-empty">No layers yet. Group the plan's parts into layers, like “Front door” or “Runs on”.</p></section>`;
    const f = dv.counts[P.filter] ? P.filter : "all";
    const filters = [`<button class="chip" type="button" data-act="pln-filter" data-v="all" aria-pressed="${f === "all"}">Everything<span class="count">${dv.parts}</span></button>`]
      .concat(words.status_order.filter((k) => dv.counts[k]).map((k) => `<button class="chip pln-fchip" type="button" data-act="pln-filter" data-v="${k}" aria-pressed="${f === k}">${si(k)}${esc(words.status[k])}<span class="count">${dv.counts[k]}</span></button>`)).join("");
    const rows = p.layers.map((l) => {
      const counts = {};
      for (const part of l.parts) counts[part.status] = (counts[part.status] || 0) + 1;
      const sum = words.status_order.filter((k) => counts[k]).map((k) => `<span class="pln-mini" data-s="${k}" title="${esc(words.status[k])}">${si(k)}<span class="num">${counts[k]}</span><span class="sr">${esc(words.status[k])}</span></span>`).join("");
      const chips = l.parts.map((part) => `<button type="button" class="pln-chip" data-s="${part.status}" data-act="pln-part" data-plan="${esc(e.id)}" data-id="${esc(part.id)}"${f !== "all" && part.status !== f ? " data-dim" : ""}>
          ${si(part.status)}<span class="pln-chip-t" dir="auto">${esc(part.title)}</span><span class="pln-chip-s">${esc(words.status[part.status])}</span></button>`).join("");
      const open = !!P.open[l.id];
      return `<div class="pln-layer${open ? " is-open" : ""}" data-layer="${esc(l.id)}">
        <button type="button" class="pln-layer-head" data-act="pln-layer-head" data-id="${esc(l.id)}" aria-expanded="${open}">
          <span class="pln-layer-icon">${g(l.icon || "layers")}</span>
          <span class="pln-layer-name"><b dir="auto">${esc(l.name)}</b>${l.note ? `<span dir="auto">${esc(l.note)}</span>` : ""}</span>
          <span class="pln-layer-sum">${sum}</span>${g("chevron-down", "pln-fold")}</button>
        <div class="pln-chips">${chips || `<p class="pln-line-empty">No parts yet.</p>`}</div>
        <button type="button" class="icon-btn pln-layer-open" data-act="pln-layer" data-id="${esc(l.id)}" aria-label="${esc(`All of ${l.name}`)}">${g("chevron-right")}</button></div>`;
    }).join("");
    return `<section class="section pln-layers" aria-labelledby="pln-layers-h">
      <div class="pln-sec-head"><h2 id="pln-layers-h">The plan in layers</h2><span class="meta">${dv.parts} part${dv.parts === 1 ? "" : "s"}</span></div>
      <div class="chips pln-filters" role="group" aria-label="Show parts by status">${filters}</div>
      <div class="pln-layer-list">${rows}</div>${p.notes?.layers ? `<p class="pln-sec-note" dir="auto">${esc(p.notes.layers)}</p>` : ""}</section>`;
  }

  function decisions(e) {
    const words = W(), list = e.plan.decisions;
    if (!list.length) return "";
    const open = list.filter((x) => x.state === "open").length;
    const cards = list.map((x) => {
      const call = x.state === "open" && /your call/i.test(x.pick_label || "");
      const icon = x.state === "settled" ? si("live") : si("open");
      return `<article class="pln-dec" data-state="${x.state}"${call ? " data-call" : ""}>
        <span class="pln-dstate" data-state="${x.state}"${call ? " data-call" : ""}>${icon}${esc(words.decision[x.state])}${x.settled_on ? ` · ${esc(R.shortDate(x.settled_on))}` : ""}</span>
        <h3 dir="auto">${esc(x.title)}</h3>
        ${x.context ? `<p class="pln-dctx" dir="auto">${esc(x.context)}</p>` : ""}
        ${x.pick ? `<p class="pln-dpick" dir="auto"><b>${esc(x.pick_label || "Pick")}</b>${esc(x.pick)}</p>` : ""}</article>`;
    }).join("");
    return `<section class="section pln-decisions" id="pln-decisions" aria-labelledby="pln-dec-h">
      <div class="pln-sec-head"><h2 id="pln-dec-h">Settle these first</h2><span class="meta">${open ? `${open} open · ` : ""}${list.length - open} settled</span></div>
      ${e.plan.notes?.decisions ? `<p class="pln-sec-note top" dir="auto">${esc(e.plan.notes.decisions)}</p>` : ""}<div class="pln-dec-grid">${cards}</div></section>`;
  }

  function costs(e) {
    const c = e.plan.costs;
    if (!c || !((c.stages || []).length || (c.fees || []).length || (c.items || []).length)) return "";
    const b = R.costBars(c, SERIES.length);
    const col = (i) => (i < 0 ? "" : `--c:${SERIES[i]}`);
    const rows = b.rows.map((r) => {
      const said = r.segs.map((s) => `${s.extra ? "plus " : ""}${s.label} ${R.money(s.low, s.high, c.currency)}`).join(", ");
      const h = Math.max(1.5, (r.sum / b.max) * 100);
      return `<div class="pln-col"><div class="pln-col-bar" role="img" aria-label="${esc(`${r.label}: ${r.total}. ${said}.`)}"><div class="pln-col-stack" style="height:${h.toFixed(2)}%">${r.segs.map((s) => `<i class="${s.extra ? "extra" : ""}" style="flex:${Math.max(s.value, 0.0001)} 1 0;${col(s.colour)}" title="${esc(`${s.label}: ${R.money(s.low, s.high, c.currency)} a month${s.note ? ` · ${s.note}` : ""}`)}"></i>`).join("")}</div></div>
        <b class="pln-col-total" dir="auto">${esc(r.total)}</b><span class="pln-col-label" dir="auto">${esc(r.label)}</span></div>`;
    }).join("");
    const legend = b.legend.length ? `<div class="legend pln-legend">${b.legend.map((l) => `<span><i class="${l.colour < 0 ? "extra" : ""}" style="${col(l.colour)}"></i>${esc(l.label)}</span>`).join("")}</div>` : "";
    const fees = (c.fees || []).length ? `<div class="pln-fees-wrap"><h3>On each sale</h3><div class="pln-fees">${c.fees.map((f) => `<div class="pln-fee"><b dir="auto">${esc(f.label)}</b><span class="num" dir="auto">${esc(f.value)}</span>${f.note ? `<small dir="auto">${esc(f.note)}</small>` : ""}</div>`).join("")}</div></div>` : "";
    const items = (c.items || []).length ? `<details class="pln-items"><summary>${g("list")}<span>App by app</span>${g("chevron-down")}</summary><div class="pln-item-grid">${c.items.map((it) => `<div class="pln-item"><b dir="auto">${esc(it.name)}</b>
        ${it.monthly ? `<p><span>Every month</span>${esc(it.monthly)}</p>` : ""}${it.yearly ? `<p><span>Yearly or once</span>${esc(it.yearly)}</p>` : ""}${it.per_sale ? `<p><span>On each sale</span>${esc(it.per_sale)}</p>` : ""}</div>`).join("")}</div></details>` : "";
    const table = `<div class="sr"><table><caption>Monthly cost by stage</caption><tr><th>Stage</th><th>Total</th><th>Made of</th></tr>${b.rows.map((r) => `<tr><td>${esc(r.label)}</td><td>${esc(r.total)}</td><td>${esc(r.segs.map((s) => `${s.label} ${R.money(s.low, s.high, c.currency)}`).join(", "))}</td></tr>`).join("")}</table></div>`; // a table ignores a 1px width, so a div hides it
    return `<section class="section pln-costs" aria-labelledby="pln-cost-h">
      <div class="pln-sec-head"><h2 id="pln-cost-h">What it costs</h2><span class="meta">${esc(c.currency || "USD")} a month</span></div>
      <div class="pln-cost-grid"><div class="pln-cost-card">${rows ? `<div class="pln-cols" style="--cols:${b.rows.length}">${rows}</div>${legend}` : ""}${c.note ? `<p class="pln-sec-note" dir="auto">${esc(c.note)}</p>` : ""}${table}</div>
      <div class="pln-cost-side">${fees}${items}</div></div>
      ${c.total ? `<p class="pln-total" dir="auto">${esc(c.total)}</p>` : ""}</section>`;
  }

  function evidence(e) {
    const list = e.plan.evidence;
    if (!list.length) return "";
    return `<section class="section pln-evidence" aria-labelledby="pln-ev-h"><div class="pln-sec-head"><h2 id="pln-ev-h">Checked</h2><span class="meta">${esc(R.longDate(e.plan.updated))}</span></div>
      <ul class="pln-ev">${list.map((x) => `<li data-ok="${x.ok}">${si(x.ok ? "live" : "conflict")}<span dir="auto">${esc(x.text)}</span>${x.ok ? "" : `<span class="sr">(a warning)</span>`}</li>`).join("")}</ul></section>`;
  }
  function sources(e) {
    const list = e.plan.sources;
    if (!list.length) return "";
    return `<section class="section pln-sources" aria-labelledby="pln-src-h"><div class="pln-sec-head"><h2 id="pln-src-h">Where it lives</h2></div>
      <dl class="pln-where">${list.map((s) => `<div><dt dir="auto">${esc(s.label)}</dt><dd>${s.url ? `<a class="pln-ext" href="${esc(s.url)}" target="_blank" rel="noopener"><span dir="auto">${esc(s.where)}</span>${g("external")}</a>` : `<span class="mono">${esc(s.where)}</span>`}</dd></div>`).join("")}</dl></section>`;
  }
  function foot(e) {
    const bits = [];
    if (e.plan.basis) bits.push(`<span dir="auto">${esc(e.plan.basis)}</span>`);
    const links = [];
    if (e.page_url) links.push(`<a class="link-btn" href="${esc(e.page_url)}" target="_blank" rel="noopener">${g("github")}See it on GitHub</a>`);
    if (e.file_url) links.push(`<a class="link-btn" href="${esc(e.file_url)}" target="_blank" rel="noopener">${g("file-text")}The plan file</a>`);
    return `<footer class="pln-foot">${bits.join("")}<span class="pln-foot-links">${links.join("")}</span></footer>`;
  }

  // ---------- panels ----------
  const closeBtn = () => `<button class="icon-btn" data-act="close" aria-label="Close">${g("x")}</button>`;
  function listOf(items, kind) {
    return `<ul class="pln-list" data-kind="${kind}">${items.map((x) => `<li>${kind === "ok" ? `<span class="pln-tick" aria-hidden="true">${CHECK}</span>` : `<span class="pln-gap" aria-hidden="true"></span>`}<span dir="auto">${esc(x)}</span></li>`).join("")}</ul>`;
  }
  function openPart(planId, partId) {
    const e = entryOf(planId);
    const hit = e?.plan && R.findPart(e.plan, partId);
    if (!hit) return;
    const { part, layer } = hit;
    const words = W(), at = layer.parts.indexOf(part) + 1;
    const stop = part.stop != null ? e.plan.stops.find((s) => s.n === part.stop) : null;
    const body = `<div class="pln-facts"><span class="pln-badge" data-s="${part.status}">${si(part.status)}${esc(words.status[part.status])}</span>
        <span class="pln-who">${esc(words.who[part.who])}</span>
        ${stop ? `<button type="button" class="pln-stopref" data-act="pln-stop" data-plan="${esc(e.id)}" data-n="${stop.n}"><span class="pln-stopref-n num">${stop.n}</span>${esc(stop.title)} · ${esc(words.stop[stop.state])}</button>` : ""}</div>
      <p class="pln-lead" dir="auto">${esc(part.summary)}</p>
      ${part.missing.length ? `<section class="section"><div class="section-head"><h2>What's missing</h2><span class="meta">${part.missing.length}</span></div>${listOf(part.missing, "miss")}</section>` : ""}
      ${part.exists.length ? `<section class="section"><div class="section-head"><h2>What exists</h2><span class="meta">${part.exists.length}</span></div>${listOf(part.exists, "ok")}</section>` : ""}
      ${part.source ? `<p class="pln-noted">${g("book")}<span><b>Noted in</b> <span dir="auto">${esc(part.source)}</span></span></p>` : ""}
      ${e.page_url ? `<div class="btns pln-panel-btns"><a class="btn primary" href="${esc(`${e.page_url}#${anchor(layer.name)}`)}" target="_blank" rel="noopener">${g("github")}Open on GitHub</a></div>` : ""}`;
    openPanel(`<div class="panel-head pln-ph"><span class="pln-ph-icon" data-s="${part.status}">${si(part.status, "lg")}</span><div class="main"><h2 dir="auto">${esc(part.title)}</h2>
      <div class="about" dir="auto">${esc(layer.name)} · part ${at} of ${layer.parts.length}</div></div>${closeBtn()}</div><div class="panel-body pln-pb" style="--plan:${esc(e.plan.accent)}">${body}</div>`);
  }
  const anchor = (text) => String(text).trim().toLowerCase().replace(/[^\p{L}\p{N}\- _]/gu, "").replace(/ /g, "-");
  const partRows = (e, pairs) => `<div class="pln-prows">${pairs.map(({ part, layer }) => `<button type="button" class="pln-prow" data-act="pln-part" data-plan="${esc(e.id)}" data-id="${esc(part.id)}" data-s="${part.status}">
      ${si(part.status)}<span class="pln-prow-t"><b dir="auto">${esc(part.title)}</b><span dir="auto">${esc(part.summary)}</span></span><span class="pln-prow-s">${esc(W().status[part.status])}${layer ? `<small dir="auto">${esc(layer.name)}</small>` : ""}</span></button>`).join("")}</div>`;

  function openStop(planId, n) {
    const e = entryOf(planId);
    const stop = e?.plan?.stops.find((s) => s.n === Number(n));
    if (!stop) return;
    const words = W();
    const parts = R.partsOfStop(e.plan, stop.n);
    openPanel(`<div class="panel-head pln-ph"><span class="pln-ph-stop" data-state="${stop.state}"><span class="pln-node">${stop.state === "done" ? CHECK : `<span class="num">${stop.n}</span>`}</span></span>
      <div class="main"><h2 dir="auto">${esc(stop.title)}</h2><div class="about">Stop ${stop.n} of ${e.plan.stops.length} · ${esc(e.plan.title)}</div></div>${closeBtn()}</div>
      <div class="panel-body pln-pb" style="--plan:${esc(e.plan.accent)}"><div class="pln-facts"><span class="pln-badge stop" data-state="${stop.state}"><i aria-hidden="true"></i>${esc(words.stop[stop.state])}</span><span class="pln-who">${esc(words.who[stop.who])}</span></div>
      ${stop.note ? `<p class="pln-lead" dir="auto">${esc(stop.note)}</p>` : ""}
      ${parts.length ? `<section class="section"><div class="section-head"><h2>Its parts</h2><span class="meta">${parts.length}</span></div>${partRows(e, parts)}</section>` : `<p class="pln-line-empty">No parts are tied to this stop.</p>`}</div>`);
  }
  function openLayer(id) {
    const e = current();
    const layer = e?.plan?.layers.find((l) => l.id === id);
    if (!layer) return;
    openPanel(`<div class="panel-head pln-ph"><span class="pln-ph-icon layer">${g(layer.icon || "layers")}</span><div class="main"><h2 dir="auto">${esc(layer.name)}</h2>
      <div class="about" dir="auto">${esc(layer.note || e.plan.title)}</div></div>${closeBtn()}</div>
      <div class="panel-body pln-pb" style="--plan:${esc(e.plan.accent)}">${layer.parts.length ? partRows(e, layer.parts.map((part) => ({ part }))) : `<p class="pln-line-empty">No parts yet.</p>`}</div>`);
  }
  function openNeeds() {
    const e = current();
    if (!e?.plan) return;
    const list = e.derived.needs_you;
    openPanel(`<div class="panel-head pln-ph"><span class="pln-ph-icon" data-s="needs-you">${si("needs-you", "lg")}</span><div class="main"><h2>What needs you</h2>
      <div class="about">${list.length} thing${list.length === 1 ? "" : "s"}, in launch order · ${esc(e.plan.title)}</div></div>${closeBtn()}</div>
      <div class="panel-body pln-pb" style="--plan:${esc(e.plan.accent)}"><ol class="pln-needs-list all">${list.map((n, i) => `<li><button type="button" class="pln-need" data-act="pln-part" data-plan="${esc(e.id)}" data-id="${esc(n.part)}">
        <span class="pln-num num">${i + 1}</span><span class="pln-need-t"><b dir="auto">${esc(n.title)}</b><span dir="auto">${esc(n.ask)}</span><small dir="auto">${esc(n.layer)}${n.stop ? ` · stop ${n.stop}` : ""}</small></span>${g("chevron-right")}</button></li>`).join("")}</ol></div>`);
  }

  // ---------- actions ----------
  // a layer folds where the page shows its counts instead of its chips (phones, narrow windows): ask the page, not the width
  const folded = (head) => { const sum = head.querySelector(".pln-layer-sum"); return !!sum && getComputedStyle(sum).display !== "none"; };
  function setFilter(v) {
    P.filter = v;
    localSet("plansFilter", v);
    $$(".pln-filters .chip").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v)));
    $$(".pln-chip").forEach((c) => c.toggleAttribute("data-dim", v !== "all" && c.dataset.s !== v));
  }
  async function act(name, el) {
    switch (name) {
      case "pln-part": openPart(el.dataset.plan, el.dataset.id); break;
      case "pln-stop": openStop(el.dataset.plan, el.dataset.n); break;
      case "pln-layer": openLayer(el.dataset.id); break;
      case "pln-layer-head":
        if (folded(el)) {
          const id = el.dataset.id;
          P.open = { ...P.open, [id]: !P.open[id] };
          localSet("plansOpen", P.open);
          el.setAttribute("aria-expanded", String(!!P.open[id]));
          el.closest(".pln-layer")?.classList.toggle("is-open", !!P.open[id]);
        } else openLayer(el.dataset.id);
        break;
      case "pln-needs": openNeeds(); break;
      case "pln-health":
        if (el.dataset.v === "needs-you") { openNeeds(); break; }
        setFilter(el.dataset.v);
        document.getElementById("pln-layers-h")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
        break;
      case "pln-filter": setFilter(el.dataset.v); break;
      case "pln-goto": document.getElementById(el.dataset.to)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); break;
      case "pln-reload": P.error = ""; P.data = null; redraw(); load(); break;
      case "pln-sync": {
        el.classList.add("spin");
        try {
          await post("/api/plans/sync");
          toast(P.data?.sync?.source === "local" ? "Reading this Mac's plans folder" : "Syncing from GitHub…");
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
  }
  function unmount() { clearInterval(P.timer); P.timer = null; }
  const setId = (id) => { P.id = id || null; };
  const search = (q) => R.searchParts(entries(), q);
  const isLoaded = () => P.loaded;
  const statusWord = (k) => W().status[k] || k;
  return { render, mount, unmount, act, load, search, openPart, setId, isLoaded, si, statusWord };
}
