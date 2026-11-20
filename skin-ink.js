// The Ink look's moving part: the shared kit's black liquid behind the launcher, one creature per window.
// skin-boot.js has already put data-skin (and data-vk for Ink) on <html> before the first paint; this file loads the
// kit only when Ink is on, tells it which screen is open (cost level, where the creature sits, which words to keep
// clear) and stops it when he stops looking. Classic never loads the kit.
import * as K from "./skin-rules.js";

const KIT = new URL("./ink-kit/venom-liquid.js", import.meta.url).href;
// Words and controls the liquid flows around (the kit measures at most 160): the bars, the search, the headings
// and the cards of the screen. Data screens sit on an opaque sheet, so their rows need no marks of their own.
const PROTECT = [".brand", ".rail nav", ".rail .foot", ".topbar .phone-only", ".topbar .icon-btn", ".desk-search", ".dock-search", ".tabbar",
  ".home-head", ".main-app", ".home .section-head", ".home-card", ".changes-panel .section-head", ".home .tile", ".home-waiting",
  ".wt-corner"];
const CARDS = [".rail", "main#view", ".main-app", ".home-card", ".changes-panel"];
const reducedQ = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
const phoneQ = typeof matchMedia === "function" ? matchMedia("(max-width: 759px)") : null;

let v = null;            // the kit's controller while Ink is on
let loading = null;
let route = "home";
let lastInput = Date.now();
let timer = 0;
let mode = "";
let scrollRaf = 0;
let wired = false;

const root = () => document.documentElement;
export const skin = () => root().getAttribute("data-skin") || K.DEFAULT;

function loadKit() {
  if (globalThis.VenomKit) return Promise.resolve(globalThis.VenomKit);
  if (!loading) {
    loading = new Promise((ok, fail) => {
      const s = document.createElement("script");
      s.src = KIT; s.async = true;
      s.onload = () => (globalThis.VenomKit ? ok(globalThis.VenomKit) : fail(new Error("ink kit did not load")));
      s.onerror = () => fail(new Error("ink kit did not load"));
      document.head.append(s);
    }).catch((e) => { loading = null; throw e; });
  }
  return loading;
}

function hero() {
  const el = route === "home" ? document.querySelector(".home-hero") : null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.height ? { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom } : null;
}

function mark() {
  for (const el of document.querySelectorAll("[data-vk-protect],[data-vk-role]")) {
    if (!el.closest(".vk-layer")) { el.removeAttribute("data-vk-protect"); el.removeAttribute("data-vk-role"); }
  }
  if (skin() !== "ink") return;
  let n = 0;
  for (const sel of PROTECT) for (const el of document.querySelectorAll(sel)) { if (n++ < 160) el.setAttribute("data-vk-protect", ""); }
  for (const sel of CARDS) for (const el of document.querySelectorAll(sel)) el.setAttribute("data-vk-role", "card");
  document.querySelector(".topbar")?.setAttribute("data-vk-role", "top");
}

function tick() {
  clearTimeout(timer); timer = 0;
  if (!v) return;
  const h = hero();
  const state = { route, idleMs: Date.now() - lastInput, hidden: document.hidden, reduced: !!reducedQ?.matches, heroVisible: !!h && h.bottom > 80 };
  const want = K.modeFor(state);
  if (want !== mode) {
    mode = want;
    root().setAttribute("data-ink-mode", want);
    if (want === "off") v.enable(false);
    else { v.enable(true); v.setMode(want); }
  }
  const next = K.nextChangeIn(state);
  if (next != null) timer = setTimeout(tick, next + 30);
}

function sheet() {
  if (route === "home") return null;
  const r = document.querySelector("main#view")?.getBoundingClientRect();
  return r && r.width ? { left: r.left, right: r.right } : null;
}

function place() {
  if (!v) return;
  const c = K.creatureFor({ route, w: innerWidth, h: innerHeight, phone: !!phoneQ?.matches, hero: hero(), sheet: sheet() });
  v.creature(c.show ? { show: true, x: c.x, y: c.y, scale: c.scale } : { show: false });
}

function poke() {
  const was = Date.now() - lastInput;
  lastInput = Date.now();
  if (v && was > 1000) tick();
}

function onScroll() {
  if (route !== "home" || scrollRaf || !v) return;
  scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; place(); tick(); });
}

function wire() {
  if (wired) return;
  wired = true;
  for (const ev of ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"]) addEventListener(ev, poke, { passive: true });
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", () => { if (v) { place(); v.refresh(); } });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) lastInput = Date.now(); tick(); });
  reducedQ?.addEventListener?.("change", () => { mode = ""; tick(); });
}

async function mount() {
  if (v) return v;
  const kit = await loadKit();
  if (skin() !== "ink" || v) return v;   // he switched back while it loaded
  v = kit.mount(document.body, { creature: true, mode: "still" });
  v.state("idle");
  mode = "";
  wire();
  return v;
}

/** After every render: which screen is open, so the liquid knows its cost, its creature and its words. */
export async function after(r) {
  route = r || "home";
  root().setAttribute("data-ink-route", route);   // not data-route: the shell marks every [data-route] as a nav link
  if (skin() !== "ink") return;
  try { await mount(); } catch (e) { console.warn(e.message); return; }   // no kit: the Ink colours still apply
  mark(); place(); tick(); v?.refresh();
}

/** Settings: switch the look now and keep it. */
export function setSkin(next, storage = globalThis.localStorage) {
  K.writeSkin(storage, next);
  const h = root();
  h.setAttribute("data-skin", next);
  if (next === "ink") h.setAttribute("data-vk", ""); else h.removeAttribute("data-vk");
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
    if (!m.dataset.classic) m.dataset.classic = m.content;
    m.content = next === "ink" ? "#000000" : m.dataset.classic;
  }
  if (next !== "ink" && v) {
    clearTimeout(timer); v.destroy(); v = null; mode = "";
    h.removeAttribute("data-ink-mode");
    mark();
  }
  return after(route);
}

/** For checks: the kit's own numbers (draw ms, fps, mode). */
export const stats = () => (v ? { ...v.stats(), inkMode: mode } : null);
globalThis.mklInk = { stats, setSkin, skin };
