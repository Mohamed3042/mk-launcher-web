// The Ink look's moving parts: the shared kit's black liquid behind the launcher (one creature per window) and the
// dip, the living black oil every control wears (kit 0.3.3). skin-boot.js has already put data-skin (and data-vk for
// Ink) on <html> before the first paint; this file loads the kit only when Ink is on, tells it which screen is open
// (cost level, where the creature sits, which words to keep clear) and stops it when he stops looking. Classic never
// loads the kit; switching to Classic turns the dip off, which removes every trace of it.
import * as K from "./skin-rules.js";

const KIT = new URL("./ink-kit/ink-liquid.js", import.meta.url).href;
const DIP = new URL("./ink-kit/dip.js", import.meta.url).href;
// Words and controls the liquid flows around (the kit measures at most 160): the bars, the search, the headings
// and the cards of the screen. Data screens sit on an opaque sheet, so their rows need no marks of their own.
const PROTECT = [".brand", ".rail nav", ".rail .foot", ".topbar .phone-only", ".topbar .icon-btn", ".desk-search", ".dock-search", ".tabbar",
  ".home-head", ".main-app", ".home .section-head", ".home-card", ".changes-panel .section-head", ".home .tile", ".home-waiting",
  ".wt-corner"];
const CARDS = [".rail", "main#view", ".main-app", ".home-card", ".changes-panel"];

// The dip: every launcher control, on every screen, sheet and menu and on the Waiting page of its own, named once here
// (the kit picks up what is rendered later by itself). A segmented group and the phone's tab bar are one control each,
// like the kit's own .vk-seg and .vk-tabs; a tile's face is its icon. Cards, sheets and menus carry the oil at their
// edges. data-vk-dip="none" in the markup only where the oil would cross words or a picture (it says why where it is set).
export const DIP_CONTROLS = [
  // buttons of every kind: the generic one last, so a button inside a group that is dipped as a whole stays its face
  ".btn", ".icon-btn", ".link-btn", ".chip", ".seg", ".switch", ".tabbar", ".host-pill",
  "button:not(:is(.seg, .tabbar, .tile) *):not(.tile)",
  // the rail's sections, Home's phone places, menus, the Waiting page's way back
  ".rail a.nav", ".places a.place", "a[role=menuitem]", ".wt-corner",
  // fields (the search field's box is its label)
  ".search", "select", "textarea", "input:not([type=search], [type=checkbox], [type=radio], [type=hidden], [type=range], [type=file])",
  // tiles and rows that open something
  ".tile .aicon", "a.act-row", "a.home-waiting", "[role=button]:not(.tile, :is(.seg, .tabbar) *)", "a.plain-line", "a.quiet-line", "a.commit",
  "a.set-link", "a.rb",
  // Plans: its own link-buttons
  "a:is(.pln-area-head, .pln-crumb-back, .pln-fnode, .pln-rc, .pln-lib, .pln-tab, .pln-chpill, .pln-mv-back, .pln-noted-row, .focus-more, .focus-text)",
].join(", ");
export const DIP_EDGES = [
  ".rail", ".topbar .phone-only:has(.title)", ".home-head", ".main-app", ".home-card", ".home .section", ".changes-panel", ".set-card", ".chart-card",
  ".wt-page .wt-sheet",
  // a data screen's sheet (Home, Reels and the Waiting page have none: skin-ink.css draws it under the same rule)
  ":root:not([data-ink-route=home], [data-ink-route=reels], [data-ink-route=connect], .wt-page) main#view",
  "#panel", ".menu", ".host-menu",
].join(", ");
// While a sheet (or Plans' remove question) is open, only what sits on it carries oil: the kit finds the control the
// pointer is near by its box alone, up to 72 px out, so the page under the scrim would pull strands across the sheet.
// The question wins over a sheet under it (#panel is out of reach while .pln-confirm is open). The kit looks again whenever the sheet is filled or emptied; skin-ink.css lifts the strands above the open sheet.
const MODAL = "#panel:not([hidden]), .pln-confirm";
export const inReach = (list) => `:is(${list}):where(:root:not(:has(${MODAL})) *, :root:not(:has(.pln-confirm)) :is(#panel, #panel *), .pln-confirm, .pln-confirm *)`;

const reducedQ = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
const touchQ = typeof matchMedia === "function" ? matchMedia("(hover: none) and (pointer: coarse)") : null;
const phoneQ = typeof matchMedia === "function" ? matchMedia("(max-width: 759px)") : null;

let v = null;            // the kit's liquid controller while Ink is on
let dip = null;          // the dip's controller (kept for the page's life: Classic sets it "off", which removes it all)
let dipMode = "";
let route = "home";
let lastInput = Date.now();
let timer = 0;
let mode = "";
let scrollRaf = 0;
let wired = false;
const loading = new Map();

const root = () => document.documentElement;
export const skin = () => root().getAttribute("data-skin") || K.DEFAULT;

function load(src, name) {
  if (globalThis[name]) return Promise.resolve(globalThis[name]);
  if (!loading.has(src)) {
    loading.set(src, new Promise((ok, fail) => {
      const s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = () => (globalThis[name] ? ok(globalThis[name]) : fail(new Error("ink kit did not load")));
      s.onerror = () => fail(new Error("ink kit did not load"));
      document.head.append(s);
    }).catch((e) => { loading.delete(src); throw e; }));
  }
  return loading.get(src);
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

function now() {
  const h = hero();
  return { route, idleMs: Date.now() - lastInput, hidden: document.hidden, reduced: !!reducedQ?.matches, heroVisible: !!h && h.bottom > 80 };
}

function tick() {
  clearTimeout(timer); timer = 0;
  if (skin() !== "ink" || (!v && !dip)) return;
  const state = now();
  const waits = [];
  if (v) {
    const want = K.modeFor(state);
    if (want !== mode) {
      mode = want;
      root().setAttribute("data-ink-mode", want);
      if (want === "off") v.enable(false);
      else { v.enable(true); v.setMode(want); }
    }
    waits.push(K.nextChangeIn(state));
  }
  if (dip) {
    const want = K.dipModeFor(state);
    if (want !== dipMode) { dipMode = want; dip.setMode(want); }
    waits.push(K.dipNextChangeIn(state));
  }
  const next = Math.min(...waits.filter((w) => w != null));
  if (Number.isFinite(next)) timer = setTimeout(tick, next + 30);
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
  if ((v || dip) && was > 1000) tick();
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
  const kit = await load(KIT, "InkKit");
  if (skin() !== "ink" || v) return v;   // he switched back while it loaded
  v = kit.mount(document.body, { creature: true, mode: "still" });
  v.tune({ Eyes: 1 });   // the drawn eyes (kit 0.3.3, off unless asked); the kit has no hold-shut, so they show while the membrane bakes (about a second)
  v.state("idle");
  mode = "";
  wire();
  return v;
}

/** The dip does not need the liquid: it mounts on its own, so a failed engine still leaves every control dipped. */
async function mountDip() {
  const kit = await load(DIP, "VkDip");
  if (skin() !== "ink") return dip;
  if (!dip) {
    dipMode = K.dipModeFor(now());
    dip = kit.mount({ mode: dipMode, controls: inReach(DIP_CONTROLS), edges: inReach(DIP_EDGES), flows: K.DIP_FLOWS, drops: K.DIP_DROPS, light: K.dipLight(!!touchQ?.matches) });
    wire();
  } else if (dipMode === "off") dipMode = "";   // back from Classic: tick() turns it on again
  tick();
  return dip;
}

/** After every render: which screen is open, so the liquid knows its cost, its creature and its words. */
export async function after(r) {
  route = r || "home";
  root().setAttribute("data-ink-route", route);   // not data-route: the shell marks every [data-route] as a nav link
  if (skin() !== "ink") return;
  mark();
  mountDip().catch((e) => console.warn(e.message));   // no dip: the Ink colours and the liquid still apply
  try { await mount(); } catch (e) { console.warn(e.message); return; }   // no kit: the Ink colours still apply
  mark(); place(); tick(); v?.refresh();
}

/** The Waiting board's page of its own: the Ink colours and the dip, no liquid. */
export function dipOnly(r = "waiting") {
  route = r;
  if (skin() === "ink") mountDip().catch((e) => console.warn(e.message));
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
  if (next !== "ink") {
    clearTimeout(timer); timer = 0;
    if (dip) { dip.setMode("off"); dipMode = "off"; }   // off removes every layer, class, listener and the overlay
    if (v) { v.destroy(); v = null; mode = ""; h.removeAttribute("data-ink-mode"); }
    mark();
  }
  return after(route);
}

/** For checks: the kit's own numbers (draw ms, fps, mode) and the dip's. */
export const stats = () => (v ? { ...v.stats(), inkMode: mode } : null);
export const dipStats = () => (dip ? { ...dip.stats(), dipMode } : null);
globalThis.mklInk = { stats, dipStats, setSkin, skin };
