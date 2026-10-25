// Guests in MK News, the screens: what Mom sees when she opens his invite link (a welcome, then the news), what any
// guest sees when a link is broken, ended or left, the "Paste your invite link" screen for iPhone Home Screen apps
// (they keep their own storage, so the key saved in Safari is missing there), and his own "Invite someone" page on
// the PC's copy. news.js owns the state and the flows; this module draws and runs the invite form.
// No GitHub words for guests, and a guest never reads the word PC.
import { icon } from "./icons.js";
import * as invite from "./invite.js";
import { thumbOf, view, artName, artCss, sourceLabel } from "./story.js";

const { OWNER, REPO } = invite;
const KEY_ERRORS = {
  empty: (n) => `Paste the key GitHub made for ${n}.`,
  own: (n) => `This is your own key. Make a new one for ${n} in step 2.`,
  classic: () => "This is a classic key, which can open all your repositories. Make a fine-grained key in step 2.",
  "not-a-key": () => "This doesn't look like a GitHub key. Copy it again from GitHub.",
  token: () => "GitHub refused this key. Copy it again, or make a new one in step 2.",
  access: () => `This key can't see ${REPO}. On GitHub, set Repository access to Only select repositories, then ${REPO}.`,
  "too-wide": (n, what) => `This key can also open your ${what}. Delete it on GitHub and make one for ${REPO} only.`,
  write: () => "This key can change files. Delete it on GitHub and make one with Contents: Read-only.",
  "rate-limit": () => "GitHub needs a pause. Try again in a few minutes.",
  offline: () => "You're offline. Connect, then try again.",
  "github-unreachable": () => "GitHub could not be reached. Try again in a moment.",
  invalid: () => `The key works, but ${REPO} has no readable news yet. Try again in a few minutes.`,
};
const until = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
export const standalone = () => globalThis.matchMedia?.("(display-mode: standalone)").matches || globalThis.navigator?.standalone === true;

export function createGuests(d) {
  const { $, esc, g, post, source } = d;
  let made = null; // the link just made: { name, link }. Memory only, gone when the page closes.

  // ---------- what a guest sees ----------
  const art = (name, pos = "86% 46%") => `style="--art:${artCss(name)};--pos:${pos};--zoom:1.04"`;
  function stateScreen(id, glyph, title, text, actions = "", extra = "") {
    return `<section class="gscreen gs-state ${id}" aria-labelledby="gs-title" ${art("default", "70% 40%")}>
      <div class="art" aria-hidden="true"></div>
      <p class="gs-mark">MK News</p>
      <div class="gs-card">
        <div class="state-icon" aria-hidden="true">${g(glyph)}</div>
        <h1 id="gs-title" tabindex="-1" dir="auto">${title}</h1>
        <p>${text}</p>
        ${actions ? `<div class="acts">${actions}</div>` : ""}${extra}
      </div>
    </section>`;
  }
  const pill = (act, glyph, label, kind = "white") => `<button class="pill ${kind} lg" type="button" data-act="${act}">${g(glyph)}<span>${label}</span></button>`;

  function welcome(name) {
    const cards = [0, 1, 2].map((k) => `<figure class="fan-card c${k} skeleton" aria-hidden="true"></figure>`).join("");
    return `<section class="gscreen welcome" aria-labelledby="gs-title">
      <p class="gs-mark">MK News</p>
      <div class="fan" aria-hidden="true">${cards}</div>
      <div class="welcome-copy">
        <p class="kicker"><b>An invite from ${esc(OWNER)}</b></p>
        <h1 id="gs-title" tabindex="-1" dir="auto">Hi ${esc(name)}</h1>
        <p class="welcome-line">${esc(OWNER)} shared his news with you.</p>
        <p class="welcome-sub">The AI news he follows, whenever you like.</p>
        <div class="acts">${pill("guest-enter", "arrow-right", "Start reading")}</div>
        <p class="welcome-tip">${g("link")}<span>Keep this link: tap it any time to open ${esc(OWNER)}'s news.</span></p>
      </div>
    </section>`;
  }
  // The welcome's three cards: the top stories with real pictures, the news itself behind the invite.
  function fillWelcome(items) {
    const picked = [...items].filter((i) => thumbOf(i).kind === "photo" && !thumbOf(i).card).slice(0, 3);
    for (const it of items) if (picked.length < 3 && !picked.includes(it)) picked.push(it);
    document.querySelectorAll(".fan-card").forEach((card, k) => {
      const it = picked[k];
      if (!it) { card.remove(); return; }
      const t = thumbOf(it);
      card.classList.remove("skeleton");
      card.style.setProperty("--art", artCss(artName(it)));
      card.innerHTML = `<span class="art">${t.kind === "photo" ? `<img class="pic" src="${esc(t.src)}" alt="" decoding="async" referrerpolicy="no-referrer">` : ""}</span>
        <figcaption><b>${esc(sourceLabel(it))}</b><span dir="auto">${esc(view(it).title)}</span></figcaption>`;
    });
    return picked[0];
  }

  function screen(kind, ctx = {}) {
    const name = esc(ctx.name || "");
    switch (kind) {
      case "welcome": return welcome(ctx.name || "");
      case "ended": return stateScreen("ended", "clock", "This invite has ended", `Ask ${esc(OWNER)} for a new link.`,
        pill("guest-retry", "refresh", "Try again") + pill("guest-forget", "x", "Forget this invite", "glass"));
      case "bad": return stateScreen("bad", "alert", "This invite link is incomplete", `Ask ${esc(OWNER)} to send it again,<br>then open the whole link.`,
        ctx.canRead ? pill("guest-open", "arrow-right", "Open the news") : ctx.own ? pill("guest-mine", "arrow-right", "Open my news")
          : pill("guest-to-paste", "copy", "Paste the link instead", "glass"));
      case "left": return stateScreen("left", "check", `You left ${esc(OWNER)}'s news`, "Open his link again to come back.",
        pill("guest-to-paste", "copy", "Paste his link", "glass"));
      case "owner": return stateScreen("owner", "user", "This device already opens your news",
        `This link is ${name}'s invite. Keep your own key, or switch this device to ${name}'s.<br><span class="muted">Switching forgets your key here.</span>`,
        pill("guest-keep", "check", "Keep my key") + `<button class="pill glass lg" type="button" data-act="guest-switch">${g("user")}<span dir="auto">Switch to ${name}'s invite</span></button>`);
      case "paste": return stateScreen("paste", "link", "Paste your invite link",
        standalone() ? `This Home Screen app keeps its own storage, so it needs ${esc(OWNER)}'s link once more. Copy the link, then tap Paste.`
          : `Open the link ${esc(OWNER)} sent you, or copy it and tap Paste.`,
        pill("guest-paste", "copy", "Paste link"),
        `<form class="paste-form" data-form="paste" novalidate><label class="sr" for="paste-link">Invite link</label>
          <input id="paste-link" type="text" inputmode="url" placeholder="Or paste it here" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" aria-describedby="paste-error">
          <button class="pill glass" type="submit">Open</button></form>
        <p class="gs-error" id="paste-error" role="alert"></p>
        <a class="link gs-owner" href="../#/connect">Not a guest? Connect your own key</a>`);
      default: return "";
    }
  }
  function pasteError(text) {
    const el = $("#paste-error");
    if (el) el.textContent = text;
    $("#paste-link")?.setAttribute("aria-invalid", "true");
  }

  // ---------- his "Invite someone" page (the PC's own copy) ----------
  function inviteView() {
    return `<div class="page invite-page">
      <a class="link back-link" href="#/settings">${icon("chevron-left")}Settings</a>
      <header class="list-head"><h1 id="invite-title" tabindex="-1">Invite someone</h1>
        <p>Each person gets a key of their own, so you can stop one without touching the others. Their link works even when your PC is off.</p></header>
      <div class="invite-flow">
        <section class="step" aria-labelledby="step-1"><h2 id="step-1"><b>1</b><span>Who is it for?</span></h2>
          <div class="set-card pad"><label class="field-label" for="invite-name">Their name</label>
            <input class="field" id="invite-name" type="text" maxlength="${invite.NAME_MAX}" placeholder="Mom" autocomplete="off" enterkeyhint="next" dir="auto"></div></section>
        <section class="step" aria-labelledby="step-2"><h2 id="step-2"><b>2</b><span>Make <span data-who>their</span> key on GitHub</span></h2>
          <div class="set-card pad"><a class="pill white" id="invite-github" target="_blank" rel="noopener noreferrer" aria-disabled="true" aria-describedby="invite-how">${icon("github")}<span data-github-label>Type a name first</span></a>
            <ol class="invite-how" id="invite-how"><li>The name, 90 days and <b>Contents: Read-only</b> are filled in for you.</li>
              <li>Under Repository access, choose <b>Only select repositories</b>, then <b>${REPO}</b>.</li>
              <li>Press <b>Generate token</b> and copy it.</li></ol></div></section>
        <section class="step" aria-labelledby="step-3"><h2 id="step-3"><b>3</b><span>Paste the new key</span></h2>
          <form class="set-card pad" id="invite-form" novalidate><label class="sr" for="invite-token">New key from GitHub</label>
            <input class="field" id="invite-token" type="password" placeholder="github_pat_…" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="invite-status">
            <button class="pill white" type="submit">${g("check")}<span>Check key and make the link</span></button>
            <p class="invite-status" id="invite-status" role="status"></p></form></section>
      </div>
      <section class="invite-ready" id="invite-ready" aria-labelledby="ready-title" hidden></section>
    </div>`;
  }
  function syncName() {
    const name = invite.cleanName($("#invite-name")?.value), link = $("#invite-github");
    if (!link) return;
    if (name) { link.href = invite.tokenPageURL(name); link.removeAttribute("aria-disabled"); }
    else { link.removeAttribute("href"); link.setAttribute("aria-disabled", "true"); }
    link.querySelector("[data-github-label]").textContent = name ? `Make ${name}'s key on GitHub` : "Type a name first";
    $("[data-who]").textContent = name ? `${name}'s` : "their";
  }
  function mountInvite() {
    made = null;
    $("#invite-name")?.addEventListener("input", syncName);
    $("#invite-form")?.addEventListener("submit", (e) => { e.preventDefault(); makeInvite(); });
    $("#invite-github")?.addEventListener("click", (e) => { if (e.currentTarget.hasAttribute("aria-disabled")) { e.preventDefault(); $("#invite-name").focus(); } });
    syncName();
  }
  async function makeInvite() {
    const nameIn = $("#invite-name"), keyIn = $("#invite-token"), status = $("#invite-status"), button = $("#invite-form [type=submit]");
    const name = invite.cleanName(nameIn.value), key = keyIn.value.trim();
    [nameIn, keyIn].forEach((el) => el.removeAttribute("aria-invalid"));
    delete status.dataset.tone;
    const fail = (text, field = keyIn) => { status.textContent = text; status.dataset.tone = "error"; field.setAttribute("aria-invalid", "true"); field.focus(); };
    if (!name) return fail("Type their name first (step 1).", nameIn);
    button.disabled = true;
    status.textContent = "Checking the key with GitHub…";
    try {
      const { expires } = await invite.checkKey(key, { own: [source.token(), source.cinemaToken(), source.guestToken()] });
      made = { name, link: invite.inviteLink({ name, token: key }) };
      keyIn.value = "";
      let entry = null;
      try { entry = (await post("/api/news/invites", { name, last4: key.slice(-4), ...(expires ? { expires } : {}) })).entry; } catch { /* the link works; the list misses it */ }
      showReady(name, entry?.expires || expires, entry ? entry.expires_known : !!expires);
    } catch (e) {
      button.disabled = false;
      fail((KEY_ERRORS[e.code] || KEY_ERRORS["github-unreachable"])(name, e.what));
    }
  }
  function showReady(name, expires, known) {
    const share = typeof navigator.share === "function", who = esc(name);
    const ends = `${known ? "" : "about "}${until(expires || Date.now() + invite.INVITE_DAYS * 864e5)}`;
    $(".invite-flow").hidden = true;
    const ready = $("#invite-ready");
    ready.innerHTML = `<div class="invite-ticket"><div class="success-icon" aria-hidden="true">${g("check")}</div>
        <h2 id="ready-title" tabindex="-1" dir="auto">${who}'s link is ready</h2>
        <p>Anyone with this link can read your news, so send it to ${who} only. It works until ${esc(ends)}, even when your PC is off.</p>
        <p class="invite-url" aria-hidden="true">${esc(invite.NEWS_URL.replace(/^https:\/\//, ""))}<span>#invite=••••••••</span></p></div>
      <div class="acts">${share ? pill("inv-share", "send", "Share link") : ""}${pill("inv-copy", "copy", "Copy link", share ? "glass" : "white")}</div>
      <p class="invite-status" id="share-status" role="status"></p>
      <p class="invite-warn">${g("lock")}<span>Checked with GitHub: this key reads your news and nothing else, and it can't change anything.</span></p>
      <div class="invite-after"><button class="link" type="button" data-act="inv-again">Invite someone else</button><a class="link" href="#/settings">Done</a></div>`;
    ready.hidden = false;
    window.scrollTo(0, 0);
    $("#ready-title").focus({ preventScroll: true });
  }
  // Share opens the phone's share sheet; where there is none, or it fails, the link is copied instead.
  async function shareInvite() {
    if (!made) return;
    const status = $("#share-status");
    try {
      await navigator.share({ title: "MK News", text: `${OWNER} shared his news with you.`, url: made.link });
      status.textContent = `Sent. ${made.name} can open it on any phone or computer.`;
    } catch (e) {
      if (e?.name === "AbortError") { status.textContent = "Not sent yet. Share or copy it when you're ready."; return; }
      await copyInvite();
    }
  }
  async function copyInvite() {
    if (!made) return;
    const status = $("#share-status");
    let done = false;
    try { await navigator.clipboard.writeText(made.link); done = true; } catch {
      const area = document.createElement("textarea");
      area.value = made.link; area.readOnly = true; area.className = "sr"; document.body.append(area); area.select();
      try { done = document.execCommand("copy"); } catch { /* no clipboard at all */ }
      area.remove();
    }
    status.textContent = done ? `Copied. Paste it in a message to ${made.name}.` : "This browser could not copy. Try Share, or another browser.";
  }
  async function act(name) {
    switch (name) {
      case "inv-share": await shareInvite(); break;
      case "inv-copy": await copyInvite(); break;
      case "inv-again": $("#view").innerHTML = inviteView(); mountInvite(); $("#invite-name").focus(); break;
      default: break;
    }
  }

  return { screen, fillWelcome, pasteError, inviteView, mountInvite, act };
}
