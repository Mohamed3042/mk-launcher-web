// The app layer: an app opened inside the launcher, full screen, with a floating "Back to Launcher" pill.
// Tap the pill: back to where you were (the app stays warm). Drag it: it settles in the nearest corner and
// remembers it. Hold it (or right-click): Open in Safari, Reload, Close app.
import * as H from "./host-rules.js";

const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const ALLOW = "microphone; camera; autoplay; fullscreen; clipboard-read; clipboard-write; display-capture; screen-wake-lock; picture-in-picture";

export function createHost({ esc, g, toast }) {
  const layer = H.createLayer();
  const store = globalThis.localStorage;
  const root = document.createElement("div");
  root.id = "host";
  root.className = "host";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.innerHTML = `<div class="host-stage"></div>
    <div class="host-cover" aria-live="polite"><div class="host-cover-in"><span class="host-icon"></span><b class="host-name" dir="auto"></b>
      <span class="host-wait">Opening…</span><a class="btn sm ghost host-slow" target="_blank" rel="noopener" hidden>${g("external")}Open in the browser</a></div></div>
    <button class="host-pill" type="button" aria-label="Back to Launcher" title="Back to Launcher · hold for more">${g("chevron-left")}<span>Launcher</span></button>
    <div class="host-menu" role="menu" hidden>
      <button type="button" role="menuitem" data-host="safari">${g("external")}<span>${IOS ? "Open in Safari" : "Open in a new tab"}</span></button>
      <button type="button" role="menuitem" data-host="reload">${g("refresh")}<span>Reload</span></button>
      <button type="button" role="menuitem" data-host="drop">${g("x")}<span>Close app</span></button>
    </div>`;
  document.body.appendChild(root);
  const stage = root.querySelector(".host-stage");
  const cover = root.querySelector(".host-cover");
  const pill = root.querySelector(".host-pill");
  const menu = root.querySelector(".host-menu");
  const slow = root.querySelector(".host-slow");
  let frame = null, app = null, returnFocus = null, slowTimer = null, hideTimer = null;

  function place(corner) { pill.dataset.corner = H.cleanCorner(corner); menu.dataset.corner = pill.dataset.corner; }
  place(H.readCorner(store));

  function load(url, name) {
    frame?.remove();
    frame = document.createElement("iframe");
    frame.className = "host-frame";
    frame.title = name;
    frame.allow = ALLOW;
    frame.setAttribute("allowfullscreen", "");
    cover.classList.remove("gone");
    slow.hidden = true;
    slow.href = url;
    clearTimeout(slowTimer);
    slowTimer = setTimeout(() => { slow.hidden = false; }, 8000);
    frame.addEventListener("load", () => { clearTimeout(slowTimer); cover.classList.add("gone"); }, { once: true });
    frame.src = url; // a new frame per app: no stray history entries, nothing of the previous app left
    stage.appendChild(frame);
  }

  function open(a, iconHtml = "") {
    clearTimeout(hideTimer);
    hideMenu();
    const step = layer.open(a);
    app = a;
    root.querySelector(".host-icon").innerHTML = iconHtml;
    root.querySelector(".host-name").textContent = a.name;
    root.setAttribute("aria-label", a.name);
    if (step.load) load(step.url, a.name);
    if (root.hidden) returnFocus = document.activeElement;
    root.hidden = false;
    document.documentElement.classList.add("host-on");
    requestAnimationFrame(() => root.classList.add("on"));
    pill.focus({ preventScroll: true }); // keys inside the framed app never reach us; from the pill Esc goes back
    return step;
  }

  // keyboard = true when he left with Esc or Enter: then focus returns to what opened the app
  function back({ keyboard = false } = {}) {
    hideMenu();
    if (!layer.close().hide) return false;
    root.classList.remove("on");
    document.documentElement.classList.remove("host-on");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { if (!layer.state.open) root.hidden = true; }, 260);
    if (keyboard) returnFocus?.focus?.({ preventScroll: true });
    else document.activeElement?.blur?.();
    return true;
  }

  function drop() {
    back();
    layer.drop();
    clearTimeout(slowTimer);
    frame?.remove();
    frame = null; app = null;
  }

  function showMenu() { menu.hidden = false; menu.querySelector("button").focus({ preventScroll: true }); }
  function hideMenu() { menu.hidden = true; }

  menu.addEventListener("click", (e) => {
    const b = e.target.closest("[data-host]");
    if (!b || !app) return;
    hideMenu();
    const url = app.url;
    if (b.dataset.host === "safari") {
      if (IOS) location.href = H.safariUrl(url, { ios: true });
      else window.open(url, "_blank", "noopener");
    } else if (b.dataset.host === "reload") {
      load(url, app.name);
    } else if (b.dataset.host === "drop") {
      const name = app.name;
      drop();
      toast(`${name} closed`);
    }
  });
  root.addEventListener("pointerdown", (e) => { if (!menu.hidden && !e.target.closest(".host-menu, .host-pill")) hideMenu(); });

  // the pill: tap = back, drag = move to a corner, hold = menu
  let press = null, suppressClick = false;
  pill.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    pill.setPointerCapture?.(e.pointerId);
    const r = pill.getBoundingClientRect();
    press = { x: e.clientX, y: e.clientY, t: performance.now(), ox: e.clientX - r.left, oy: e.clientY - r.top, kind: "tap" };
    press.timer = setTimeout(() => {
      if (press && press.kind === "tap") { press.kind = "hold"; navigator.vibrate?.(10); showMenu(); }
    }, H.HOLD_MS);
  });
  pill.addEventListener("pointermove", (e) => {
    if (!press) return;
    const kind = H.pressKind({ dx: e.clientX - press.x, dy: e.clientY - press.y, ms: 0 });
    if (press.kind !== "drag" && kind === "drag" && press.kind !== "hold") { press.kind = "drag"; clearTimeout(press.timer); pill.classList.add("dragging"); hideMenu(); }
    if (press.kind === "drag") {
      pill.style.left = `${e.clientX - press.ox}px`;
      pill.style.top = `${e.clientY - press.oy}px`;
    }
  });
  const endPress = (e, cancelled = false) => {
    if (!press) return;
    clearTimeout(press.timer);
    if (press.kind === "drag") {
      const r = pill.getBoundingClientRect();
      const corner = H.nearestCorner(r.left + r.width / 2, r.top + r.height / 2, innerWidth, innerHeight);
      pill.classList.remove("dragging");
      pill.style.left = ""; pill.style.top = "";
      place(corner);
      H.writeCorner(store, corner);
    }
    suppressClick = cancelled || press.kind !== "tap";
    press = null;
  };
  pill.addEventListener("pointerup", (e) => endPress(e));
  pill.addEventListener("pointercancel", (e) => endPress(e, true));
  pill.addEventListener("click", (e) => {
    e.preventDefault();
    if (suppressClick) { suppressClick = false; return; }
    back({ keyboard: e.detail === 0 });
  });
  pill.addEventListener("contextmenu", (e) => { e.preventDefault(); showMenu(); });

  function keydown(e) {
    if (e.key !== "Escape") return false;
    if (!menu.hidden) { hideMenu(); pill.focus(); } else back({ keyboard: true });
    return true;
  }

  return {
    open, back, drop, keydown,
    isOpen: () => layer.state.open,
    current: () => layer.state,
  };
}
