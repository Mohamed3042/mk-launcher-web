// Reels: MK News as full-screen stories and real short videos you swipe through, watch and listen to.
// One story per screen: its real picture (or its source's logo on a tinted card, or the MK News artwork), a big
// headline, one line on why it matters, up to three short points. A clip plays the video itself (YouTube's
// privacy-enhanced embed, muted until he taps for sound; only the reel on screen has a player). Data comes from
// /api/reels; shared choices from the server, voice from the device. The launcher (#/reels) and MK News
// (news/#/reels) both run this module: d.place says which page it is in, d.ask lets MK News open its own sheet.
import { view as storyView, KIND_LABEL, artUrl, promptFor, claudeUrl, ago, setMyWork } from "./news/story.js";
import { devicePrefs, readingMs, speechTimeoutMs, openIndex, cssUrl, playerSrc, ytCommand, PLAYER_ORIGIN } from "./reels-prefs.js";
import { BACKUP, REASON } from "./source.js";

const TOPIC = { "claude-code": "Claude Code", anthropic: "Anthropic", models: "Models", prices: "Prices", voice: "Voice",
  video: "Video", agents: "Agents", engineering: "Engineering", "free-apis": "Free & open" };
const CACHE = "mkl.reels.cache";
const SEEN_AFTER = 3000;
const reduced = matchMedia("(prefers-reduced-motion: reduce)");

export function createReels(d) {
  const { $, $$, esc, g, api, post, toast, copy, openPanel, closePanel } = d;
  const inNews = d.place === "news";
  const newsLink = inNews ? "#/home" : "news/";
  const settingsLink = "#/settings";
  const device = devicePrefs(globalThis.localStorage);
  const R = {
    data: readCache(), saved: [], activeId: null, active: -1, paused: false, speaking: false, utter: null,
    timer: null, tLeft: 0, tStart: 0, seenTimer: null, queue: new Set(), flushTimer: null, observer: null,
    mounted: false, opened: false, polls: 0, pollTimer: null, wheelAt: 0, glowOn: 0, askMode: "help", askIdea: "", ask: null,
    sound: false,
  };

  function readCache() { try { return JSON.parse(localStorage.getItem(CACHE) || "null"); } catch { return null; } }
  function writeCache(p) { try { localStorage.setItem(CACHE, JSON.stringify(p)); } catch { /* full or private */ } }
  setMyWork(R.data?.my_work);
  const items = () => R.data?.items || [];
  const settings = () => R.data?.settings || { auto_advance: true, pace: "normal", resume: true, topics_off: [] };
  const cur = () => items()[R.active] || null;
  const seenSet = () => new Set(R.data?.seen || []);
  const plainSaved = (id) => R.saved.find((e) => e.item?.id === id && !e.idea);

  // ---------- what a reel says ----------
  function kindLabel(r) {
    if (r.kind === "clip") return "Video";
    if (r.kind === "repo") return "Trending repo";
    if (r.kind === "status") return "Claude status";
    if (r.kind !== "article") return KIND_LABEL[r.kind] || "News";
    const t = (r.tags || []).find((x) => TOPIC[x]);
    return t ? TOPIC[t] : "News";
  }
  function sourceOf(r) {
    if (r.kind === "repo") return "GitHub";
    if (r.kind === "release" && String(r.source_name).includes("/")) return String(r.source_name).split("/")[0];
    return r.source_name || "";
  }
  const titleOf = (r) => storyView(r).title || r.title || "";
  function titleHtml(r) {
    const t = titleOf(r);
    if (r.kind === "repo" && t.includes("/")) {
      const [owner, ...rest] = t.split("/");
      return `<span class="owner">${esc(owner)}/</span>${esc(rest.join("/"))}`;
    }
    return esc(t);
  }
  const sizeOf = (t) => (t.length > 110 ? "t-s" : t.length > 64 ? "t-m" : "t-l");
  const bgOf = (r) => r.image || r.logo || artUrl(r.art || "default");
  function factHtml(f) {
    const mark = f.label === "Now" ? `<i class="mark ${f.value === "Ongoing" ? "down" : "up"}" aria-hidden="true"></i>` : "";
    return `<li>${mark}<span>${esc(f.label)}</span><b class="num">${esc(f.value)}</b></li>`;
  }
  function copyHtml(r, i) {
    const t = titleOf(r);
    return `<h2 class="reel-title ${sizeOf(t)}" id="rh-${i}" dir="auto">${titleHtml(r)}</h2>
      ${r.why ? `<p class="reel-why" dir="auto"><span class="lbl">${g("lightbulb")}Why it matters to you</span><span class="txt">${esc(r.why)}</span></p>` : ""}
      ${r.gist?.length ? `<ul class="reel-gist">${r.gist.slice(0, 3).map((p) => `<li dir="auto">${esc(p)}</li>`).join("")}</ul>` : ""}
      ${r.facts?.length ? `<ul class="reel-facts" aria-label="Facts">${r.facts.map(factHtml).join("")}</ul>` : ""}`;
  }
  // The picture, in order: the story's own (or the clip's thumbnail), its source's logo on a tinted card, the artwork.
  // The artwork is an <img> in the markup, so it never waits for a script (an art reel used to stay black on the
  // iPhone); pictures from the web load lazily around the reel on screen and fall back to the artwork if they fail.
  function mediaHtml(r) {
    const art = esc(artUrl(r.art || "default"));
    if (r.image) return `<img class="reel-art blur" data-src="${esc(r.image)}" data-art="${art}" alt="" referrerpolicy="no-referrer" decoding="async">`;
    if (r.logo) return `<div class="reel-tint"></div><img class="reel-art" data-art="${art}" alt="" hidden>`;
    return `<img class="reel-art" src="${art}" data-art="${art}" alt="" decoding="async">`;
  }
  const isClip = (r) => r.kind === "clip" && /^[A-Za-z0-9_-]{11}$/.test(r.video || "");
  function frontHtml(r) {
    if (isClip(r)) {
      return `<div class="reel-video" data-video="${esc(r.video)}" aria-hidden="true">${r.image ? `<img class="poster" data-src="${esc(r.image)}" alt="" referrerpolicy="no-referrer" decoding="async">` : ""}</div>`;
    }
    if (r.image) return `<div class="reel-photo" aria-hidden="true"><img data-src="${esc(r.image)}" alt="" referrerpolicy="no-referrer" decoding="async"></div>`;
    if (r.logo) return `<div class="reel-photo logo" aria-hidden="true"><span class="reel-logo"><img data-src="${esc(r.logo)}" alt="" referrerpolicy="no-referrer" decoding="async"></span></div>`;
    return "";
  }
  function reelHtml(r, i, n) {
    const clip = isClip(r);
    const cls = clip ? " clip" : r.image ? " has-photo" : r.logo ? " has-logo" : "";
    return `<article class="reel${cls}" data-i="${i}" data-id="${esc(r.id)}" aria-posinset="${i + 1}" aria-setsize="${n}" aria-labelledby="rh-${i}" tabindex="-1">
      <div class="reel-media" aria-hidden="true">${mediaHtml(r)}</div>
      ${clip ? frontHtml(r) : ""}<div class="reel-shade" aria-hidden="true"></div>${clip ? "" : frontHtml(r)}
      ${clip ? `<button class="reel-sound" type="button" data-act="reel-sound" aria-pressed="false">${g("volume-x")}<span>Tap for sound</span></button>` : ""}
      <div class="reel-progress" aria-hidden="true"><i></i></div>
      <header class="reel-top"><span class="src" dir="auto">${esc(sourceOf(r))}</span><span class="kind">${esc(kindLabel(r))}</span>
        <span class="age">${esc(ago(r.published))}</span><span class="grow"></span><span class="count num">${i + 1} / ${n}</span></header>
      <div class="reel-copy">${copyHtml(r, i)}</div>
    </article>`;
  }
  function caughtHtml(n) {
    return `<section class="reel caught" data-i="${n}" data-id="" aria-label="You're all caught up" tabindex="-1">
      <div class="reel-media" aria-hidden="true"><img class="reel-art" src="${esc(artUrl("default"))}" alt=""></div>
      <div class="reel-shade" aria-hidden="true"></div>
      <div class="caught-body">${g("check", "big")}<h2>You're all caught up</h2>
        <p>That's every reel and clip for now. New stories land through the day.</p>
        <div class="btns"><button class="btn primary" data-act="reel-restart">${g("rotate-ccw")}Start over</button>
        <a class="btn" href="${newsLink}">${g("news")}${inNews ? "Back to the news" : "Open MK News"}</a></div>
        <a class="link-btn" href="${settingsLink}">Change topics</a></div>
    </section>`;
  }
  function emptyHtml() {
    const why = BACKUP && R.data?.news === false ? "The last snapshot from your PC had no MK News stories."
      : R.data?.news === false ? "MK News isn't running on the PC, so there are no stories to show yet."
      : (settings().topics_off || []).length ? "No stories in the topics you have on. Switch more topics on in Settings."
      : "No stories yet. MK News checks its sources every half hour.";
    return `<section class="reel caught" data-i="0" data-id="" tabindex="-1">
      <div class="reel-media" aria-hidden="true"><img class="reel-art" src="${esc(artUrl("default"))}" alt=""></div><div class="reel-shade" aria-hidden="true"></div>
      <div class="caught-body">${g("news", "big")}<h2>Nothing to watch yet</h2><p>${esc(why)}</p>
        <div class="btns">${BACKUP ? `<button class="btn primary needs-pc" type="button" data-act="needs-pc" data-why="news" aria-disabled="true">${g("refresh")}Check for news</button>` : `<button class="btn primary" data-act="reel-refresh">${g("refresh")}Check for news</button>`}<a class="btn" href="${settingsLink}">${g("settings")}Settings</a></div></div></section>`;
  }
  function railHtml() {
    const b = (act, icon, label) => `<button class="rb" type="button" data-act="${act}">${g(icon)}<span>${label}</span></button>`;
    return `<div class="reel-rail" role="group" aria-label="Reel actions">
      <a class="rb" id="reel-open" href="#" target="_blank" rel="noopener">${g("external")}<span>Open</span></a>
      ${BACKUP ? `<button class="rb needs-pc" type="button" data-act="needs-pc" data-why="save" aria-disabled="true">${g("bookmark")}<span>Save</span></button>` : b("reel-save", "bookmark", "Save")}${b("reel-ask", "sparkles", "Ask Claude")}${b("reel-listen", "volume", "Listen")}${b("reel-copy", "link", "Copy link")}</div>`;
  }

  // ---------- the page ----------
  function render() {
    const list = items();
    const body = !R.data ? `<article class="reel loading" data-i="0" data-id=""><div class="reel-media skeleton"></div></article>`
      : list.length ? list.map((r, i) => reelHtml(r, i, list.length)).join("") + caughtHtml(list.length) : emptyHtml();
    return `<div class="reels-stage" id="reels">
      <div class="reels-glow" aria-hidden="true"><i></i><i></i></div>
      <div class="reels-col">
        <div class="reels-track" role="feed" aria-label="Reels from MK News" aria-busy="${!R.data}" tabindex="0">${body}</div>
        ${railHtml()}
        <div class="reel-flash" aria-hidden="true"></div>
        <div class="reel-state" aria-hidden="true"></div>
      </div>
      <div class="reel-nav" role="group" aria-label="Move between reels">
        <button class="icon-btn" type="button" data-act="reel-prev" aria-label="Previous reel" title="Previous (Up arrow)">${g("chevron-up")}</button>
        <button class="icon-btn" type="button" data-act="reel-next" aria-label="Next reel" title="Next (Down arrow)">${g("chevron-down")}</button></div>
      <p class="sr" aria-live="polite" id="reel-live"></p>
    </div>`;
  }

  function mount(fetchList = true) {
    unmount(true);
    R.mounted = true;
    document.documentElement.classList.add("route-reels");
    const track = $(".reels-track");
    if (!track) return;
    R.observer = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting && e.intersectionRatio >= 0.6) setActive(Number(e.target.dataset.i));
    }, { root: track, threshold: [0.6] });
    $$(".reels-track > .reel").forEach((el) => R.observer.observe(el));
    track.addEventListener("click", onTap);
    track.addEventListener("error", onMediaError, true);
    $("#reels").addEventListener("wheel", onWheel, { passive: false });
    $("#reel-open").addEventListener("click", () => { const r = cur(); if (r) markSeen(r.id); });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("message", onPlayer);
    if (R.data) openAt(startIndex(), true);
    const moved = () => { R.moved = true; };
    track.addEventListener("touchstart", moved, { passive: true });
    track.addEventListener("wheel", moved, { passive: true });
    if (fetchList) {
      R.polls = 0;
      R.moved = false; // a new visit: the shared seen list decides where it opens
      api("/api/news/saved").then((s) => { R.saved = s.items || []; paintRail(); }).catch(() => {});
      load();
    }
  }

  function unmount(keepRoute = false) {
    if (!R.mounted) return;
    R.mounted = false;
    stopSpeech();
    clearTimeout(R.timer); R.timer = null;
    clearTimeout(R.seenTimer); clearTimeout(R.pollTimer);
    R.observer?.disconnect(); R.observer = null;
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("message", onPlayer);
    stopVideo();
    flushSeen();
    R.active = -1;
    if (!keepRoute) document.documentElement.classList.remove("route-reels");
  }

  function startIndex() {
    return openIndex({ items: items(), seen: R.data?.seen || [], resume: settings().resume, activeId: R.activeId, moved: R.moved });
  }

  function openAt(i, instant = false) {
    const el = $(`.reels-track > [data-i="${i}"]`);
    if (!el) return;
    hydrate(i);
    el.scrollIntoView({ block: "start", behavior: instant || reduced.matches ? "auto" : "smooth" });
    if (instant) setActive(i);
  }

  async function load() {
    try {
      const p = await api("/api/reels");
      setMyWork(p.my_work);
      const before = items().map((r) => r.id).join();
      const hadData = !!R.data;
      R.data = p;
      writeCache(p);
      if (!R.mounted) return;
      if (!hadData || before !== p.items.map((r) => r.id).join()) {
        remount(); // the list changed: draw it again, at the same story if it is still there
      } else {
        patchLines(p);
        // the cache opened us somewhere; the server's seen list (shared with his other devices) decides
        if (!R.moved) { const i = startIndex(); if (i !== R.active) openAt(i, true); }
      }
      clearTimeout(R.pollTimer);
      if (p.lines?.pending && R.polls < 12) { R.polls++; R.pollTimer = setTimeout(load, 20000); } // the model is still writing
    } catch (e) {
      if (!R.data && R.mounted) { R.data = { items: [], seen: [], settings: settings(), news: false }; remount(); }
    }
  }
  function remount() {
    const keep = R.activeId;
    unmount(true);
    $("#view").innerHTML = render();
    R.activeId = keep;
    mount(false);
  }

  function patchLines(p) {
    for (const [i, r] of p.items.entries()) {
      const el = $(`.reels-track > [data-id="${CSS.escape(r.id)}"] .reel-copy`);
      if (!el) continue;
      const html = copyHtml(r, i);
      if (el.dataset.sig !== html) { el.innerHTML = html; el.dataset.sig = html; }
    }
  }

  // ---------- watching ----------
  function setActive(i) {
    if (i === R.active || !R.mounted) return;
    stopSpeech();
    clearTimeout(R.seenTimer);
    clearTimeout(R.timer); R.timer = null;
    R.active = i;
    R.paused = false;
    const r = cur();
    R.activeId = r?.id || null;
    $$(".reels-track > [data-i]").forEach((el) => el.classList.toggle("active", Number(el.dataset.i) === i));
    hydrate(i);
    glow(i);
    playVideo(i);
    paintRail();
    paintState();
    const live = $("#reel-live");
    if (live) live.textContent = r ? `Reel ${i + 1} of ${items().length}: ${titleOf(r)}` : "You're all caught up";
    if (!r) return;
    R.seenTimer = setTimeout(() => markSeen(r.id), SEEN_AFTER);
    arm();
    if (device.get().readAloud) speak(r, true);
  }

  // Load pictures from the web only around the reel on screen, so the first one paints at once.
  function hydrate(i) {
    for (let j = i - 1; j <= i + 2; j++) {
      const el = $(`.reels-track > [data-i="${j}"]`);
      if (!el) continue;
      for (const img of el.querySelectorAll("img[data-src]")) { img.src = img.dataset.src; img.removeAttribute("data-src"); }
    }
  }

  // ---------- clips: one live player, on the reel on screen ----------
  function playerOf(i = R.active) { return $(`.reels-track > [data-i="${i}"] .reel-video iframe`); }
  function send(func, args = [], frame = playerOf()) {
    try { frame?.contentWindow?.postMessage(ytCommand(func, args), PLAYER_ORIGIN); } catch { /* gone */ }
  }
  function stopVideo(except = -1) {
    for (const f of $$(".reels-track .reel-video iframe")) {
      const reel = f.closest(".reel");
      if (Number(reel?.dataset.i) === except) continue;
      reel?.classList.remove("playing");
      f.remove(); // off screen: no player at all, so nothing plays or loads
    }
  }
  function playVideo(i) {
    stopVideo(i);
    const box = $(`.reels-track > [data-i="${i}"] .reel-video`);
    if (!box || box.querySelector("iframe")) return;
    const src = playerSrc(box.dataset.video, location.origin);
    if (!src) return;
    const f = document.createElement("iframe");
    f.src = src;
    f.title = "Video";
    f.allow = "autoplay; encrypted-media; picture-in-picture";
    f.referrerPolicy = "strict-origin-when-cross-origin";
    f.tabIndex = -1;
    f.addEventListener("load", () => {
      try { f.contentWindow.postMessage(JSON.stringify({ event: "listening", id: box.dataset.video }), PLAYER_ORIGIN); } catch { /* gone */ }
      send("addEventListener", ["onStateChange"], f);
      if (R.sound) { send("unMute", [], f); send("setVolume", [100], f); }
      if (R.paused || document.hidden) send("pauseVideo", [], f);
    });
    box.appendChild(f);
    paintSound();
  }
  // The player says when it really plays: only then the thumbnail gives way (never a black frame).
  function onPlayer(e) {
    if (e.origin !== PLAYER_ORIGIN) return;
    let m;
    try { m = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch { return; }
    const state = m?.event === "onStateChange" ? m.info : m?.event === "infoDelivery" ? m.info?.playerState : undefined;
    if (typeof state !== "number") return;
    const f = playerOf();
    if (!f || e.source !== f.contentWindow) return;
    if (state === 1) f.closest(".reel")?.classList.add("playing");
  }
  function paintSound() {
    const b = $(`.reels-track > [data-i="${R.active}"] .reel-sound`);
    if (!b) return;
    b.setAttribute("aria-pressed", String(R.sound));
    b.innerHTML = `${g(R.sound ? "volume" : "volume-x")}<span>${R.sound ? "Sound on" : "Tap for sound"}</span>`;
  }
  function glow(i) {
    const layers = $$(".reels-glow i");
    if (layers.length < 2) return;
    const r = items()[i];
    const url = r ? bgOf(r) : artUrl("default");
    R.glowOn = 1 - R.glowOn;
    layers[R.glowOn].style.backgroundImage = cssUrl(url);
    layers[R.glowOn].classList.add("on");
    layers[1 - R.glowOn].classList.remove("on");
  }
  // A picture from the web that fails gives way to the artwork; the artwork itself gets one more try, and if
  // that fails too the warm light of .reel-media stays (never a black frame).
  function onMediaError(e) {
    const img = e.target;
    if (img?.tagName !== "IMG") return;
    const reel = img.closest(".reel");
    const art = reel?.querySelector(".reel-art");
    if (img.classList.contains("poster")) { img.remove(); return; } // the player still plays
    if (img === art && !art.classList.contains("blur")) {
      if (!art.dataset.retried) { art.dataset.retried = "1"; setTimeout(() => { art.src = `${art.dataset.art}#again`; }, 1500); }
      else art.hidden = true;
      return;
    }
    reel?.classList.remove("has-photo", "has-logo");
    img.closest(".reel-photo")?.remove();
    reel?.querySelector(".reel-tint")?.remove();
    if (art?.dataset.art) { art.classList.remove("blur"); art.hidden = false; art.src = art.dataset.art; } // the artwork stands in
  }

  // The advance clock: a reading time from the words; it holds while paused or reading aloud.
  function arm() {
    const r = cur();
    clearTimeout(R.timer); R.timer = null;
    if (!r) return;
    R.tLeft = readingMs(r, settings().pace);
    const el = $(`.reels-track > [data-i="${R.active}"]`);
    if (el) {
      el.style.setProperty("--dur", `${R.tLeft}ms`);
      const bar = el.querySelector(".reel-progress i");
      if (bar) { bar.style.animation = "none"; void bar.offsetWidth; bar.style.animation = ""; }
    }
    run();
  }
  function run() {
    clearTimeout(R.timer); R.timer = null;
    if (settings().auto_advance && !R.paused && !R.speaking && cur() && !document.hidden) {
      R.tStart = performance.now();
      R.timer = setTimeout(() => step(1), R.tLeft);
    }
    paintState();
  }
  function hold() {
    if (R.timer) {
      clearTimeout(R.timer); R.timer = null;
      R.tLeft = Math.max(800, R.tLeft - (performance.now() - R.tStart));
    }
    paintState();
  }
  function step(dir) {
    R.moved = true;
    const n = items().length;
    const to = Math.max(0, Math.min(n, (R.active < 0 ? 0 : R.active) + dir));
    if (to !== R.active) openAt(to);
  }
  function togglePause(force) {
    if (!cur()) return;
    R.paused = force ?? !R.paused;
    if (R.paused) { hold(); if (R.speaking) speechSynthesis.pause(); send("pauseVideo"); }
    else { if (R.speaking) speechSynthesis.resume(); send("playVideo"); run(); }
    const f = $(".reel-flash");
    if (f) { f.innerHTML = g(R.paused ? "pause" : "play"); f.classList.remove("on"); void f.offsetWidth; f.classList.add("on"); }
  }
  function paintState() {
    const stage = $("#reels");
    if (!stage) return;
    const auto = settings().auto_advance && !!cur();
    stage.classList.toggle("timed", auto && !R.speaking);
    stage.classList.toggle("held", R.paused || R.speaking || !R.timer);
    const s = $(".reel-state");
    if (s) s.innerHTML = R.paused ? `${g("pause")}<span>Paused</span>` : R.speaking ? `${g("volume")}<span>Reading aloud</span>` : "";
    s?.classList.toggle("on", R.paused || R.speaking);
  }

  // ---------- listening ----------
  function voice() {
    const want = device.get().voice;
    const all = globalThis.speechSynthesis?.getVoices?.() || [];
    return all.find((v) => v.voiceURI === want) || null;
  }
  function speak(r, auto = false) {
    const synth = globalThis.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === "undefined") { if (!auto) toast("This browser can't read aloud"); return; }
    synth.cancel();
    const text = [titleOf(r), r.why ? `Why it matters: ${r.why}` : "", ...(r.gist || [])].filter(Boolean).join(". ").replace(/\.\./g, ".");
    const u = new SpeechSynthesisUtterance(text);
    const v = voice();
    if (v) { u.voice = v; u.lang = v.lang; }
    const done = (ok) => {
      if (R.utter !== u) return;
      clearTimeout(R.speechTimer);
      R.utter = null; R.speaking = false;
      paintRail();
      if (ok && settings().auto_advance && !R.paused && R.mounted) { paintState(); R.timer = setTimeout(() => step(1), 900); }
      else run();
    };
    u.onend = () => done(true);
    u.onerror = () => done(false); // blocked until a first tap, or no voice: fall back to the reading clock
    clearTimeout(R.speechTimer);
    R.speechTimer = setTimeout(() => { if (R.utter === u) { try { synth.cancel(); } catch { /* none */ } done(false); } },
      speechTimeoutMs(r, settings().pace)); // some engines never fire end or error: never stall on them
    R.utter = u; R.speaking = true;
    hold();
    paintRail();
    synth.speak(u);
    if (!auto) markSeen(r.id);
  }
  function stopSpeech() {
    clearTimeout(R.speechTimer);
    if (R.utter) { R.utter = null; try { speechSynthesis.cancel(); } catch { /* none */ } }
    if (R.speaking) { R.speaking = false; paintRail(); }
  }

  // ---------- the action rail ----------
  function paintRail() {
    const r = cur();
    const rail = $(".reel-rail");
    if (!rail) return;
    rail.hidden = !r;
    if (!r) return;
    const open = $("#reel-open");
    open.href = r.url;
    open.setAttribute("aria-label", `Open ${titleOf(r)}`);
    const saved = !!plainSaved(r.id);
    const save = rail.querySelector('[data-act="reel-save"]');
    if (save) save.setAttribute("aria-pressed", String(saved));
    if (save) save.innerHTML = `${g(saved ? "bookmark-check" : "bookmark")}<span>${saved ? "Saved" : "Save"}</span>`;
    const listen = rail.querySelector('[data-act="reel-listen"]');
    listen.setAttribute("aria-pressed", String(R.speaking));
    listen.innerHTML = `${g(R.speaking ? "stop" : "volume")}<span>${R.speaking ? "Stop" : "Listen"}</span>`;
  }

  function markSeen(id) {
    if (!id || seenSet().has(id)) return;
    R.data.seen = [...(R.data.seen || []), id];
    R.queue.add(id);
    clearTimeout(R.flushTimer);
    R.flushTimer = setTimeout(flushSeen, 1200);
  }
  function flushSeen() {
    clearTimeout(R.flushTimer);
    if (!R.queue.size) return;
    const ids = [...R.queue];
    R.queue.clear();
    api("/api/reels/seen", { method: "POST", keepalive: true, body: JSON.stringify({ ids }) }).catch(() => {}); // the backup keeps them on this device
    writeCache(R.data);
  }

  function rawItem(r) { return { id: r.id, title: r.title, url: r.url, source_name: r.source_name, published: r.published, summary: r.summary || "", kind: r.kind }; }
  async function toggleSave(r) {
    const had = plainSaved(r.id);
    try {
      if (had) { await post("/api/news/unsave", { key: had.key }); toast("Removed from Saved"); }
      else { await post("/api/news/save", { item: rawItem(r), mode: "help", idea: "" }); toast("Saved for later and for Claude"); }
      R.saved = (await api("/api/news/saved")).items || [];
    } catch (e) { toast(e.message); }
    paintRail();
  }

  // Ask Claude: the same flow as MK News (same prompt, same For Claude list), in the launcher's own panel.
  function askPrompt() { return promptFor(rawItem(R.ask), R.askMode, R.askMode === "idea" ? R.askIdea : ""); }
  function openAsk(r) {
    if (R.ask?.id !== r.id) { R.askIdea = ""; R.askMode = "help"; }
    R.ask = r;
    togglePause(true);
    markSeen(r.id);
    paintAsk();
  }
  function paintAsk() {
    const r = R.ask, p = askPrompt();
    openPanel(`<div class="panel-head"><span class="ask-art"></span>
      <div class="main"><h2 dir="auto">${esc(titleOf(r))}</h2><div class="about">Claude opens with everything filled in.</div></div>
      <button class="icon-btn" data-act="close" aria-label="Close">${g("x")}</button></div>
      <div class="panel-body ask-body">
        <div class="seg" role="group" aria-label="What do you want">
          <button type="button" data-act="reel-askmode" data-v="help" aria-pressed="${R.askMode === "help"}">${g("help")}Does this help me?</button>
          <button type="button" data-act="reel-askmode" data-v="idea" aria-pressed="${R.askMode === "idea"}">${g("lightbulb")}Discuss my idea</button></div>
        ${R.askMode === "idea" ? `<label class="sr" for="reel-idea">Your idea</label><textarea id="reel-idea" class="idea" dir="auto" placeholder="Type or dictate your idea. A sentence is enough.">${esc(R.askIdea)}</textarea>` : ""}
        <div class="btns"><a class="btn primary" id="reel-claude" href="${esc(claudeUrl(p))}" target="_blank" rel="noopener">${g("sparkles")}Open in Claude</a>
          <button class="btn" type="button" data-act="reel-askcopy">${g("copy")}Copy prompt</button></div>
        <details class="peek"><summary>See what Claude gets</summary><pre id="reel-prompt">${esc(p)}</pre></details>
        <p class="sub">${BACKUP ? "Claude opens as usual. Saving it to For Claude waits for your PC." : "It's also saved to For Claude, in MK News and on the PC."}</p></div>`);
    const art = $(".ask-art");
    if (art) art.style.backgroundImage = cssUrl(bgOf(r)); // set here, never inside a style attribute
    $("#reel-claude")?.addEventListener("click", () => saveAsk());
    const ta = $("#reel-idea");
    ta?.addEventListener("input", () => {
      R.askIdea = ta.value;
      const np = askPrompt();
      $("#reel-claude").href = claudeUrl(np);
      $("#reel-prompt").textContent = np;
    });
  }
  async function saveAsk() {
    if (BACKUP) return; // Claude still opens; the For Claude list lives on the PC
    try {
      await post("/api/news/save", { item: rawItem(R.ask), mode: R.askMode, idea: R.askMode === "idea" ? R.askIdea : "" });
      R.saved = (await api("/api/news/saved")).items || [];
      paintRail();
    } catch { /* the link still opens */ }
  }

  // ---------- input ----------
  function onTap(e) {
    if (e.target.closest("a, button, input, textarea, select, .caught-body")) return;
    togglePause();
  }
  function onWheel(e) {
    if (e.target.closest(".reels-track") || e.ctrlKey) return; // the track scrolls itself, snapping one reel at a time
    e.preventDefault();
    if (Math.abs(e.deltaY) < 8 || performance.now() - R.wheelAt < 450) return;
    R.wheelAt = performance.now();
    step(e.deltaY > 0 ? 1 : -1);
  }
  function onVisibility() {
    if (document.hidden) { hold(); flushSeen(); send("pauseVideo"); } else { if (!R.paused) send("playVideo"); if (!R.paused && !R.speaking) run(); }
  }
  function keydown(e) {
    if (!R.mounted || e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.target.matches("input, textarea, select") || $("#panel")?.classList.contains("on")) return false;
    const onControl = e.target.closest("a, button");
    if (["ArrowDown", "PageDown", "j"].includes(e.key)) { step(1); return true; }
    if (["ArrowUp", "PageUp", "k"].includes(e.key)) { step(-1); return true; }
    if (e.key === "Home") { openAt(0); return true; }
    if (e.key === "End") { openAt(items().length); return true; }
    if ((e.key === " " || e.key === "p") && !onControl) { togglePause(); return true; }
    if (e.key === "l" && cur()) { R.speaking ? (stopSpeech(), run()) : speak(cur()); return true; }
    return false;
  }

  async function act(name, el) {
    const r = cur();
    switch (name) {
      case "reel-next": step(1); break;
      case "reel-prev": step(-1); break;
      case "reel-save": if (r) toggleSave(r); break;
      case "reel-ask":
        if (!r) break;
        if (d.ask) { togglePause(true); markSeen(r.id); d.ask(rawItem(r), el); } // MK News opens its own Ask sheet
        else openAsk(r);
        break;
      case "reel-sound": {
        R.sound = !R.sound;
        if (R.sound) { send("unMute"); send("setVolume", [100]); send("playVideo"); } else send("mute");
        paintSound();
        break;
      }
      case "reel-listen":
        if (!r) break;
        if (R.speaking) { stopSpeech(); run(); } else { clearTimeout(R.timer); R.timer = null; speak(r); }
        break;
      case "reel-copy": if (r) { copy(r.url, "Link copied"); markSeen(r.id); } break;
      case "reel-restart": {
        try { await post("/api/reels/reset"); } catch (e) { toast(e.message); break; }
        R.data.seen = [];
        writeCache(R.data);
        R.activeId = null;
        openAt(0, true);
        toast("Starting over");
        break;
      }
      case "reel-refresh": {
        try { await post("/api/news/refresh"); toast("Checking MK News sources…"); setTimeout(load, 15000); } catch (e) { toast(e.message); }
        break;
      }
      case "reel-askmode": R.askMode = el.dataset.v; paintAsk(); ($("#reel-idea") || $(`[data-act="reel-askmode"][data-v="${R.askMode}"]`))?.focus(); break;
      case "reel-askcopy": {
        const p = askPrompt();
        try { await navigator.clipboard.writeText(p); toast("Prompt copied. Paste it into Claude."); } catch { window.prompt("Copy this", p); }
        saveAsk();
        break;
      }
      default: break;
    }
  }

  // Settings changed elsewhere: shared ones come back with the next list; device ones apply at once.
  function invalidate() { R.activeId = null; }
  function closeAsk() { if (R.ask) { R.ask = null; closePanel(); } }

  return { render, mount, unmount, keydown, act, invalidate, closeAsk, get data() { return R.data; }, set data(v) { R.data = v; } };
}
