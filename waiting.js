// Waiting (#/waiting): what he waits on and expects from the AI sessions, as torn paper slips pinned to a cream page.
// A deliberate exception to the glass look (DESIGN.md): the page keeps its paper, sepia ink and brass in both themes.
// The slips come from the PC (GET /api/waiting; AI sessions feed it with tools/waiting_put.py). In the backup the same
// page reads the snapshot, read-only, with one quiet "As of" line; tapping a red slip says it needs the PC.
// Tapping a "Waiting on you" slip strikes it, its pin drops, it leaves and the PC is told (with a 5-second Undo).
import * as R from "./waiting-rules.js";

const BRASS = '<svg class="wt-pin" viewBox="-9 -9 18 18" aria-hidden="true"><circle r="5" fill="url(#wt-brass)" stroke="#4a3410" stroke-width=".5"/><circle cx="-1.5" cy="-1.6" r="1.3" fill="#fff6d8" opacity=".8"/></svg>';
const WAX = '<svg class="wt-pin wax" viewBox="-9 -9 18 18" aria-hidden="true"><path d="M-7,-1 C-8,-6 -3,-8 0,-7.5 C4,-8.5 8,-5 7.2,-1 C8.4,3 5,7.5 0,7 C-4,7.8 -8.2,4 -7,-1Z" fill="url(#wt-wax)" stroke="#3d0707" stroke-width=".5"/><circle r="4" fill="none" stroke="#5a0e0e" stroke-width=".7"/><path d="M-2,-1.5 L0,1.8 L2,-1.5" fill="none" stroke="#e9a59a" stroke-width=".6"/></svg>';
const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <radialGradient id="wt-brass" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#f6e2a6"/><stop offset=".45" stop-color="#b08a3e"/><stop offset="1" stop-color="#5c4318"/></radialGradient>
  <radialGradient id="wt-wax" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#c2413a"/><stop offset=".55" stop-color="#8e1b1b"/><stop offset="1" stop-color="#4a0b0b"/></radialGradient></defs></svg>`;

export function createWaiting(d) {
  const { $, esc, api, post, localGet, localSet, backup, redraw, asOf = () => "" } = d;
  const W = { board: backup ? null : localGet("waiting", null), error: "", leaving: new Set(), gone: new Set(), undo: null, undoTimer: 0, timer: 0 };
  const lang = () => R.langOf(localGet("plansLang", ""), globalThis.navigator?.language);
  const t = (k) => R.text(lang())(k);

  async function load() {
    try {
      const board = await api("/api/waiting");
      const changed = JSON.stringify(board.items) !== JSON.stringify(W.board?.items) || board.today !== W.board?.today;
      W.board = board; W.error = "";
      if (!backup) localSet("waiting", board); // the backup never keeps the slips on the device
      if (changed) redraw();
    } catch (e) {
      W.error = e.message || "offline";
      if (backup) W.board = null; // an older snapshot has no board: the page says it is coming
      redraw();
    }
  }

  function slip(it, group, i) {
    const h = R.hang(it.id || `${group}${i}`);
    const quiet = !it.id;
    const cls = `wt-slip${group === "you" && !quiet ? " red" : ""}${quiet ? " quiet" : ""}${W.leaving.has(it.id) ? " struck" : ""}`;
    const tap = group === "you" && !quiet;
    const inner = `<span class="wt-paper" style="clip-path:${R.tornEdge(it.id || group)}"><span class="wt-hand${R.ARABIC.test(it.line) ? " ar-text" : ""}" dir="auto">${esc(it.line)}</span>${
      it.day ? `<span class="wt-day" dir="auto">${esc(it.day)}</span>` : ""}</span>${group === "you" && !quiet ? WAX : BRASS}`;
    const style = `--r:${h.rot}deg;--dx:${h.dx}px;--pin:${h.pin}%`;
    if (tap && backup) return `<button type="button" class="${cls} needs-pc" style="${style}" data-act="needs-pc" data-why="waitdone" aria-disabled="true">${inner}</button>`;
    return tap ? `<button type="button" class="${cls}" style="${style}" data-wslip="${esc(it.id)}">${inner}</button>`
      : `<div class="${cls}" style="${style}">${inner}</div>`;
  }

  function groupHtml(key, items) {
    const list = items.length ? items.map((it, i) => slip(it, key, i)).join("") : slip({ line: t(`empty.${key}`) }, key, 0);
    const undo = key === "you" && W.undo ? `<button type="button" class="wt-undo" data-wundo="${esc(W.undo)}">${esc(t("undo"))}</button>` : "";
    return `<section class="wt-group wt-${key}" aria-label="${esc(t(key))}"><h2 class="wt-label">${esc(t(key))}</h2>${list}${undo}</section>`;
  }

  function render() {
    const ar = lang() === "ar";
    const dir = ar ? ' dir="rtl" lang="ar"' : ' dir="ltr" lang="en"';
    let body;
    if (backup && !W.board) body = `<div class="wt-groups wt-one">${slip({ line: t("backup") }, "coming", 0)}</div>`;
    else {
      const g = R.grouped(W.board?.items);
      g.you = g.you.filter((it) => !W.gone.has(it.id));
      body = `<div class="wt-groups">${R.GROUPS.map((k) => groupHtml(k, g[k])).join("")}</div>`;
      const today = W.board?.today || (W.error && !W.board ? t("offline") : "");
      if (today) body += `<div class="wt-stub"><span dir="auto">${esc(today)}</span></div>`;
    }
    return `<div class="wt-room">${DEFS}<article class="wt-sheet"${dir}><h1 class="sr">${esc(t("title"))}</h1>
      <p class="wt-date">${esc(R.dateLine(new Date(), lang()))}</p>${backup && W.board && asOf(lang()) ? `<p class="wt-asof" dir="auto">${esc(asOf(lang()))}</p>` : ""}${body}</article></div>`;
  }

  function strike(id) {
    if (W.leaving.has(id)) return;
    W.leaving.add(id);
    const el = document.querySelector(`[data-wslip="${CSS.escape(id)}"]`);
    el?.classList.add("struck");
    const quick = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => {
      el?.classList.add("gone");
      setTimeout(() => send(id), quick ? 0 : 380);
    }, quick ? 300 : 1000);
  }
  async function send(id) {
    W.gone.add(id);
    W.leaving.delete(id);
    showUndo(id);
    try {
      W.board = await post("/api/waiting/done", { id });
      localSet("waiting", W.board);
    } catch { W.gone.delete(id); load(); }
    W.gone.delete(id);
    redraw();
  }
  function showUndo(id) {
    clearTimeout(W.undoTimer);
    W.undo = id;
    W.undoTimer = setTimeout(() => { W.undo = null; redraw(); }, 5000);
    redraw();
  }
  async function undo(id) {
    clearTimeout(W.undoTimer);
    W.undo = null;
    try { W.board = await post("/api/waiting/done", { id, undo: true }); localSet("waiting", W.board); } catch { load(); }
    redraw();
  }

  function onClick(e) {
    const u = e.target.closest("[data-wundo]");
    if (u) { undo(u.dataset.wundo); return; }
    const s = e.target.closest("[data-wslip]");
    if (s) strike(s.dataset.wslip);
  }
  function mount() {
    const view = $("#view");
    view.removeEventListener("click", onClick);
    view.addEventListener("click", onClick);
    clearInterval(W.timer);
    W.timer = setInterval(() => { if (document.visibilityState === "visible" && !W.leaving.size) load(); }, 30000);
  }
  function unmount() {
    clearInterval(W.timer);
    $("#view")?.removeEventListener("click", onClick);
  }

  const count = () => R.waitCount(W.board);
  const homeLine = () => R.homeLine(count(), lang());
  return { render, mount, unmount, load, count, homeLine };
}
