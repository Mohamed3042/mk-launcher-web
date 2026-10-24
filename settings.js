// Settings: the choices he decides. Every control changes behaviour: Reels topics, auto-advance, "start where I
// left off", video clips and their channel list are shared by his devices (server); voice and read-aloud stay on
// this device. The launcher (#/settings) and MK News (news/#/settings) run this same module: in MK News (d.place
// "news") it shows Saved stories, Reels, Video clips and the way back, in the Newsreel look.
import { devicePrefs } from "./reels-prefs.js";
import * as source from "./source.js";

const BACKUP_WORDS = {
  pushed: "Pushed", current: "Up to date", working: "Pushing…", waiting: "First push soon", error: "Couldn't push",
  refused: "Refused by the leak check", published: "Published", off: "Off",
};

const UPDATE_WORDS = {
  current: "Up to date", updated: "Updated, restarting", blocked: "Paused", error: "Couldn't check",
  waiting: "First check soon", off: "Off",
};

export function createSettings(d, reels) {
  const { $, esc, g, api, post, toast, ago, theme, setTheme, phonePanel, inside } = d;
  const inNews = d.place === "news";
  const device = devicePrefs(globalThis.localStorage);
  const S = { reels: null, health: null, voices: [], busy: false, insideApps: [], saved: null, clips: null };
  const insideOn = () => { const v = inside?.get(); return typeof v === "boolean" ? v : !!inside?.phone(); };

  const shared = () => S.reels?.settings || reels.data?.settings || null;
  const scope = (where) => `<span class="scope">${g(where === "device" ? "phone" : "refresh")}${where === "device" ? "This device" : "All your devices"}</span>`;
  const sw = (act, on, label) => source.BACKUP && act !== "set-read"
    ? `<button class="switch needs-pc" type="button" role="switch" aria-checked="${on}" aria-disabled="true" data-act="needs-pc" data-why="settings" aria-label="${esc(label)}"><i></i></button>`
    : `<button class="switch" type="button" role="switch" aria-checked="${on}" data-act="${act}" aria-label="${esc(label)}"><i></i></button>`;
  const shareAct = (act) => (source.BACKUP ? `data-act="needs-pc" data-why="settings" aria-disabled="true"` : `data-act="${act}"`);
  function row(title, text, control, where, extra = "") {
    return `<div class="set-row${extra}"><div class="set-text"><b>${title}</b>${text ? `<span>${text}</span>` : ""}${where ? scope(where) : ""}</div>
      <div class="set-ctl">${control}</div></div>`;
  }

  function render() {
    const s = shared();
    const dev = device.get();
    const topics = S.reels?.topics || reels.data?.topics || [];
    const off = new Set(s?.topics_off || []);
    let reelsCard;
    if (!s) {
      reelsCard = `<div class="skeleton" style="height:320px;border-radius:18px"></div>`;
    } else {
      const chips = topics.map((t) => `<button class="chip${source.BACKUP ? " needs-pc" : ""}" type="button" ${shareAct("set-topic")} data-v="${esc(t.id)}" aria-pressed="${!off.has(t.id)}">${g(off.has(t.id) ? "plus" : "check")}${esc(t.label)}<span class="count">${t.count}</span></button>`).join("");
      const pace = ["relaxed", "normal", "fast"].map((p) => `<button type="button" ${shareAct("set-pace")} data-v="${p}" aria-pressed="${s.pace === p}" ${s.auto_advance ? "" : "disabled"}>${p[0].toUpperCase() + p.slice(1)}</button>`).join("");
      const voices = S.voices.length
        ? `<select id="set-voice" aria-label="Voice"><option value="">Device default</option>${S.voices.map((v) => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === dev.voice ? "selected" : ""}>${esc(v.name)}${v.lang ? ` · ${esc(v.lang)}` : ""}</option>`).join("")}</select>`
        : `<span class="muted">${globalThis.speechSynthesis ? "Loading voices…" : "This browser can't read aloud"}</span>`;
      const total = S.reels?.items?.length ?? reels.data?.items?.length ?? 0;
      const seen = S.reels?.seen?.length ?? reels.data?.seen?.length ?? 0;
      reelsCard = `<div class="set-card">
        <div class="set-row col"><div class="set-text"><b>Topics</b><span>Reels show stories from the topics that are on. A story stays if any of its topics is on.</span>${scope("shared")}</div>
          <div class="chips wrap" role="group" aria-label="Topics">${chips || `<span class="muted">Topics appear once MK News has stories.</span>`}</div></div>
        ${row("Auto-advance", "Moves on after a calm reading time. Tap a reel to pause it.", sw("set-auto", s.auto_advance, "Auto-advance"), "shared")}
        ${row("Speed", "How long each reel stays.", `<div class="seg" role="group" aria-label="Auto-advance speed">${pace}</div>`, "", s.auto_advance ? " sub wrap" : " sub wrap off")}
        ${row("Start where I left off", "Open Reels at the first story you haven't seen.", sw("set-resume", s.resume, "Start where I left off"), "shared")}
        ${row("Read aloud automatically", "Each reel reads itself out when it comes up.", sw("set-read", dev.readAloud, "Read aloud automatically"), "device")}
        ${row("Voice", "The voice for Listen and read aloud.", `${voices}<button class="btn sm ghost" type="button" data-act="set-sample" ${globalThis.speechSynthesis ? "" : "disabled"}>${g("volume")}Try it</button>`, "device", " wrap")}
        ${row("Seen reels", `${seen} of ${total} seen`, `<button class="btn sm ghost" type="button" data-act="set-clear-seen" ${seen ? "" : "disabled"}>${g("rotate-ccw")}Start over</button>`, source.BACKUP ? "device" : "shared")}
      </div>${source.BACKUP ? `<p class="sub needs-pc-line">${g("monitor")}${esc(source.REASON.settings)}</p>` : ""}`;
    }
    const clipsCard = s ? clipsHtml(s) : "";
    const t = theme();
    const themeSeg = [["auto", "Auto", "sun-moon"], ["dark", "Dark", "moon"], ["light", "Light", "sun"]]
      .map(([v, l, i]) => `<button type="button" data-act="set-theme" data-v="${v}" aria-pressed="${t === v}">${g(i)}${l}</button>`).join("");
    const h = S.health;
    const up = h?.update || {};
    const word = UPDATE_WORDS[up.state] || (h ? "Unknown" : "Checking…");
    const mark = up.state === "current" ? "up" : ["error", "blocked"].includes(up.state) ? "down" : "";
    const bk = h?.backup || {};
    const bWord = (part) => BACKUP_WORDS[part?.state] || (h ? "Unknown" : "Checking…");
    const bMark = (part) => (["pushed", "current", "published"].includes(part?.state) ? "up" : ["error", "refused"].includes(part?.state) ? "down" : "");
    const backupCard = source.BACKUP ? `<div class="set-card pad"><dl class="kv set-kv">
        <dt>Snapshot</dt><dd>${S.snapAt ? esc(source.whenWords(S.snapAt)) : "none yet"}</dd>
        <dt>Key</dt><dd>${source.tokenFrom() === "mkc" ? "Your MK Cinema key" : source.tokenFrom() ? "Saved in this browser" : "Not connected"}</dd>
        <dt>Repo</dt><dd><span class="mono">${esc(source.REPO_NAME)}</span> (private)</dd></dl>
        <p class="sub">The PC pushes a snapshot every 10 minutes when something changed. This copy reads it with your read-only key.</p>
        <div class="btns" style="margin-top:12px">${S.liveOrigin ? `<a class="btn sm" href="${esc(S.liveOrigin)}/">${g("monitor")}Open the live launcher</a>` : ""}
        <button class="btn sm ghost" type="button" data-act="forget-key">${g("x")}Forget key</button></div></div>`
      : `<div class="set-card pad"><dl class="kv set-kv">
        <dt>Backup</dt><dd><a href="${esc(bk.url || source.BACKUP_URL)}" target="_blank" rel="noopener">${esc((bk.url || source.BACKUP_URL).replace(/^https:\/\//, ""))}</a></dd>
        <dt>Snapshot</dt><dd><span class="st ${bMark(bk.snapshot)}"><i></i>${esc(bWord(bk.snapshot))}</span>${bk.snapshot?.pushed_at ? ` <span class="muted">· last pushed ${esc(ago(bk.snapshot.pushed_at))}</span>` : ""}${bk.snapshot?.detail ? ` <span class="muted">· ${esc(bk.snapshot.detail)}</span>` : ""}</dd>
        <dt>App shell</dt><dd><span class="st ${bMark(bk.web)}"><i></i>${esc(bWord(bk.web))}</span>${bk.web?.published_at ? ` <span class="muted">· ${esc(ago(bk.web.published_at))}</span>` : ""}${bk.web?.detail ? ` <span class="muted">· ${esc(bk.web.detail)}</span>` : ""}</dd></dl>
        <p class="sub">If the PC goes down, open the backup: it shows what was last true and greys out what needs the PC. It asks once for a read-only key to <b>${esc(bk.repo ? bk.repo.split("/").pop() : source.REPO_NAME)}</b>.</p>
        <div class="btns" style="margin-top:12px"><button class="btn sm" type="button" data-act="copy" data-text="${esc(bk.url || source.BACKUP_URL)}">${g("copy")}Copy backup link</button></div></div>`;
    const updates = `<dl class="kv set-kv">
      <dt>Version</dt><dd class="num">${esc(h?.version || "…")}</dd>
      <dt>Updates</dt><dd><span class="st ${mark}"><i></i>${esc(word)}</span>${up.detail ? ` <span class="muted">· ${esc(up.detail)}</span>` : ""}</dd>
      <dt>Commit</dt><dd><span class="mono">${esc(up.head || "–")}</span></dd>
      <dt>Last check</dt><dd>${up.at ? esc(ago(up.at)) : "not yet"}</dd></dl>
      <p class="sub">The PC copy checks GitHub every few minutes and restarts itself on new code.</p>`;
    if (inNews) {
      const n = S.saved?.length;
      return `<div class="settings news-settings">
      <section class="section"><div class="section-head"><h2>Saved stories</h2></div><div class="set-card">
        <a class="set-link" href="#/saved">${g("bookmark")}<span><b>Saved for Claude</b><span>${n == null ? "Loading…" : n ? `${n} ${n === 1 ? "story" : "stories"}, ready to open in Claude` : "Nothing saved yet. Tap Save on any story."}</span></span>${n ? `<span class="count num">${n}</span>` : ""}${g("chevron-right")}</a></div></section>
      <section class="section"><div class="section-head"><h2>Reels</h2></div>${reelsCard}</section>
      <section class="section"><div class="section-head"><h2>Video clips</h2></div>${clipsCard}</section>
      <section class="section"><div class="section-head"><h2>About</h2></div><div class="set-card">
        <a class="set-link" href="../">${g("back")}<span><b>MK Launcher</b><span>All your apps, sites and changes</span></span>${g("chevron-right")}</a>
        <a class="set-link" href="../#/settings">${g("settings")}<span><b>Launcher settings</b><span>Theme, backup and updates</span></span>${g("chevron-right")}</a></div></section>
    </div>`;
    }
    return `<div class="settings">
      <section class="section"><div class="section-head"><h2>Reels</h2></div>${reelsCard}</section>
      <section class="section"><div class="section-head"><h2>Video clips</h2></div>${clipsCard}</section>
      <section class="section"><div class="section-head"><h2>Appearance</h2></div><div class="set-card">
        ${row("Theme", "Auto follows your device.", `<div class="seg" role="group" aria-label="Theme">${themeSeg}</div>`, "device", " wrap")}</div></section>
      ${source.BACKUP || !inside ? "" : `<section class="section"><div class="section-head"><h2>Apps</h2></div><div class="set-card">
        ${row("Open apps inside the Launcher", `Full screen, no browser bars, with a Back to Launcher button you can drag to any corner. Only apps that allow it${S.insideApps.length ? ` (${esc(S.insideApps.join(", "))})` : ""}; the rest open in the browser.`, sw("set-inside", insideOn(), "Open apps inside the Launcher"), "device")}</div></section>`}
      <section class="section"><div class="section-head"><h2>Backup on GitHub</h2></div>${backupCard}</section>
      ${source.BACKUP ? "" : `<section class="section"><div class="section-head"><h2>Updates</h2></div><div class="set-card pad">${updates}</div></section>`}
      <section class="section"><div class="section-head"><h2>About</h2></div><div class="set-card">
        <a class="set-link" href="news/">${g("news")}<span><b>MK News</b><span>Your AI news, filtered to your work</span></span>${g("chevron-right")}</a>
        ${!source.BACKUP && S.selfRepo ? `<a class="set-link" href="https://github.com/${esc(S.owner)}/${esc(S.selfRepo)}" target="_blank" rel="noopener">${g("github")}<span><b>MK Launcher on GitHub</b><span>The code, private repo</span></span>${g("external")}</a>` : ""}
        <button class="set-link" type="button" data-act="phone">${g("phone")}<span><b>Put it on your phone</b><span>${source.BACKUP ? "Add the backup to your Home Screen" : "Add to Home Screen over Tailscale"}</span></span>${g("chevron-right")}</button>
      </div></section>
    </div>`;
  }

  // Real clips: the switch, where they come from, and the channel list he edits (add a handle, remove one).
  function clipsHtml(s) {
    const st = S.clips || S.reels?.clips || reels.data?.clips || null;
    const found = st?.channels || {};
    const chans = (s.channels || []).map((h) => {
      const f = found[h];
      const note = !f ? (st?.at ? "Looking soon" : "Not looked at yet") : f.error ? f.error : `${f.found} Shorts`;
      return `<li class="chan${f?.error ? " bad" : ""}"><span class="chan-name"><b dir="auto">${esc(f?.name || h)}</b><span>${esc(h)} · ${esc(note)}</span></span>
        <button class="icon-btn" type="button" ${shareAct("set-chan-del")} data-v="${esc(h)}" aria-label="Remove ${esc(h)}">${g("x")}</button></li>`;
    }).join("");
    const when = !st ? "" : !st.available ? "yt-dlp is not installed on the PC, so no clips can be found." :
      st.refreshing ? "Looking for clips now…" : st.at ? `Last looked ${ago(st.at)} · ${st.count} ${st.count === 1 ? "clip" : "clips"} found` : "The first look runs a minute after the PC starts.";
    return `<div class="set-card">
      ${row("Video clips", "Real short videos about your topics, mixed into Reels: about two clips for every story. Muted until you tap for sound.", sw("set-clips", s.clips !== false, "Video clips"), "shared")}
      <div class="set-row col${s.clips === false ? " off" : ""}"><div class="set-text"><b>Channels</b><span>Clips come from these channels' Shorts and from searches for your topics. Only clips from the last 30 days, 90 seconds or less.</span>${when ? `<span class="clip-state">${esc(when)}</span>` : ""}${scope("shared")}</div>
        <ul class="chans" aria-label="Channels">${chans || `<li class="muted">No channels. Clips come from topic searches only.</li>`}</ul>
        ${source.BACKUP ? "" : `<form class="chan-add" data-form="chan-add"><label class="sr" for="chan-new">YouTube channel handle</label>
          <input id="chan-new" type="text" placeholder="Add a channel, like @Fireship" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" maxlength="80">
          <button class="btn sm" type="submit" data-act="set-chan-add">${g("plus")}Add</button></form>`}</div>
    </div>`;
  }

  function paint() {
    if (!$(".settings")) return;
    const y = window.scrollY;
    $("#view").innerHTML = d.frame ? d.frame(render()) : `<h1 class="page-title">Settings</h1>` + render();
    window.scrollTo(0, y);
    bindVoice();
  }
  function bindVoice() {
    $('[data-form="chan-add"]')?.addEventListener("submit", (e) => { e.preventDefault(); act("set-chan-add"); }); // Enter adds it
    $("#set-voice")?.addEventListener("change", (e) => {
      if (!device.set({ voice: e.target.value })) toast("This browser won't save settings (private mode?)");
      else toast("Voice saved on this device");
    });
  }
  function loadVoices() {
    const synth = globalThis.speechSynthesis;
    if (!synth) return;
    const pick = () => {
      const all = synth.getVoices() || [];
      // the device's own language first, then English, then the rest
      const lang = (navigator.language || "en").slice(0, 2);
      S.voices = [...all].sort((a, b) => (b.lang.startsWith(lang) - a.lang.startsWith(lang)) || (b.lang.startsWith("en") - a.lang.startsWith("en")) || a.name.localeCompare(b.name));
      paint();
    };
    pick();
    synth.addEventListener?.("voiceschanged", pick, { once: true });
  }

  async function mount() {
    bindVoice();
    loadVoices();
    const [r, h, a, sv] = await Promise.allSettled([api("/api/reels"), api("/api/health"), inNews ? Promise.resolve(null) : api("/api/apps"),
      inNews ? api("/api/news/saved") : Promise.resolve(null)]);
    if (r.status === "fulfilled") { S.reels = r.value; reels.data = r.value; S.clips = r.value.clips || null; }
    if (sv.status === "fulfilled" && sv.value) S.saved = sv.value.items || [];
    else if (inNews) S.saved = [];
    if (h.status === "fulfilled") S.health = h.value;
    if (a.status === "fulfilled" && a.value) S.insideApps = (a.value.apps || []).filter((x) => x.open === "inside").map((x) => x.name);
    if (a.status === "fulfilled" && a.value) { S.selfRepo = a.value.self_repo || ""; S.owner = "Mohamed3042"; S.liveOrigin = a.value.public_origin || ""; }
    S.snapAt = source.BACKUP ? source.snapshotAt() : 0;
    paint();
  }

  async function saveShared(changes, done) {
    const before = shared();
    if (!before || S.busy) return;
    S.busy = true;
    S.reels = { ...(S.reels || reels.data), settings: { ...before, ...changes } }; // show it at once
    paint();
    try {
      const res = await post("/api/settings", { reels: changes });
      S.reels.settings = res.reels;
      if (res.clips) S.clips = res.clips;
      reels.invalidate();
      if (changes.topics_off || changes.channels || "clips" in changes) {
        const fresh = await api("/api/reels");
        S.reels = fresh; reels.data = fresh;
        if (fresh.clips) S.clips = fresh.clips;
      } else if (reels.data) reels.data = { ...reels.data, settings: res.reels };
      if (done) toast(done);
    } catch (e) {
      S.reels = { ...S.reels, settings: before };
      toast(`Couldn't save: ${e.message}`);
    }
    S.busy = false;
    paint();
  }

  async function act(name, el) {
    const s = shared();
    switch (name) {
      case "set-topic": {
        const off = new Set(s.topics_off);
        off.has(el.dataset.v) ? off.delete(el.dataset.v) : off.add(el.dataset.v);
        await saveShared({ topics_off: [...off] });
        $(`[data-act="set-topic"][data-v="${CSS.escape(el.dataset.v)}"]`)?.focus();
        break;
      }
      case "set-auto": await saveShared({ auto_advance: !s.auto_advance }); $('[data-act="set-auto"]')?.focus(); break;
      case "set-pace": await saveShared({ pace: el.dataset.v }); $(`[data-act="set-pace"][data-v="${el.dataset.v}"]`)?.focus(); break;
      case "set-resume": await saveShared({ resume: !s.resume }); $('[data-act="set-resume"]')?.focus(); break;
      case "set-read": {
        const on = !device.get().readAloud;
        if (!device.set({ readAloud: on })) toast("This browser won't save settings (private mode?)");
        paint();
        $('[data-act="set-read"]')?.focus();
        break;
      }
      case "set-sample": {
        const synth = globalThis.speechSynthesis;
        if (!synth) break;
        synth.cancel();
        const u = new SpeechSynthesisUtterance("This is how your reels will sound.");
        const v = (synth.getVoices() || []).find((x) => x.voiceURI === device.get().voice);
        if (v) { u.voice = v; u.lang = v.lang; }
        synth.speak(u);
        break;
      }
      case "set-clear-seen": {
        try {
          await post("/api/reels/reset");
          S.reels = { ...S.reels, seen: [] };
          if (reels.data) reels.data = { ...reels.data, seen: [] };
          reels.invalidate();
          toast("Reels start from the top again");
        } catch (e) { toast(e.message); }
        paint();
        break;
      }
      case "set-inside": {
        if (!inside.set(!insideOn())) toast("This browser won't save settings (private mode?)");
        else toast(insideOn() ? "Apps open inside the Launcher on this device" : "Apps open in the browser on this device");
        paint();
        $('[data-act="set-inside"]')?.focus();
        break;
      }
      case "set-clips": await saveShared({ clips: s.clips === false }, s.clips === false ? "Clips are on" : "Clips are off"); $('[data-act="set-clips"]')?.focus(); break;
      case "set-chan-add": {
        const input = $("#chan-new");
        const raw = (input?.value || "").trim();
        const handle = raw ? (raw.match(/@[A-Za-z0-9._-]+/)?.[0] || `@${raw.replace(/^.*\/(?=[^/]+\/?$)/, "").replace(/\/$/, "")}`) : "";
        if (!handle || handle === "@") { input?.focus(); break; }
        if ((s.channels || []).some((h) => h.toLowerCase() === handle.toLowerCase())) { toast(`${handle} is already on the list`); break; }
        await saveShared({ channels: [...(s.channels || []), handle] }, `Added ${handle}. Looking for its clips now.`);
        $("#chan-new")?.focus();
        break;
      }
      case "set-chan-del": {
        const left = (s.channels || []).filter((h) => h !== el.dataset.v);
        await saveShared({ channels: left }, `Removed ${el.dataset.v}`);
        break;
      }
      case "set-theme": setTheme(el.dataset.v); paint(); $(`[data-act="set-theme"][data-v="${el.dataset.v}"]`)?.focus(); break;
      default: break;
    }
  }

  return { render, mount, act, paint };
}
