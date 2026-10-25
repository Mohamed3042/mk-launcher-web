// Cinema: choose the film the portfolio home features and the best 5-second cuts of every film.
// The list ranks every film by the score of its best cuts (made by the library's own ranker, no AI); a film's sheet
// is its backlog (what each part is about and how good it is) plus the ranked cuts to watch, tick and rename.
// "Feature on the portfolio" saves the pick and publishes it; the steps show live. Rules without a DOM live in
// cinema-rules.js. In the GitHub backup this page is read-only and every write control is grey.
import * as R from "./cinema-rules.js";

export function createCinema(d) {
  const { $, $$, esc, g, api, post, toast, ago, openPanel, greyBtn, offlineBar, redraw, localGet, localSet, backup } = d;
  const C = {
    data: null, choices: [], at: 0, sig: "", loading: false, error: "", job: null, timer: null, seen: 0, dismissed: 0, finished: 0,
    sort: localGet("cinemaSort", "best"), product: localGet("cinemaProduct", "all"), sheet: null,
  };
  const choiceOf = (key) => C.choices.find((c) => c.key === key);
  const filmName = (id) => {
    const f = (C.data?.films || []).find((x) => x.id === id);
    return f ? R.publicName(f.title) : (C.data?.worlds || []).find((w) => w.id.replace(/^site:/, "") === String(id).replace(/^site:/, ""))?.name || id;
  };
  const tools = () => C.data?.tools || {};
  const poster = (f, cls = "") => (f?.poster
    ? `<span class="cin-poster ${cls}"><img src="${esc(f.poster)}" alt="" loading="lazy" decoding="async"></span>`
    : `<span class="cin-poster ph ${cls}">${g("film")}</span>`);
  const wrapSection = (cls, title, meta, extra, body) => `<section class="section ${cls}"><div class="section-head"><h2>${esc(title)}</h2>${meta ? `<span class="meta">${esc(meta)}</span>` : ""}<span class="grow"></span>${extra || ""}</div>${body}</section>`;
  const note = (glyph, html) => `<div class="note">${g(glyph)}<div>${html}</div></div>`;

  // ---------- the page ----------
  function render() {
    let body;
    if (!C.data) body = C.error ? note("alert", esc(C.error)) : `<div class="skeleton" style="height:180px"></div><div class="skeleton" style="height:360px;margin-top:18px"></div>`;
    else if (!C.data.available) body = note("film", esc(C.data.reason || "The film library isn't on this PC."));
    else body = `<div class="cin-jobslot" aria-live="polite">${jobBar()}</div>
      <div class="cin-cols"><div class="cin-main">${filmsSection()}</div><div class="cin-side">${liveSection()}${worldsSection()}</div></div>`;
    return `${offlineBar()}<div class="cin" data-cin-root>${body}</div>`;
  }

  function jobBar() {
    const j = C.job;
    if (!j?.kind || (!j.running && (j.started !== C.seen || j.started === C.dismissed))) return "";
    const what = `${j.kind === "rank" ? "Ranking" : "Publishing"} ${j.kind === "rank" && j.film === "all" ? "all films" : R.publicName(j.title || "")}`;
    if (j.running) return `<div class="cin-job"><span class="st starting"><i></i></span><div class="cin-job-text"><b dir="auto">${esc(what)}</b><span>${esc(j.label || "Working")}</span></div></div>`;
    const ok = j.ok;
    return `<div class="cin-job ${ok ? "ok" : "bad"}"><span class="st ${ok ? "up" : "down"}"><i></i></span><div class="cin-job-text"><b dir="auto">${ok ? (j.kind === "rank" ? "Cuts ranked" : "Live on your portfolio") : "That didn't work"}</b>
      <span>${esc(ok ? (j.kind === "rank" ? "The best cuts are saved to your library." : `${R.publicName(j.title || "")} is on the home page.`) : j.error || "It stopped. Try again.")}</span></div><button class="icon-btn" data-act="cin-dismiss" aria-label="Dismiss">${g("x")}</button></div>`;
  }
  const paintJob = () => { const slot = $(".cin-jobslot"); if (slot) slot.innerHTML = jobBar(); };

  // On the portfolio now: the live site first, else what he picked.
  function leadBlock(lang) {
    const info = R.leadInfo(lang, C.data);
    const tag = `<span class="cin-tag">${lang === "en" ? "English home" : "Arabic home"}</span>`;
    if (!info) return `<div class="cin-lead">${tag}<p class="cin-sub">Nothing chosen yet.</p></div>`;
    const film = info.film;
    const choice = film ? C.choices.find((c) => c.members.some((m) => m.id === film.id)) : null;
    const ids = backup ? [] : R.leadCuts(info, C.data, film).slice(0, R.MAX_CUTS);
    const thumbs = film && ids.length ? `<div class="cin-thumbs" aria-label="Cuts on the home">${ids.map((id) => `<img class="cin-thumb-s" src="${esc(R.thumbUrl(film, id))}" alt="" loading="lazy" decoding="async">`).join("")}</div>` : "";
    const facts = film ? ["Featured film", R.clock(film.seconds), info.item?.chapters ? `${info.item.chapters} chapters` : ""] : ["Built into the site"];
    const wait = info.pending ? `<p class="cin-pending">${g("clock")}<span>You picked ${esc(filmName(info.picked))}. The site still shows this one for now.</span></p>` : "";
    const open = choice ? ` data-act="cin-open" data-key="${esc(choice.key)}" role="button" tabindex="0"` : "";
    return `<div class="cin-lead${choice ? " tap" : ""}"${open}><div class="cin-lead-top">${film ? poster(film) : `<span class="cin-poster world">${g("globe")}</span>`}
      <div class="cin-lead-text">${tag}<h3 dir="auto">${esc(info.name)}</h3><p class="cin-sub">${esc(facts.filter(Boolean).join(" · "))}</p></div></div>${thumbs}${wait}</div>`;
  }
  function liveSection() {
    const live = C.data.live || {};
    const first = R.leadInfo("en", C.data) || R.leadInfo("ar", C.data);
    const accent = (C.data.program?.copy?.[first?.id]?.accent) || "#ffb340";
    const status = live.ok
      ? `<span class="st up"><i></i>Live${live.updated ? ` · updated ${esc(ago(live.updated))}` : ""}</span>`
      : `<span class="st"><i></i>${backup ? "As last seen" : esc(live.error || "The site didn't answer just now. Showing what you picked.")}</span>`;
    const body = `<div class="cin-live" style="--c:${esc(accent)}">${leadBlock("en")}${leadBlock("ar")}<div class="cin-live-foot">${status}</div></div>`;
    return wrapSection("cin-live-sec", "On the portfolio now", "", C.data.site ? `<a class="link-btn" href="${esc(C.data.site)}" target="_blank" rel="noopener">Open the site</a>` : "", body);
  }

  function meter(c) {
    if (c.best == null) return `<span class="cin-meter none"><b>–</b><em>not ranked</em></span>`;
    const old = c.members.some((f) => f.cuts?.outdated);
    return `<span class="cin-meter" role="img" aria-label="Best cuts ${c.best} out of 100"><b class="num">${c.best}</b><i><s style="width:${Math.max(2, Math.min(100, c.best))}%"></s></i>${old ? `<em>outdated</em>` : ""}</span>`;
  }
  function filmsSection() {
    const data = C.data;
    const prods = R.productsOf(C.choices);
    if (C.product !== "all" && !prods.some((p) => p.name === C.product)) C.product = "all";
    const list = R.sortChoices(R.filterChoices(C.choices, C.product), C.sort);
    const live = new Set(["en", "ar"].map((l) => R.leadInfo(l, data)?.id).filter(Boolean));
    const films = data.films || [];
    const unranked = films.filter((f) => !f.cuts.ranked).length;
    const rankedCount = films.length - unranked;
    let rankAll = "";
    if (backup) rankAll = greyBtn("cinema", `${g("sparkles")}Rank all`, "btn sm");
    else if (tools().rank) rankAll = `<button class="btn sm ${unranked ? "primary" : "ghost"}" type="button" data-act="cin-rank-all"${C.job?.running ? " disabled" : ""}>${g("sparkles")}${unranked ? `Rank ${unranked} unranked` : "Rank all again"}</button>`;
    const chips = [`<button class="chip" type="button" data-act="cin-product" data-v="all" aria-pressed="${C.product === "all"}">All<span class="count">${C.choices.length}</span></button>`]
      .concat(prods.map((p) => `<button class="chip" type="button" data-act="cin-product" data-v="${esc(p.name)}" aria-pressed="${C.product === p.name}">${esc(p.name)}<span class="count">${p.count}</span></button>`)).join("");
    const seg = `<div class="seg" role="group" aria-label="Sort"><button type="button" data-act="cin-sort" data-v="best" aria-pressed="${C.sort === "best"}">Best cuts</button><button type="button" data-act="cin-sort" data-v="new" aria-pressed="${C.sort === "new"}">Newest</button></div>`;
    const rows = list.map((c) => {
      const sub = [R.clock(c.seconds), c.en && c.ar ? "EN + AR" : c.ar ? "Arabic" : "", c.product].filter(Boolean).join(" · "); // plain English is the default
      const on = c.members.some((m) => live.has(m.id));
      return `<div class="row cin-row" data-act="cin-open" data-key="${esc(c.key)}" role="button" tabindex="0" aria-label="${esc(c.title)}${c.best != null ? `, best cuts ${c.best}` : ", not ranked"}">
        ${poster(c.main)}<div class="main">${on ? `<span class="st up"><i></i>On the portfolio</span>` : ""}<div class="name" dir="auto">${esc(c.title)}</div><div class="sub">${esc(sub)}</div></div>${meter(c)}</div>`;
    }).join("");
    const noTool = !backup && !tools().rank ? note("alert", "The film library has no cut ranker yet, so films can't be ranked from here.") : "";
    return wrapSection("cin-films", "Films", `${C.choices.length} films · ${rankedCount} ranked`, rankAll,
      `<div class="cin-tools">${seg}</div><div class="chips cin-chips">${chips}</div>${noTool}<div class="rows cin-list">${rows || `<div class="row"><div class="main sub">No films here.</div></div>`}</div>`);
  }

  function worldsSection() {
    const worlds = C.data.worlds || [];
    if (!worlds.length) return "";
    const now = ["en", "ar"].map((l) => R.leadInfo(l, C.data)?.id);
    const rows = worlds.map((w) => {
      const id = w.id.replace(/^site:/, "");
      const on = now.every((x) => x === id);
      const act = on ? `<span class="st up"><i></i>On now</span>` : backup ? greyBtn("cinema", "Use as home", "btn sm ghost")
        : `<button class="btn sm ghost" type="button" data-act="cin-world" data-v="${esc(w.id)}"${C.job?.running ? " disabled" : ""}>Use as home</button>`;
      return `<div class="row cin-world"><span class="cin-poster world">${g("globe")}</span><div class="main"><div class="name">${esc(w.name)}</div><div class="sub">Built into the portfolio, no film</div></div><div class="end">${act}</div></div>`;
    }).join("");
    return wrapSection("cin-worlds", "Site worlds", "go back to a built-in home", "", `<div class="rows">${rows}</div>`);
  }

  // ---------- one film ----------
  const member = () => { const c = choiceOf(C.sheet.key); return c && (C.sheet.which === "ar" ? c.ar : c.en) || c?.main; };
  const payload = (id) => C.sheet?.film[id];

  async function loadFilm(id) {
    try {
      const f = await api(`/api/cinema/film?id=${encodeURIComponent(id)}`);
      C.sheet.film[id] = f;
      C.sheet.sel[id] ||= [...f.selected];
      C.sheet.labels[id] ||= { ...f.labels };
      C.sheet.copy[id] ||= { name: f.copy?.name || "", line: f.copy?.line || "" };
    } catch (e) {
      const row = (C.data.films || []).find((x) => x.id === id);
      C.sheet.film[id] = { summaryOnly: true, ranked: !!row?.cuts?.ranked, chapters: [], cuts: [], error: e.message };
    }
  }
  async function openSheet(key) {
    const c = choiceOf(key);
    if (!c) return;
    C.sheet = { key, which: c.en ? "en" : "ar", film: {}, sel: {}, labels: {}, copy: {}, sound: false, loading: true };
    openPanel(sheetHtml());
    wirePanel();
    await Promise.all(c.members.map((m) => loadFilm(m.id)));
    if (C.sheet?.key !== key) return;
    C.sheet.loading = false;
    paintSheet();
  }
  function paintSheet() {
    const panel = $("#panel");
    if (!C.sheet || !panel || panel.hidden || !$(".cin-sheet", panel)) return; // (not "on": openPanel adds that a frame later)
    panel.innerHTML = `<div class="grab" aria-hidden="true"></div>${sheetHtml()}`;
    wirePanel();
  }
  function wirePanel() {
    const panel = $("#panel");
    if (panel && !panel._cinErr) { panel._cinErr = true; panel.addEventListener("error", (e) => e.target.classList?.add("broken"), true); }
    if (panel && !panel._cinIn) {
      panel._cinIn = true;
      panel.addEventListener("input", (e) => {
        const el = e.target, key = el?.dataset?.copy;
        if (!key || !C.sheet) return;
        (C.sheet.copy[el.dataset.film] ||= { name: "", line: "" })[key] = el.value;
        const f = payload(el.dataset.film), slot = $(".cin-clash", panel);
        if (key === "name" && f && slot) slot.innerHTML = clashHtml(f);
      });
      panel.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target?.dataset?.copy) e.target.blur(); });
    }
  }

  function chaptersHtml(f) {
    if (!f.chapters.length) return f.ranked ? "" : note("film", "Rank this film to see what each part is about and how good it is.");
    const best = (id) => f.cuts.filter((c) => c.chapter === id).sort((a, b) => b.score - a.score)[0];
    const rows = f.chapters.map((ch, i) => {
      const play = !f.summaryOnly && f.video && best(ch.id);
      const score = ch.best == null ? "" : `<span class="cin-meter sm" role="img" aria-label="Best cut ${ch.best} out of 100"><b class="num">${ch.best}</b><i><s style="width:${Math.max(2, ch.best)}%"></s></i></span>`;
      return `<div class="cin-ch"${play ? ` data-act="cin-chapter" data-ch="${esc(ch.id)}" role="button" tabindex="0"` : ""}>
        <span class="cin-no num">${String(i + 1).padStart(2, "0")}</span><span class="cin-ch-t" dir="auto">${esc(ch.title)}</span><span class="cin-ch-time num">${esc(R.clock(ch.start))}</span>${score}</div>`;
    }).join("");
    const again = !f.ranked ? "" : backup ? greyBtn("cinema", "Rank again", "link-btn") : tools().rank ? `<button class="link-btn" type="button" data-act="cin-rank" data-film="${esc(f.id)}" data-force="1"${C.job?.running ? " disabled" : ""}>Rank again</button>` : "";
    return wrapSection("cin-backlog", "What it’s about", `${f.chapters.length} parts`, again, `<div class="cin-chapters">${rows}</div>`);
  }
  function cutsHtml(f) {
    if (!f.ranked || !f.cuts.length) return "";
    const sel = C.sheet.sel[f.id] || f.selected;
    const labels = C.sheet.labels[f.id] || {};
    const rows = f.cuts.map((c) => {
      const on = sel.includes(c.id);
      const label = labels[c.id] || c.label || "Cut";
      const chap = c.chapterNo ? ` · part ${String(c.chapterNo).padStart(2, "0")}` : "";
      return `<div class="cin-cut" data-cut="${esc(c.id)}" data-on="${on}">
        <div class="cin-pic">${c.thumb ? `<img src="${esc(c.thumb)}" alt="" loading="lazy" decoding="async">` : ""}
          <button class="cin-play" type="button" data-act="cin-play" data-cut="${esc(c.id)}" aria-label="Watch ${esc(R.span(c.start, c.end))}"${f.video && !backup ? "" : " disabled"}>${g("play")}</button>
          <span class="cin-time num">${esc(R.clock(c.start))}</span>
          <button class="cin-tick" type="button" role="checkbox" aria-checked="${on}" data-act="cin-tick" data-cut="${esc(c.id)}" aria-label="Feature ${esc(label)}">${g("tick")}</button></div>
        <div class="cin-cut-main"><div class="cin-label"><span class="cin-label-text" dir="auto">${esc(label)}</span><button class="icon-btn cin-edit" type="button" data-act="cin-rename" data-cut="${esc(c.id)}" aria-label="Rename ${esc(label)}">${g("pencil")}</button></div>
          <div class="cin-cut-meta num">${esc(R.span(c.start, c.end))}${esc(chap)}</div>
          ${c.why.length ? `<div class="cin-why">${c.why.map((w) => `<span class="pill">${esc(w)}</span>`).join("")}</div>` : ""}</div>
        <span class="cin-meter" role="img" aria-label="Score ${c.score} out of 100"><b class="num">${c.score}</b><i><s style="width:${Math.max(2, c.score)}%"></s></i></span></div>`;
    }).join("");
    return wrapSection("cin-cutlist", "Best cuts", "", `<span class="meta cin-picked num">${sel.length} of ${R.MAX_CUTS} picked</span>`,
      `<p class="cin-hint">Tap a picture to watch it. Tick up to ${R.MAX_CUTS} to put on the home.</p><div class="cin-cuts">${rows}</div>`);
  }

  // What the home calls this film. Empty boxes mean the defaults (the name from the title, no line).
  function clashHtml(f) {
    const cp = C.sheet.copy[f.id] || {};
    const w = R.nameClash(R.cleanCopy(cp.name, R.COPY_LIMITS.name) || R.publicName(f.title), C.data.worlds);
    return w ? `${g("alert")}<span>The home already has a “${esc(w.title || w.name)}” world. Give this film its own name so the two don't look alike.</span>` : "";
  }
  function copyHtml(f) {
    if (backup || f.summaryOnly || !f.ranked) return "";
    const c = choiceOf(C.sheet.key), cp = C.sheet.copy[f.id] || { name: "", line: "" };
    const where = c.en && c.ar ? `Name on the ${f.lang === "ar" ? "Arabic" : "English"} home` : "Name on the home";
    const field = (key, label, hold) => `<label class="cin-field"><span>${label}</span><input class="cin-input" type="text" data-copy="${key}" data-film="${esc(f.id)}" maxlength="${R.COPY_LIMITS[key]}" dir="auto" autocomplete="off" enterkeyhint="done" value="${esc(cp[key])}" placeholder="${esc(hold)}"></label>`;
    return wrapSection("cin-copy", where, "", "", `<p class="cin-hint">How this film reads on the home. Leave a box empty to use the default.</p>
      <div class="cin-fields">${field("name", "Public name", R.publicName(f.title))}${field("line", "One line", "Optional, shown under the name")}</div>
      <p class="cin-bar-note cin-clash" aria-live="polite">${clashHtml(f)}</p>`);
  }

  function barHtml() {
    const s = C.sheet, c = choiceOf(s.key), m = member(), f = payload(m.id);
    const j = C.job;
    const mine = j?.kind && (j.running || j.started === C.seen) && j.started !== C.dismissed && (j.film === "all" || c.members.some((x) => x.id === j.film));
    if (mine) {
      const rows = R.stepRows(j).map((r) => `<li class="st ${{ done: "up", now: "starting", todo: "", fail: "down" }[r.state]}"><i></i>${esc(r.label)}</li>`).join("");
      const tail = j.running ? "" : j.ok ? `<p class="cin-bar-note ok">${j.kind === "rank" ? "Cuts ranked." : "It is live on your portfolio."}</p>`
        : `<p class="cin-bar-note bad">${esc(j.error || "It stopped.")}</p><button class="btn wide" type="button" data-act="cin-dismiss">Try again</button>`;
      return `<ol class="cin-steps" aria-live="polite">${rows}</ol>${tail}`;
    }
    const busy = j?.running;
    const wait = busy ? `<p class="cin-bar-note">Busy: ${esc(j.kind === "rank" ? "ranking" : "publishing")} ${esc(j.film === "all" ? "all films" : R.publicName(j.title || ""))}. Try again when it's done.</p>` : "";
    const lead = R.leadFor(c);
    const twins = [...new Set(Object.values(lead))].map((id) => payload(id));
    const twinUnranked = twins.some((t) => t && !t.ranked);
    const old = f?.outdated ? `<p class="cin-bar-note">${g("alert")}<span>This film changed since it was ranked. <button class="link-btn" type="button" data-act="cin-rank" data-film="${esc(m.id)}" data-force="1"${busy || !tools().rank ? " disabled" : ""}>Rank again</button></span></p>` : "";
    if (backup) return `${greyBtn("cinema", `${g("film")}Feature on the portfolio`, "btn primary wide")}<p class="cin-bar-note">The backlog, previews and publishing live on your PC.</p>`;
    if (!f || s.loading) return `<div class="skeleton" style="height:48px"></div>`;
    if (!f.ranked) {
      return `<button class="btn primary wide" type="button" data-act="cin-rank" data-film="${esc(m.id)}"${busy || !tools().rank ? " disabled" : ""}>${g("sparkles")}Rank cuts</button>
        <p class="cin-bar-note">${tools().rank ? "Finds the best 5-second cuts of this film. It takes a few seconds." : "The film library has no cut ranker yet."}</p>${wait}`;
    }
    const isLive = ["en", "ar"].some((l) => R.leadInfo(l, C.data)?.id === m.id);
    const why = twinUnranked ? `<p class="cin-bar-note">${g("alert")}The other language isn't ranked yet. Switch to it and rank it first.</p>` : "";
    const block = twinUnranked ? "" : R.featureBlock(lead, (id) => s.sel[id] || payload(id)?.selected || [], m.id); // no tick, nothing to publish
    return `${old}<button class="btn primary wide" type="button" data-act="cin-feature"${busy || twinUnranked || block || !tools().publish ? " disabled" : ""}>${g("film")}${isLive ? "Update the portfolio" : "Feature on the portfolio"}</button>
      <p class="cin-bar-note">${block ? `${g("alert")}<span>${esc(block)}</span>` : "Its cuts and the full film become public on your portfolio."}</p>${why}${wait}`;
  }
  const paintBar = () => { const slot = $(".cin-bar-slot"); if (slot && C.sheet) slot.innerHTML = barHtml(); };

  function sheetHtml() {
    const s = C.sheet, c = choiceOf(s.key);
    if (!c) return "";
    const m = member(), f = payload(m.id);
    const sub = [R.clock(m.seconds), c.langs, c.product].filter(Boolean).join(" · ");
    const seg = c.en && c.ar ? `<div class="seg cin-lang" role="group" aria-label="Language">${["en", "ar"].map((l) => {
      const mm = l === "en" ? c.en : c.ar;
      return `<button type="button" data-act="cin-lang" data-v="${l}" aria-pressed="${s.which === l}">${l === "en" ? "English" : "Arabic"}${mm.cuts?.best != null ? `<span class="count num">${mm.cuts.best}</span>` : ""}</button>`;
    }).join("")}</div>` : "";
    let body;
    if (!f || s.loading) body = `<div class="skeleton" style="height:240px"></div>`;
    else {
      const player = f.video && !backup ? `<div class="cin-player" hidden><video playsinline muted preload="metadata" aria-label="Preview of the cut"></video>
        <div class="cin-player-bar"><span class="cin-player-t"></span><button class="icon-btn" type="button" data-act="cin-mute" aria-label="Sound" aria-pressed="${!!s.sound}">${g(s.sound ? "volume" : "volume-x")}</button><button class="icon-btn" type="button" data-act="cin-player-close" aria-label="Close the preview">${g("x")}</button></div></div>` : "";
      const gone = f.summaryOnly ? note("monitor", `<b>On your PC.</b> The backlog and the previews come from the film library, which is on your PC.`) : "";
      body = `${player}${gone}${chaptersHtml(f)}${cutsHtml(f)}${copyHtml(f)}`;
    }
    return `<div class="panel-head cin-head">${poster(m, "lg")}<div class="main"><h2 dir="auto">${esc(c.title)}</h2><div class="about">${esc(sub)}${c.best != null ? ` · best cuts ${c.best}` : ""}</div></div>
      <button class="icon-btn" data-act="close" aria-label="Close">${g("x")}</button></div>
      <div class="panel-body cin-sheet">${seg}${body}<div class="cin-bar"><div class="cin-bar-slot">${barHtml()}</div></div></div>`;
  }

  // ---------- watching a cut ----------
  // muted unless he turned the sound on; if the browser still refuses, the film's own controls appear
  const playCut = (v, src, start, end) => R.playWindow(v, src, start, end, { muted: !C.sheet?.sound, onBlocked: () => { v.controls = true; } });
  function preview(cutId) {
    const m = member(), f = payload(m.id);
    const cut = f?.cuts.find((x) => x.id === cutId);
    const wrap = $(".cin-player"), v = wrap && $("video", wrap);
    if (!cut || !v || !f.video) return;
    wrap.hidden = false;
    playCut(v, f.video, cut.start, cut.end); // straight from the tap: an iPhone refuses play() from anywhere else
    if (!v._tap) { v._tap = true; v.addEventListener("click", () => { if (v.paused) playCut(v, v._src, v._start, v._end); else v.pause(); }); }
    const label = (C.sheet.labels[f.id] || {})[cut.id] || cut.label;
    $(".cin-player-t", wrap).textContent = `${label} · ${R.span(cut.start, cut.end)}`;
    $$(".cin-cut").forEach((r) => r.classList.toggle("playing", r.dataset.cut === cut.id));
    wrap.scrollIntoView({ block: "nearest" });
  }

  function tick(el) {
    const m = member(), f = payload(m.id);
    const id = el.dataset.cut;
    const sel = C.sheet.sel[f.id] || (C.sheet.sel[f.id] = [...f.selected]);
    if (!R.canTick(sel, id)) { toast(`You can feature up to ${R.MAX_CUTS} cuts.`); return; }
    const next = R.toggle(sel, id);
    C.sheet.sel[f.id] = next;
    const on = next.includes(id);
    el.setAttribute("aria-checked", String(on));
    el.closest(".cin-cut").dataset.on = String(on);
    const n = $(".cin-picked");
    if (n) n.textContent = `${next.length} of ${R.MAX_CUTS} picked`;
    paintBar();
  }

  function rename(el) {
    const row = el.closest(".cin-cut"), span = $(".cin-label-text", row);
    if (!span || $(".cin-rename", row)) return;
    const m = member(), f = payload(m.id), id = row.dataset.cut;
    const input = document.createElement("input");
    input.className = "cin-rename"; input.type = "text"; input.maxLength = 60; input.value = span.textContent; input.dir = "auto";
    input.setAttribute("aria-label", "Label for this cut");
    span.replaceWith(input);
    input.focus(); input.select();
    let finished = false;
    const done = (save) => {
      if (finished) return;
      finished = true;
      const labels = (C.sheet.labels[f.id] ||= {});
      const base = f.cuts.find((c) => c.id === id)?.label || "Cut";
      let text = save ? input.value.replace(/\s+/g, " ").trim().slice(0, 60) : (labels[id] || base);
      if (save) { if (!text || text === base) { delete labels[id]; text = base; } else labels[id] = text; }
      const out = document.createElement("span");
      out.className = "cin-label-text"; out.dir = "auto"; out.textContent = text;
      input.replaceWith(out);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); done(true); }
      else if (e.key === "Escape") { e.stopPropagation(); done(false); }
    });
    input.addEventListener("blur", () => done(true));
  }

  // ---------- doing things ----------
  function pickBody(c) {
    const lead = R.leadFor(c);
    const cuts = {}, labels = {}, ids = [];
    for (const id of new Set(Object.values(lead))) {
      const f = payload(id);
      if (!f?.ranked) continue;
      cuts[id] = R.inFilmOrder(C.sheet.sel[id] || f.selected, f.cuts);
      labels[id] = C.sheet.labels[id] || {};
      ids.push(id);
    }
    return { lead, cuts, labels, copy: R.copyBody(ids, C.sheet.copy) };
  }
  async function startJob(path, body, started) {
    try {
      const r = await post(path, body);
      C.job = r.job; C.seen = r.job.started; C.dismissed = 0;
      toast(started);
      watch(); paintJob(); paintBar();
      $$('[data-act="cin-rank-all"], [data-act="cin-world"]').forEach((b) => { b.disabled = true; });
    } catch (e) { toast(e.message); }
  }

  function watch() { if (!C.timer) C.timer = setInterval(poll, 1200); }
  function stop() { clearInterval(C.timer); C.timer = null; }
  async function poll() {
    let j;
    try { j = await api("/api/cinema/job"); } catch { return; }
    C.job = j;
    if (j.running) C.seen = j.started;
    paintJob(); paintBar();
    if (j.running) return;
    stop();
    if (C.seen === j.started && C.finished !== j.started) {
      C.finished = j.started;
      await afterJob(j);
    }
  }
  async function afterJob(j) {
    C.at = 0;
    await load(false);
    if (C.sheet && $(".cin-sheet")) {
      const c = choiceOf(C.sheet.key);
      if (c) {
        for (const m of c.members) { if (j.kind === "rank") { delete C.sheet.sel[m.id]; delete C.sheet.labels[m.id]; } await loadFilm(m.id); }
        paintSheet();
      }
    }
    toast(j.ok ? (j.kind === "rank" ? "Cuts ranked" : "Live on your portfolio") : (j.error || "That didn't work"));
  }

  async function load(quiet) {
    if (C.loading) return;
    C.loading = true;
    try {
      const data = await api("/api/cinema");
      const sig = JSON.stringify(data);
      const changed = sig !== C.sig;
      C.sig = sig; C.data = data; C.choices = R.pairFilms(data.films || []); C.at = Date.now(); C.error = "";
      if (data.job) { C.job = data.job; if (data.job.running) C.seen = data.job.started; }
      if (changed || !quiet) redraw();
    } catch (e) {
      C.error = e.message;
      if (!C.data) redraw();
    } finally { C.loading = false; }
  }

  function act(name, el) {
    switch (name) {
      case "cin-sort": C.sort = el.dataset.v; localSet("cinemaSort", C.sort); redraw(); break;
      case "cin-product": C.product = el.dataset.v; localSet("cinemaProduct", C.product); redraw(); break;
      case "cin-open": openSheet(el.dataset.key); break;
      case "cin-lang": C.sheet.which = el.dataset.v; paintSheet(); break;
      case "cin-play": preview(el.dataset.cut); break;
      case "cin-chapter": {
        const f = payload(member().id);
        const top = f.cuts.filter((c) => c.chapter === el.dataset.ch).sort((a, b) => b.score - a.score)[0];
        if (top) preview(top.id);
        break;
      }
      case "cin-tick": tick(el); break;
      case "cin-rename": rename(el); break;
      case "cin-player-close": { const w = $(".cin-player"); if (w) { $("video", w)?.pause(); w.hidden = true; } break; }
      case "cin-mute": {
        const v = $(".cin-player video");
        if (v) { v.muted = !v.muted; C.sheet.sound = !v.muted; el.setAttribute("aria-pressed", String(C.sheet.sound)); el.innerHTML = g(C.sheet.sound ? "volume" : "volume-x"); }
        break;
      }
      case "cin-feature": startJob("/api/cinema/publish", pickBody(choiceOf(C.sheet.key)), "Publishing to your portfolio"); break;
      case "cin-world": startJob("/api/cinema/publish", { lead: { en: el.dataset.v, ar: el.dataset.v } }, "Changing your portfolio home"); break;
      case "cin-rank": startJob("/api/cinema/rank", { id: el.dataset.film, force: el.dataset.force === "1" }, "Finding the best cuts"); break;
      case "cin-rank-all": startJob("/api/cinema/rank", { all: true }, "Ranking the films"); break;
      case "cin-dismiss": C.dismissed = C.job?.started || 0; paintJob(); paintBar(); break;
      default: break;
    }
  }

  function mount() {
    const root = $("[data-cin-root]");
    if (root) root.addEventListener("error", (e) => e.target.classList?.add("broken"), true); // a picture that can't load just hides
    if (!C.data || Date.now() - C.at > 30000) load(!!C.data);
    if (C.job?.running) watch();
    if (C.data?.available) {
      const first = R.leadInfo("en", C.data) || R.leadInfo("ar", C.data);
      document.documentElement.style.setProperty("--glow", C.data.program?.copy?.[first?.id]?.accent || "#ffb340"); // the featured film lights the room
    }
  }
  function unmount() { stop(); }

  return { render, mount, unmount, act, load };
}
