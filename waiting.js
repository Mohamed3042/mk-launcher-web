// Waiting (#/waiting, and the page of its own at waiting/): what he waits on and expects from the AI sessions, as
// torn paper slips pinned to a cream page. A deliberate exception to the glass look (DESIGN.md): the page keeps its
// paper, sepia ink and brass in both themes.
// The pen: he draws one line through a slip when it is done, a second line across it (an X) when he drops it; a tap
// on a red slip has the pen strike it by itself; a tap on a marked slip lifts the ink off again. The rules for ink
// versus scroll, strikes and crosses live in waiting-ink.js; the marks and their queue in waiting-marks.js.
// Every mark shows at once and is kept on this device until the PC takes it: on the PC's own page it goes straight
// to the PC; in the Backup it goes to the live launcher (the snapshot's own origin, CORS) once that answers.
// The slips come from the PC (GET /api/waiting; AI sessions feed it with tools/waiting_put.py), or in the Backup
// from the snapshot, with one quiet "As of" line.
import * as R from "./waiting-rules.js";
import * as I from "./waiting-ink.js";
import * as M from "./waiting-marks.js";

const BRASS = '<svg class="wt-pin" viewBox="-9 -9 18 18" aria-hidden="true"><circle r="5" fill="url(#wt-brass)" stroke="#4a3410" stroke-width=".5"/><circle cx="-1.5" cy="-1.6" r="1.3" fill="#fff6d8" opacity=".8"/></svg>';
const WAX = '<svg class="wt-pin wax" viewBox="-9 -9 18 18" aria-hidden="true"><path d="M-7,-1 C-8,-6 -3,-8 0,-7.5 C4,-8.5 8,-5 7.2,-1 C8.4,3 5,7.5 0,7 C-4,7.8 -8.2,4 -7,-1Z" fill="url(#wt-wax)" stroke="#3d0707" stroke-width=".5"/><circle r="4" fill="none" stroke="#5a0e0e" stroke-width=".7"/><path d="M-2,-1.5 L0,1.8 L2,-1.5" fill="none" stroke="#e9a59a" stroke-width=".6"/></svg>';
const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <radialGradient id="wt-brass" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#f6e2a6"/><stop offset=".45" stop-color="#b08a3e"/><stop offset="1" stop-color="#5c4318"/></radialGradient>
  <radialGradient id="wt-wax" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#c2413a"/><stop offset=".55" stop-color="#8e1b1b"/><stop offset="1" stop-color="#4a0b0b"/></radialGradient>
  <filter id="wt-bleed" x="-5%" y="-40%" width="110%" height="180%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="1" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.1"/></filter></defs></svg>`;
const INK = "#2b1d12";
const quick = () => !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function createWaiting(d) {
  const { $, esc, api, localGet, localSet, backup, redraw, asOf = () => "", liveOrigin = () => "" } = d;
  const net = d.fetch || ((...a) => globalThis.fetch(...a));
  const W = {
    board: backup ? null : localGet("waiting", null), error: "", timer: 0, sig: "", busy: 0, dirty: false, sending: false, again: false,
    marks: M.clean(localGet("waitingMarks", [])), ink: localGet("waitingInk", {}) || {}, pen: null, canvas: null, view: null,
  };
  const lang = () => R.langOf(localGet("plansLang", ""), globalThis.navigator?.language);
  const t = (k) => R.text(lang())(k);
  const items = () => M.effective(W.board?.items, W.marks);
  const stateOf = (id) => items().find((it) => it.id === id)?.state || "open";
  const saveMarks = () => localSet("waitingMarks", W.marks);
  const saveInk = () => {
    const live = new Set((W.board?.items || []).map((it) => it.id));
    for (const k of Object.keys(W.ink)) if (W.board && !live.has(k) && !W.marks.some((m) => m.id === k)) delete W.ink[k];
    localSet("waitingInk", W.ink);
  };

  // ---------- the board ----------
  async function load() {
    try {
      const board = await api("/api/waiting");
      W.board = board; W.error = "";
      if (!backup) localSet("waiting", board); // the backup never keeps the slips on the device
      W.marks = M.prune(W.marks, board); saveMarks();
    } catch (e) {
      W.error = e.message || "offline";
      if (backup) W.board = null; // an older snapshot has no board: the page says it is coming
    }
    repaint();
    deliver();
  }
  // Redraw only when what the page shows changed, and never under his pen.
  function signature() {
    return JSON.stringify([items().map((it) => [it.id, it.state, it.line, it.day, it.group]), W.board?.today, !!W.board, W.error && !W.board, asOf(lang())]);
  }
  function repaint() {
    const sig = signature();
    if (sig === W.sig) { quiet(); return; }
    if (W.busy || W.pen) { W.dirty = true; return; }
    redraw();
  }

  function slip(it, group, i) {
    const h = R.hang(it.id || `${group}${i}`);
    const quiet = !it.id;
    const st = it.state || "open";
    const cls = `wt-slip${group === "you" && !quiet ? " red" : ""}${quiet ? " quiet" : ""}${st !== "open" ? ` ${st}` : ""}`;
    const inner = `<span class="wt-paper" style="clip-path:${R.tornEdge(it.id || group)}"><span class="wt-hand${R.ARABIC.test(it.line) ? " ar-text" : ""}" dir="auto">${esc(it.line)}</span>${
      it.day ? `<span class="wt-day" dir="auto">${esc(it.day)}</span>` : ""}</span>`;
    const style = `--r:${h.rot}deg;--dx:${h.dx}px;--pin:${h.pin}%`;
    if (quiet) return `<div class="${cls}" style="${style}">${inner}${BRASS}</div>`;
    return `<button type="button" class="${cls}" style="${style}" data-wslip="${esc(it.id)}" data-group="${group}" aria-describedby="wt-help">${inner}<svg class="wt-ink" aria-hidden="true"></svg>${
      group === "you" ? WAX : BRASS}<span class="sr wt-st">${st === "open" ? "" : `, ${esc(t(st))}`}</span></button>`;
  }

  function groupHtml(key, list) {
    const body = list.length ? list.map((it, i) => slip(it, key, i)).join("") : slip({ line: t(`empty.${key}`) }, key, 0);
    return `<section class="wt-group wt-${key}" aria-label="${esc(t(key))}"><h2 class="wt-label">${esc(t(key))}</h2>${body}</section>`;
  }

  function render() {
    const ar = lang() === "ar";
    const dir = ar ? ' dir="rtl" lang="ar"' : ' dir="ltr" lang="en"';
    let body;
    if (backup && !W.board) body = `<div class="wt-groups wt-one">${slip({ line: t("backup") }, "coming", 0)}</div>`;
    else {
      const g = R.grouped(items());
      body = `<div class="wt-groups">${R.GROUPS.map((k) => groupHtml(k, g[k])).join("")}</div>`;
      const today = W.board?.today || (W.error && !W.board ? t("offline") : "");
      if (today) body += `<div class="wt-stub"><span dir="auto">${esc(today)}</span></div>`;
    }
    W.sig = signature();
    return `<div class="wt-room">${DEFS}<article class="wt-sheet"${dir}><h1 class="sr">${esc(t("title"))}</h1>
      <p class="wt-date">${esc(R.dateLine(new Date(), lang()))}<span class="wt-tally" dir="auto">${esc(tallyText())}</span></p>${
      backup && W.board && asOf(lang()) ? `<p class="wt-asof" dir="auto">${esc(asOf(lang()))}</p>` : ""}<p class="wt-pending" dir="auto" role="status">${esc(pendingText())}</p>
      <p class="sr" id="wt-help">${esc(t("help"))}</p>${body}</article></div>`;
  }
  const tallyText = () => R.tallyLine(M.tally(items()), lang());
  const pendingText = () => R.pendingLine(M.pending(W.marks), lang());
  function quiet() { // the two quiet lines change in place
    const v = W.view;
    if (!v) return;
    const a = v.querySelector(".wt-tally"), b = v.querySelector(".wt-pending");
    if (a && a.textContent !== tallyText()) a.textContent = tallyText();
    if (b && b.textContent !== pendingText()) b.textContent = pendingText();
  }

  // ---------- marks: shown at once, kept here, delivered to the PC ----------
  function mark(id, state, chords) {
    W.marks = M.addMark(W.marks, id, state); saveMarks();
    if (state === "open") delete W.ink[id];
    else if (chords) W.ink[id] = chords;
    saveInk();
    const el = slipEl(id);
    if (el) {
      el.classList.remove("done", "cancelled");
      if (state !== "open") el.classList.add(state);
      const sr = el.querySelector(".wt-st");
      if (sr) sr.textContent = state === "open" ? "" : `, ${t(state)}`;
    }
    W.sig = signature();
    quiet();
    if (state !== "open") tick();
    deliver();
  }

  async function deliver() {
    if (W.sending) { W.again = true; return; }
    const origin = backup ? liveOrigin() : "";
    if (backup && !origin) return;
    if (!M.pending(W.marks) || globalThis.navigator?.onLine === false) return;
    W.sending = true; W.again = false;
    try {
      for (const m of W.marks.filter((x) => !x.sent)) {
        const { path, body } = M.route(m);
        let status = 0, data = null;
        try {
          const res = await net(origin + path, { method: "POST", body: JSON.stringify(body), cache: "no-store", credentials: "omit",
            headers: { "Content-Type": "application/json", "X-MKL": "1" }, ...(backup ? { mode: "cors", referrerPolicy: "no-referrer" } : {}) });
          status = res.status;
          try { data = await res.json(); } catch { /* no body */ }
        } catch { break; } // the PC can't be reached: every mark waits
        if (!W.marks.includes(m)) continue; // he changed it again meanwhile: the newer mark goes next
        const o = M.outcome(status);
        if (o === "keep") break;
        if (o === "drop" || !backup) W.marks = W.marks.filter((x) => x !== m);
        else W.marks = W.marks.map((x) => (x === m ? { ...x, sent: true, sentAt: Date.now() } : x));
        if (!backup && Array.isArray(data?.items)) { W.board = { items: data.items, today: data.today, updated: data.updated }; localSet("waiting", W.board); }
        saveMarks();
      }
    } finally { W.sending = false; }
    quiet();
    repaint();
    if (W.again) deliver();
  }

  // ---------- the ink on a slip ----------
  const slipEl = (id) => W.view?.querySelector(`[data-wslip="${globalThis.CSS?.escape ? CSS.escape(id) : id}"]`);
  const dirOf = () => (lang() === "ar" ? "rtl" : "ltr");
  function chordsFor(id, st) {
    const kept = Array.isArray(W.ink[id]) ? W.ink[id] : [];
    if (st === "done") return [kept[0] || I.autoChord(id, 0, dirOf())];
    if (st === "cancelled") return kept.length >= 2 ? kept.slice(0, 2) : kept.length === 1 ? [kept[0], I.autoChord(id, 1, dirOf())] : [I.autoChord(id, 1, dirOf()), I.autoChord(id, 2, dirOf())];
    return [];
  }
  function paint(el, fresh = -1) {
    const svg = el.querySelector(".wt-ink");
    if (!svg) return;
    const id = el.dataset.wslip, st = stateOf(id);
    const w = el.offsetWidth, h = el.offsetHeight;
    if (st === "open" || !w || !h) { svg.innerHTML = ""; return; }
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.innerHTML = chordsFor(id, st).map((n, i) => {
      const s = I.settle(I.denorm(n, w, h), w, h, `${id}${i}`, st === "cancelled" ? "cross" : "done");
      const len = I.lengthOf(s.pts).toFixed(1), mid = `wtm-${id}-${i}`;
      return `<mask id="${mid}" maskUnits="userSpaceOnUse" x="-20" y="-20" width="${w + 40}" height="${h + 40}"><path class="wt-reveal" d="${I.centerline(s.pts)}" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-dasharray="${len} ${len}" stroke-dashoffset="0" data-len="${len}"/></mask>` +
        `<g class="wt-line${i === fresh ? " fresh" : ""}" mask="url(#${mid})"><path class="wt-stroke" d="${I.ribbon(s.pts, s.widths)}"/></g>`;
    }).join("");
  }
  const paintAll = () => W.view?.querySelectorAll("[data-wslip]").forEach((el) => paint(el));
  // The pen moving along a line by itself (drawIn), or lifting it off from its tail back to the nib (lift).
  function sweep(el, index, from, to, ms) {
    const p = el.querySelectorAll(".wt-reveal")[index];
    if (!p || quick()) return Promise.resolve();
    const len = Number(p.dataset.len);
    p.setAttribute("stroke-dashoffset", String(len * from));
    const a = p.animate?.([{ strokeDashoffset: len * from }, { strokeDashoffset: len * to }], { duration: ms, easing: from > to ? "cubic-bezier(.35,.1,.3,1)" : "cubic-bezier(.55,0,.8,.3)", fill: "forwards" });
    return new Promise((ok) => { if (!a) { ok(); return; } a.onfinish = ok; a.oncancel = ok; }).then(() => p.setAttribute("stroke-dashoffset", String(len * to)));
  }
  async function busy(job) { W.busy++; try { await job(); } finally { W.busy--; if (!W.busy && W.dirty) { W.dirty = false; repaint(); } } }

  // The pen strikes or crosses a slip by itself (a tap, a key).
  function autoMark(el, state) {
    const id = el.dataset.wslip, before = stateOf(id);
    if (state === before || (state === "done" && before === "cancelled")) return;
    const kept = Array.isArray(W.ink[id]) ? W.ink[id] : [];
    const chords = state === "done" ? [I.autoChord(id, 0, dirOf())]
      : before === "done" ? [kept[0] || I.autoChord(id, 0, dirOf()), I.autoChord(id, 1, dirOf())] : [I.autoChord(id, 1, dirOf()), I.autoChord(id, 2, dirOf())];
    busy(async () => {
      mark(id, state, chords);
      paint(el);
      const n = el.querySelectorAll(".wt-reveal").length;
      const first = before === "done" ? 1 : 0;
      for (let i = first; i < n; i++) el.querySelectorAll(".wt-reveal")[i].setAttribute("stroke-dashoffset", el.querySelectorAll(".wt-reveal")[i].dataset.len);
      for (let i = first; i < n; i++) await sweep(el, i, 1, 0, 340);
    });
  }
  function lift(el) {
    const id = el.dataset.wslip;
    if (stateOf(id) === "open") return;
    busy(async () => {
      const n = el.querySelectorAll(".wt-reveal").length;
      for (let i = n - 1; i >= 0; i--) await sweep(el, i, 0, 1, 300);
      mark(id, "open");
      paint(el);
    });
  }

  // ---------- the pen: wet ink under the finger ----------
  function canvas() {
    if (W.canvas?.isConnected) return W.canvas;
    const c = document.createElement("canvas");
    c.className = "wt-wet";
    c.setAttribute("aria-hidden", "true");
    document.body.appendChild(c);
    W.canvas = c;
    size();
    return c;
  }
  function size() {
    const c = W.canvas;
    if (!c) return;
    const r = globalThis.devicePixelRatio || 1;
    c.width = Math.round((c.clientWidth || innerWidth) * r); c.height = Math.round((c.clientHeight || innerHeight) * r); // its own box: the layout viewport the pointer speaks in
    c.getContext("2d").setTransform(r, 0, 0, r, 0, 0);
  }
  function wet() {
    const c = canvas();
    c.getAnimations?.().forEach((a) => a.cancel());
    c.style.opacity = "1";
    const x = c.getContext("2d");
    x.clearRect(0, 0, 1e5, 1e5);
    x.lineCap = "round"; x.lineJoin = "round"; x.strokeStyle = INK; x.fillStyle = INK;
    return x;
  }
  function stroke(x, draw, w) {
    x.globalAlpha = 0.13; x.lineWidth = w + 2.4; x.beginPath(); draw(); x.stroke(); // the ink bleeding into the paper
    x.globalAlpha = 0.94; x.lineWidth = w; x.beginPath(); draw(); x.stroke();
    x.globalAlpha = 1;
  }
  function nib(x, p, r) { x.globalAlpha = 0.94; x.beginPath(); x.arc(p.x, p.y, r, 0, Math.PI * 2); x.fill(); x.globalAlpha = 1; }
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  function inkTo(p) {
    const P = W.pen, pts = P.pts, prev = pts[pts.length - 1];
    const dist = Math.hypot(p.x - prev.x, p.y - prev.y);
    if (dist < 0.8) return;
    pts.push(p);
    const w0 = P.w ?? 3.2;
    P.w = I.nibWidth(P.w, dist / Math.max(1, p.t - prev.t));
    const n = pts.length, x = P.ctx;
    const a = n === 2 ? pts[0] : mid(pts[n - 3], pts[n - 2]), b = mid(pts[n - 2], pts[n - 1]), c = pts[n - 2];
    stroke(x, () => { x.moveTo(a.x, a.y); x.quadraticCurveTo(c.x, c.y, b.x, b.y); }, (w0 + P.w) / 2);
  }
  function fadeWet(ms) {
    const c = W.canvas;
    if (!c) return;
    if (quick() || !c.animate) { c.getContext("2d").clearRect(0, 0, 1e5, 1e5); return; }
    c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: "ease-out", fill: "forwards" }).onfinish = () => {
      if (!W.pen) { c.getContext("2d").clearRect(0, 0, 1e5, 1e5); c.getAnimations?.().forEach((a) => a.cancel()); }
    };
  }

  function boxOf(el) {
    const r = el.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: el.offsetWidth, h: el.offsetHeight, rot: parseFloat(el.style.getPropertyValue("--r")) || 0, rect: r };
  }
  function insideSlip(el, x, y) {
    if (!el) return false;
    const b = boxOf(el), p = I.toLocal(x, y, b);
    return p.x > 10 && p.x < b.w - 10 && p.y > 3 && p.y < b.h - 3;
  }

  function onDown(e) {
    if (e.button > 0 || W.pen || !e.isPrimary) return;
    if (!e.target.closest(".wt-sheet") || e.target.closest("a, input, .wt-corner")) return;
    const el = e.target.closest("[data-wslip]");
    const p = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    const touch = e.pointerType === "touch";
    W.pen = { id: e.pointerId, type: e.pointerType, el, x0: p.x, y0: p.y, t0: p.t, pts: [p], w: null, mode: touch ? "wait" : "ink",
      inside: insideSlip(el, p.x, p.y), still: 0, ctx: wet() };
    nib(W.pen.ctx, p, touch ? 1.3 : 1.7); // ink under the finger on the very first frame: the nib touching the paper
    if (touch) W.pen.timer = setTimeout(() => { const P = W.pen; if (P && P.mode === "wait") { P.mode = "ink"; P.still = I.PEN_DOWN_MS; nib(P.ctx, P.pts[0], 1.8); } }, I.PEN_DOWN_MS);
    else { try { e.target.setPointerCapture?.(e.pointerId); } catch { /* fine */ } e.preventDefault(); }
  }
  function onMove(e) {
    const P = W.pen;
    if (!P || e.pointerId !== P.id) return;
    if (P.mode === "wait") {
      const dx = e.clientX - P.x0, dy = e.clientY - P.y0;
      const verdict = I.decide({ dx, dy, dt: e.timeStamp - P.t0, still: P.still, inside: P.inside, pointerType: P.type });
      if (verdict === "wait") return;
      if (verdict === "scroll") { abort(true); return; }
      P.mode = "ink";
      clearTimeout(P.timer);
    }
    if (P.mode !== "ink") return;
    const co = e.getCoalescedEvents?.(); // empty for some events (WebKit): then the event itself
    for (const ev of co && co.length ? co : [e]) inkTo({ x: ev.clientX, y: ev.clientY, t: ev.timeStamp });
  }
  function onTouchMove(e) { if (W.pen && W.pen.mode === "ink" && e.cancelable) e.preventDefault(); } // the page holds still under the pen
  function abort(fast) {
    const P = W.pen;
    if (!P) return;
    clearTimeout(P.timer);
    W.pen = null;
    if (fast && W.canvas) W.canvas.getContext("2d").clearRect(0, 0, 1e5, 1e5);
    else fadeWet(420);
    if (!W.busy && W.dirty) { W.dirty = false; repaint(); }
  }
  function onUp(e) {
    const P = W.pen;
    if (!P || e.pointerId !== P.id) return;
    clearTimeout(P.timer);
    const moved = Math.hypot(e.clientX - P.x0, e.clientY - P.y0);
    if (moved < 8 && P.pts.length < 6 && e.timeStamp - P.t0 < 900) { abort(true); if (P.el) tap(P.el); return; }
    if (P.mode !== "ink") { abort(true); return; }
    inkTo({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    const x = P.ctx, last = P.pts[P.pts.length - 1], prev = P.pts[P.pts.length - 2] || last;
    const fl = I.tail(P.pts);
    stroke(x, () => { x.moveTo(mid(prev, last).x, mid(prev, last).y); x.lineTo(last.x, last.y); }, P.w ?? 2.6);
    let from = last;
    fl.forEach((q, i) => { stroke(x, () => { x.moveTo(from.x, from.y); x.lineTo(q.x, q.y); }, Math.max(0.4, (P.w ?? 2.6) * [0.7, 0.45, 0.25][i])); from = q; });
    const hit = finish(P.pts);
    W.pen = null;
    fadeWet(hit ? 260 : 420);
    if (!W.busy && W.dirty) { W.dirty = false; repaint(); }
  }

  // Which slip did the stroke strike, and what does it mean there? A first line through an open slip: done. A line
  // that crosses the line already on a struck slip: cancelled (the X). Anything else: the ink fades away.
  function finish(pts) {
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const bb = { l: Math.min(...xs) - 12, r: Math.max(...xs) + 12, t: Math.min(...ys) - 12, b: Math.max(...ys) + 12 };
    let best = null;
    for (const el of W.view?.querySelectorAll("[data-wslip]") || []) {
      const box = boxOf(el), r = box.rect;
      if (r.right < bb.l || r.left > bb.r || r.bottom < bb.t || r.top > bb.b) continue;
      const loc = pts.map((p) => I.toLocal(p.x, p.y, box));
      if (!I.isStrike(loc, box.w, box.h)) continue;
      const s = I.strokeInfo(loc, box.w, box.h);
      const off = Math.hypot((s.chord.x1 + s.chord.x2) / 2 / box.w - 0.5, (s.chord.y1 + s.chord.y2) / 2 / box.h - 0.5);
      if (!best || off < best.off) best = { el, box, chord: s.chord, off };
    }
    if (!best) return false;
    const { el, box, chord } = best, id = el.dataset.wslip, st = stateOf(id);
    const n = I.norm(chord, box.w, box.h);
    if (st === "open") { mark(id, "done", [n]); paint(el, 0); return true; }
    if (st === "done") {
      const first = chordsFor(id, "done")[0];
      const line = I.clipToBox(I.denorm(first, box.w, box.h), box.w, box.h, 5);
      if (line && I.crosses(line, chord)) { mark(id, "cancelled", [first, n]); paint(el, 1); return true; }
    }
    return false;
  }

  function tap(el) {
    const id = el.dataset.wslip, st = stateOf(id);
    if (st !== "open") lift(el);
    else if (el.dataset.group === "you") autoMark(el, "done");
  }
  function onKey(e) {
    const el = e.target.closest?.("[data-wslip]");
    if (!el || e.ctrlKey || e.metaKey || e.altKey) return;
    const st = stateOf(el.dataset.wslip), k = e.key;
    let used = true;
    if (k === "Enter" || k === " ") st === "open" ? autoMark(el, "done") : lift(el);
    else if (k === "Delete" || k === "Backspace") { if (st !== "cancelled") autoMark(el, "cancelled"); }
    else if (k === "z" || k === "Z") { if (st !== "open") lift(el); }
    else used = false;
    if (used) { e.preventDefault(); e.stopPropagation(); }
  }
  function onClick(e) { // a screen reader's activation (no pointer): the same as a tap
    const el = e.target.closest?.("[data-wslip]");
    if (el && e.detail === 0) tap(el);
  }

  // A light tick where the device has one: vibrate on Android; on iPhone the system switch's own haptic.
  let switchEl = null;
  function tick() {
    if (globalThis.navigator?.vibrate) { navigator.vibrate(8); return; }
    if (!globalThis.matchMedia?.("(pointer: coarse)").matches) return;
    if (!switchEl?.isConnected) {
      switchEl = document.createElement("label");
      switchEl.className = "wt-haptic";
      switchEl.setAttribute("aria-hidden", "true");
      switchEl.innerHTML = '<input type="checkbox" switch tabindex="-1">';
      document.body.appendChild(switchEl);
    }
    switchEl.click();
  }

  const onResize = () => { size(); paintAll(); };
  const onOnline = () => deliver();
  const onVisible = () => { if (document.visibilityState === "visible") deliver(); };
  function mount() {
    unmount();
    W.view = $("#view");
    const v = W.view;
    if (!v) return;
    v.addEventListener("pointerdown", onDown);
    v.addEventListener("keydown", onKey);
    v.addEventListener("click", onClick);
    v.addEventListener("touchmove", onTouchMove, { passive: false });
    addEventListener("pointermove", onMove);
    addEventListener("pointerup", onUp);
    addEventListener("pointercancel", onCancel);
    addEventListener("resize", onResize);
    addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    canvas();
    paintAll();
    globalThis.document?.fonts?.ready?.then(() => paintAll()); // the hand font changes each slip's size once it lands
    W.timer = setInterval(() => { if (document.visibilityState === "visible" && !W.pen && !W.busy) load(); }, 30000);
    deliver();
  }
  function onCancel(e) { if (W.pen && e.pointerId === W.pen.id) abort(true); }
  function unmount() {
    clearInterval(W.timer);
    const v = W.view;
    if (v) {
      v.removeEventListener("pointerdown", onDown);
      v.removeEventListener("keydown", onKey);
      v.removeEventListener("click", onClick);
      v.removeEventListener("touchmove", onTouchMove);
    }
    globalThis.removeEventListener?.("pointermove", onMove);
    globalThis.removeEventListener?.("pointerup", onUp);
    globalThis.removeEventListener?.("pointercancel", onCancel);
    globalThis.removeEventListener?.("resize", onResize);
    globalThis.removeEventListener?.("online", onOnline);
    globalThis.document?.removeEventListener("visibilitychange", onVisible);
    W.canvas?.remove(); W.canvas = null;
    W.pen = null;
  }

  const count = () => R.waitCount({ items: items() });
  const homeLine = () => R.homeLine(count(), lang());
  return { render, mount, unmount, load, count, homeLine, deliver, pending: () => M.pending(W.marks) };
}
