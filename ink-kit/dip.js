/* The shared ink kit (see VERSION). */
"use strict";
(() => {
const VERSION = "0.3.3";
const MODES = ["on", "cheap", "off"];
const ATTR = "data-vk-dip";
const KIT_CONTROLS = [".vk-btn", ".vk-rec-disc", ".vk-tabs", ".vk-seg", ".vk-input", ".vk-chip", ".vk-row"];
const KIT_EDGES = [".vk-card", ".vk-plate", ".vk-panel"];
const SELECTOR = [...KIT_CONTROLS, ...KIT_EDGES, `[${ATTR}]`].join(", ");
const VOID = /^(INPUT|TEXTAREA|SELECT|IMG|HR|PROGRESS|METER|VIDEO|CANVAS|IFRAME|EMBED|OBJECT)$/;
// outward reach of the oil past the box, inward overlap onto the box edge, and the sprite padding (css px)
const LOOK = {
  control: { reach: 11, inset: 3.5, pad: 20 },
  edge: { reach: 8, inset: 2.5, pad: 16 },
};
const NEAR = 72;        // px: the pointer starts pulling oil out of a control this close to its edge
const EDGE_NEAR = 56;   // px: a container's edge only reacts this close
const BREAK = 190;      // px: a pulled strand longer than this snaps

// ============================================================================================ pure parts (tested)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Which kind of dip an element gets: "control", "edge" or null. The attribute wins over the kit class; an app's own
    selectors (mount options controls / edges) count like kit classes. */
function kindOf(el, extra) {
  if (!el || !el.getAttribute) return null;
  const a = el.getAttribute(ATTR);
  if (a === "none" || a === "off") return null;
  if (a === "edge") return "edge";
  if (a !== null) return "control";
  if (el.matches(KIT_EDGES.join(", ")) || (extra?.edges && el.matches(extra.edges))) return "edge";
  if (el.matches(KIT_CONTROLS.join(", ")) || (extra?.controls && el.matches(extra.controls))) return "control";
  return null;
}
/** Where the oil goes: "sib" (a void element, or one that clips or scrolls its overflow: the oil is a sibling laid over
    it, so it neither scrolls with the content nor gets clipped) or "child" (a layer inside the element). */
function placeOf(tag, overflowX, overflowY) {
  if (VOID.test(String(tag).toUpperCase())) return "sib";
  if ((overflowX && overflowX !== "visible") || (overflowY && overflowY !== "visible")) return "sib";
  return "child";
}
function lookOf(kind) { return LOOK[kind] || LOOK.control; }
/** One corner radius for the oil from computed border radii ("34px 38px", "50%", "999px"). */
function radiusOf(radii, w, h) {
  let sum = 0, n = 0;
  for (const v of radii) {
    const first = String(v || "0").trim().split(/\s+/)[0];
    const x = parseFloat(first) || 0;
    sum += first.endsWith("%") ? (x / 100) * w : x; n += 1;
  }
  return clamp(n ? sum / n : 0, 0, Math.min(w, h) / 2);
}
/** Signed distance from (x, y) (relative to the box centre) to a rounded box of half sizes hw, hh and radius r. */
function sdRRect(x, y, hw, hh, r) {
  const qx = Math.abs(x) - hw + r, qy = Math.abs(y) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
/** Nearest point on the rounded box's outline (relative to its centre), its outward normal and the signed distance. */
function nearestLocal(x, y, hw, hh, r) {
  r = Math.min(r, hw, hh);
  const cx = hw - r, cy = hh - r;
  const qx = clamp(x, -cx, cx), qy = clamp(y, -cy, cy);
  let dx = x - qx, dy = y - qy, L = Math.hypot(dx, dy), bx, by;
  if (L < 1e-6) {   // inside the inner rectangle: the nearest straight side
    if (hw - Math.abs(x) < hh - Math.abs(y)) { dx = Math.sign(x) || 1; dy = 0; bx = dx * hw; by = y; }
    else { dx = 0; dy = Math.sign(y) || 1; bx = x; by = dy * hh; }
    L = 1;
  } else {
    dx /= L; dy /= L;
    bx = qx + dx * r; by = qy + dy * r;
    if (r === 0 && Math.abs(x) <= hw && Math.abs(y) <= hh) {   // square corner region from inside
      if (hw - Math.abs(x) < hh - Math.abs(y)) { dx = Math.sign(x) || 1; dy = 0; bx = dx * hw; by = y; } else { dx = 0; dy = Math.sign(y) || 1; bx = x; by = dy * hh; }
    }
  }
  return { bx, by, nx: dx, ny: dy, d: sdRRect(x, y, hw, hh, r) };
}
/** The same in page coordinates: rect {x, y, w, h}. */
function nearestOnRect(rect, r, px, py) {
  const hw = rect.w / 2, hh = rect.h / 2, cx = rect.x + hw, cy = rect.y + hh;
  const o = nearestLocal(px - cx, py - cy, hw, hh, r);
  return { x: o.bx + cx, y: o.by + cy, nx: o.nx, ny: o.ny, d: o.d };
}
/** The control the pointer pulls on: controls first (within NEAR, inside counts as 0), else a container edge. */
function nearestHost(list, px, py, near = NEAR, edgeNear = EDGE_NEAR) {
  let best = -1, bd = Infinity, edge = -1, ed = Infinity;
  for (let i = 0; i < list.length; i += 1) {
    const h = list[i];
    if (!h || !h.rect || h.off) continue;
    const { x, y, w, h: hh } = h.rect;
    if (px < x - near || px > x + w + near || py < y - near || py > y + hh + near) continue;
    const d = sdRRect(px - x - w / 2, py - y - hh / 2, w / 2, hh / 2, Math.min(h.r || 0, w / 2, hh / 2));
    if (h.kind === "edge") { const a = Math.abs(d); if (a < edgeNear && a < ed) { ed = a; edge = i; } }
    else { const a = Math.max(0, d); if (a < near && (a < bd || (a === bd && h.rect.w * h.rect.h < list[best].rect.w * list[best].rect.h))) { bd = a; best = i; } }
  }
  return best >= 0 ? { i: best, d: bd } : edge >= 0 ? { i: edge, d: ed } : null;
}
/** A point at fraction u (0..1, clockwise from the top left straight) of the rounded box's outline, relative to the centre. */
function rrPointAt(u, hw, hh, r) {
  r = Math.min(r, hw, hh);
  const sx = 2 * (hw - r), sy = 2 * (hh - r), a = Math.PI * r / 2, P = 2 * sx + 2 * sy + 4 * a;
  let L = (((u % 1) + 1) % 1) * P;
  const arc = (ccx, ccy, phi0) => { const p = phi0 + L / r; return [ccx + r * Math.cos(p), ccy + r * Math.sin(p)]; };
  if (L < sx) return [-hw + r + L, -hh]; L -= sx;
  if (L < a) return arc(hw - r, -hh + r, -Math.PI / 2); L -= a;
  if (L < sy) return [hw, -hh + r + L]; L -= sy;
  if (L < a) return arc(hw - r, hh - r, 0); L -= a;
  if (L < sx) return [hw - r - L, hh]; L -= sx;
  if (L < a) return arc(-hw + r, hh - r, Math.PI / 2); L -= a;
  if (L < sy) return [-hw, hh - r - L]; L -= sy;
  return arc(-hw + r, -hh + r, Math.PI);
}
/** The inverse of rrPointAt: the fraction of the outline at boundary point (bx, by) with outward normal (nx, ny). */
function rrParamOf(bx, by, nx, ny, hw, hh, r) {
  r = Math.min(r, hw, hh);
  const cx = hw - r, cy = hh - r, sx = 2 * cx, sy = 2 * cy, a = Math.PI * r / 2, P = 2 * sx + 2 * sy + 4 * a, e = 1e-6;
  let L;
  if (r > 0 && Math.abs(bx) > cx + e && Math.abs(by) > cy + e) {
    if (bx > 0 && by < 0) L = sx + (Math.atan2(by + cy, bx - cx) + Math.PI / 2) * r;
    else if (bx > 0) L = sx + a + sy + Math.atan2(by - cy, bx - cx) * r;
    else if (by > 0) L = 2 * sx + 2 * a + sy + (Math.atan2(by - cy, bx + cx) - Math.PI / 2) * r;
    else { let p = Math.atan2(by + cy, bx + cx); if (p < 0) p += 2 * Math.PI; L = 2 * sx + 3 * a + 2 * sy + (p - Math.PI) * r; }
  } else if (ny < -0.5) L = clamp(bx + cx, 0, sx);
  else if (nx > 0.5) L = sx + a + clamp(by + cy, 0, sy);
  else if (ny > 0.5) L = sx + 2 * a + sy + clamp(cx - bx, 0, sx);
  else L = 2 * sx + 3 * a + sy + clamp(cy - by, 0, sy);
  return P > 0 ? ((L / P) % 1 + 1) % 1 : 0;
}
/** Rest motion: how many one-shot animations to start now, so that at most `cap` run at once (and never more than
    `perTick` start together, so they stagger). */
function toStart(live, running, cap, perTick = 3) { return Math.max(0, Math.min(perTick, Math.min(live, cap) - running)); }
// measured (README): each running one-shot costs main-thread time at every frame the page draws, so few run at once
const FLOWS = 3, DROPS = 1;
// frames in a rim picture (stacked top to bottom). A rest flow walks a control from the frame it shows to the next one and stays there
const FRAMES = 3;
/** Does the strand loop have a reason to run? */
function loopWanted(s) { return s.mode === "on" && !s.reduced && !s.hidden && !!(s.near || s.pressed || s.strands > 0 || s.drops > 0 || s.pins > 0); }
/** Do the CSS rest animations run? (dip.css says the same through html[data-vk-dip="on"] and the live class) */
function restMoves(s) { return s.mode === "on" && !s.reduced && !s.hidden; }
function normMode(m) { return MODES.includes(m) ? m : "on"; }

/** The control point of a strand's curve (a quadratic Bezier from the root to the tip), as drawStrand draws it. */
function strandCtrl(st) {
  const len = Math.hypot(st.tx - st.ax, st.ty - st.ay);
  return [st.ax + st.nx * len * 0.32 + (st.tx - st.ax) * 0.35, st.ay + st.ny * len * 0.32 + (st.ty - st.ay) * 0.35 + len * 0.12];
}
/** The box [x0, y0, x1, y1] a strand is painted in: a Bezier stays inside the hull of its root, control point and tip, plus
    the widest the oil gets (root bead, body, wobble). The overlay window and the label wipe use it. */
function strandBox(st) {
  const c = strandCtrl(st), m = Math.max(14, (st.w0 || 12) * 0.75 + 6);
  return [Math.min(st.ax, st.tx, c[0]) - m, Math.min(st.ay, st.ty, c[1]) - m, Math.max(st.ax, st.tx, c[0]) + m, Math.max(st.ay, st.ty, c[1]) + m];
}
/** The sprite scale for a box: the rim picture is W x 2H device pixels; keep that under `cap` (an iPhone's canvas limit is
    16.7 M pixels; a 1920x1080 panel at scale 2 is over it). Rounded down to 2 decimals so equal sizes share a key. */
function capScale(w, h, pad, s, cap = 8e6) {
  const W = w + 2 * pad, H = 2 * (h + 2 * pad), px = W * H * s * s;
  return px <= cap ? s : Math.max(0.25, Math.floor(Math.sqrt(cap / (W * H)) * 100) / 100);
}
/** The scrollable content box of a scroller in viewport coordinates (sc: its client rect, client offsets, scroll position and
    size; rtl: its content starts at the right). */
function scrollBox(sc) {
  const cx0 = sc.left + sc.clientLeft, cy0 = sc.top + sc.clientTop;
  const l = sc.rtl ? cx0 + sc.clientWidth - sc.scrollLeft - sc.scrollWidth : cx0 - sc.scrollLeft;
  const t = cy0 - sc.scrollTop;
  return { l, t, r: l + sc.scrollWidth, b: t + sc.scrollHeight };
}
/** The pad (css px) the oil layer may have on each side of a host: the full pad, cut back to the room the host has left before the end
    of the scrollable content. room: { l, t, r, b } or null; a side that cannot scroll (the left of an ltr box, the right of an rtl one)
    has Infinity there (roomOf), so every side with a finite room is cut and the host's own direction never matters. */
function padsFor(pad, room) {
  const cut = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(pad, Math.floor(v))) : pad);
  return { t: pad, b: cut(room?.b), l: cut(room?.l), r: cut(room?.r) };
}
/** Must the layer be clipped (and keep from scaling)? Yes when a side that can scroll has less room than the pad plus what the layer's
    own scaling adds there (the release spring is 1.055 across and 1.09 down; hover 1.022). A transform counts as scrollable overflow. */
function needsClip(pad, room, w, h) {
  if (!room) return false;
  const gx = Math.ceil(0.0275 * (w + 2 * pad)) + 1, gy = Math.ceil(0.045 * (h + 2 * pad)) + 1;
  return room.l < pad + gx || room.r < pad + gx || room.b < pad + gy;
}
/** The room a drip may use under a control: the free room to the next words (below) and the room left to the end of the scrollable
    content, less what the release spring (1.09 down) adds to the bead's place. Infinity = unknown. */
function dripRoom(below, roomB, h) {
  if (!Number.isFinite(roomB)) return below;
  return Math.min(below, roomB - (Math.ceil(0.09 * (h / 2 + 32)) + 2));
}
/** How far a drip's bead may fall, given the free room below its control (px, Infinity = unknown or plenty) and where the resting bead's
    bottom is under the control's bottom edge (d0). null = no drip at all (under 6 px of room, or the still drip does not fit). 2 px stay free
    below the bead, and 2 more for its stretch while it lets go. */
function dripFall(room, d0, full = 21) {
  if (!Number.isFinite(room)) return full;
  if (room < 6 || d0 + 6 > room - 2) return null;
  return clamp(room - 4 - d0, 0, full);
}
/** The sprite cache: key -> { url, drips, waiters, users }. A host uses one entry; an entry nobody uses is dropped. */
function cacheUse(map, key, h) {
  let c = map.get(key), made = false;
  if (!c) { c = { url: "", drips: [], waiters: new Set(), users: new Set() }; map.set(key, c); made = true; }
  c.users.add(h);
  return { c, made };
}
function cacheLeave(map, key, h, onEvict) {
  const c = map.get(key); if (!c) return;
  c.users.delete(h); c.waiters.delete(h);
  if (!c.users.size) { map.delete(key); if (onEvict) onEvict(c); }
}

// seeded noise for the oil
function hash2(ix, iy, seed) {
  let h = Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
function vnoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function rng(seed) { let s = (Math.imul(seed | 0, 2654435761) >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h); };

// ---- the light (0.3.3 "light"): a lamp sways over the oil. Every rim picture has LIGHT_K light pictures (the lamp at LIGHT_K places
// along the outline); dip.css cross-fades them in a chain of LIGHT_K shared groups, so the lit streak travels. A step moves the streak by
// less than its own length: the eye sees travel, not a shimmer.
const LIGHT_K = 8, LIGHT_AREA = 4e6, LIGHT_T = 4.4;
/** Where the lamp stands in each light picture (outline fractions c[0..K-1], an optional smaller second glint c2) and the streak's
    half width hw (css px). Some boxes have the lamp travel round (small ones), the others sway it back and forth over a stretch of the
    rim; speed is eased (never uniform); everything comes from the box's seed and size. */
function lightPath(per, seed, w, h, kind) {
  const R = rng((seed | 0) * 131 + Math.round(w) * 7 + Math.round(h) * 3 + (kind === "edge" ? 9 : 1));
  const K = LIGHT_K, dir = R() < 0.5 ? 1 : -1, u0 = R(), ph = R() * 6.283;
  // round 2 (black body, sparse light): n short glints spread round the rim (a long edge gets 2 to 4 with dark between them), each a
  // narrow window; all of them together light about a fifth of the rim at most. They travel (n > 1: each a 1/n of the round per cycle,
  // so after a cycle every glint stands where the next one stood) or sway round their own place.
  const n = per > 240 ? clamp(Math.round(per / 200), 2, 7) : 1;
  const round = R() < 0.72;
  const hw = clamp((0.11 * per) / n, 8, 50) * (0.85 + 0.25 * R());
  const A = Math.min(((0.3 * per) / n) * (0.85 + 0.3 * R()), 1.25 * hw) / per;   // a step stays shorter than the glint
  const c = [];
  for (let j = 0; j < K; j += 1) {
    const t = j / K, v = round ? u0 + (dir * (t + 0.03 * Math.sin(2 * Math.PI * t + ph))) / n : u0 + dir * A * Math.sin(2 * Math.PI * t + ph);
    c.push(((v % 1) + 1) % 1);
  }
  return { c, n, hw, round, dir };
}
/** The keyframes of a light group: a soft triangle two steps wide, so two neighbouring pictures always add up to one streak. */
function lightKeyframes() {
  const st = 100 / LIGHT_K, f = (v) => +v.toFixed(2);
  let css = `@keyframes vk-dip-l { 0% { opacity: 0; } ${f(st * 0.5)}% { opacity: .5; } ${f(st)}% { opacity: 1; } ${f(st * 1.5)}% { opacity: .5; } ${f(st * 2)}%, 100% { opacity: 0; } }\n`;
  for (let k = 0; k < LIGHT_K; k += 1) css += `.vk-dip-l${k} { --vk-dip-gd: ${(-(k * LIGHT_T) / LIGHT_K).toFixed(2)}s; }\n`;
  return css;
}

/** Paint the oil rim of one box: RGBA pixels of FRAMES (3) frames stacked top to bottom.
    spec: { w, h, r, kind, place, seed, dry, s }. Returns { W, H (one frame), data, pad, drips: [{ x, y }] (css px in
    the sprite box), ms }. Pure: no DOM. Inside the box, deeper than the inward overlap, every pixel is transparent. */
function paintRim(spec) {
  const it = paintRimSteps(spec);
  for (;;) { const r = it.next(); if (r.done) return r.value; }
}
/** The same, in steps: yields every few rows so a page can paint big containers across idle slices. */
function* paintRimSteps(spec) {
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  let ms = 0, tA = now();
  const kind = spec.kind === "edge" ? "edge" : "control";
  const look = lookOf(kind);
  const dry = !!spec.dry, s = spec.s || 1;
  const w = Math.max(1, spec.w), h = Math.max(1, spec.h), hw = w / 2, hh = h / 2, r = clamp(spec.r || 0, 0, Math.min(hw, hh));
  const pad = look.pad, reach = look.reach * (dry ? 0.75 : 1), inset = look.inset;
  const W = Math.max(1, Math.ceil((w + 2 * pad) * s)), H = Math.max(1, Math.ceil((h + 2 * pad) * s));
  const seed = (spec.seed | 0) + 1;
  const NF = FRAMES, ph = (f, o) => Math.sin((2 * Math.PI * f) / NF + o);   // the frames walk round a loop: A, B, C, A ...
  const R = rng(seed * 7919 + Math.round(w) * 31 + Math.round(h) * 17 + (kind === "edge" ? 5 : 0));
  const per = 2 * (w - 2 * r) + 2 * (h - 2 * r) + 2 * Math.PI * r;
  // beads along the rim (they swell and slide a little between frame A and frame B)
  // every bead creeps along the rim and swells and shrinks from frame to frame (a loop, so the walk never jumps back)
  const beads = Array.from({ length: NF }, () => []);
  const nb = Math.max(2, Math.round(per / (kind === "edge" ? 44 : 34)));
  for (let i = 0; i < nb; i += 1) {
    let u = R();
    if (rrPointAt(u, hw, hh, r)[1] < 0 && R() < 0.45) u = R();   // oil runs down: more beads on the lower half
    const br = (kind === "edge" ? 2.6 : 2.2) + R() * (kind === "edge" ? 4.2 : 4.2) * (dry ? 0.5 : 1);
    // frame A is the still and measured frame (0.3.1's); frames B and C, the skins, move further from it (0.3.2)
    const rd = R(), du = (dry ? 0 : (10 + rd * 10)) / per, du2 = (dry ? 0 : (12 + rd * 10)) / per, p1 = R() * 6.283, p2 = R() * 6.283;
    for (let f = 0; f < NF; f += 1) beads[f].push([...rrPointAt(u + (f ? du2 : du) * ph(f, p1), hw, hh, r), br * (dry ? 1 : 1 + (f ? 0.48 : 0.42) * ph(f, p2))]);
  }
  // short drips hanging from the bottom (outside placement only); the first one is where the animated drip falls from
  const hangs = Array.from({ length: NF }, () => []), drips = [];
  if (w >= 24) {
    const nh = kind === "edge" ? (w > 300 ? 3 : w > 140 ? 2 : 1) : (w > 50 ? 1 : 0) + (w > 130 ? 1 : 0) + (r >= Math.min(hw, hh) - 0.5 && w < 70 ? 1 : 0);
    const flat = Math.max(0, hw - r - 6);
    for (let i = 0; i < nh; i += 1) {
      const hx = flat > 4 ? (R() * 2 - 1) * flat * 0.9 : (R() - 0.5) * w * 0.3;
      const ax = Math.abs(hx), yb = ax <= hw - r ? hh : (hh - r) + Math.sqrt(Math.max(0, r * r - (ax - (hw - r)) ** 2));
      const lh = look.reach * (0.65 + R() * 0.55) * (dry ? 0.6 : 1), ww = 1.9 + R() * 1.3;
      // a hanging drip is shorter and slides a little in the other frames, never longer than in frame A: the room under a control is
      // measured for frame A's drip (dripFall), so no frame may reach lower
      const q1 = R() * 6.283, q2 = R() * 6.283;
      for (let f = 0; f < NF; f += 1) { const k = dry ? 0 : Math.abs(ph(f, q2) - ph(0, q2)) / 2; hangs[f].push(f === 0 ? [hx, yb, lh, ww] : [hx + (dry ? 0 : 1.3 * (ph(f, q1) - ph(0, q1))), yb, lh * (1 - 0.3 * k), ww * (1 - 0.08 * k)]); }
      drips.push({ x: hx + hw + pad, y: yb + hh + pad - 1 });
    }
  }
  const data = new Uint8ClampedArray(W * H * NF * 4);
  const S = new Float32Array(W * H), Hh = new Float32Array(W * H), RED = new Float32Array(W * H);
  // 0.3.3 "light": the outline place of every oil pixel of frame A (the moving light is a window along the outline)
  const wantLight = !dry && spec.light !== false;
  let JX = wantLight ? new Int32Array(W * H) : null, LT = null;
  const W0 = 4.6, base0 = kind === "edge" ? 0.5 : 0.36, sp0 = seed * 1.7;
  // the oil's thickness, pooling and red are a function of the place on the outline: tabled at half a pixel per step
  const NT = Math.max(16, Math.ceil(per / 0.5));
  const TT = new Float32Array(NT + 1), TR = new Float32Array(NT + 1), TTA = new Float32Array(NT + 1);
  let tmax = 0;
  const table = (f) => {
    const Bd = beads[f], ox = dry ? 0 : (f ? 1.5 : 1.2) * Math.cos((2 * Math.PI * f) / NF), oy = dry ? 0 : (f ? 1.5 : 1.2) * Math.sin((2 * Math.PI * f) / NF);
    const pool = dry ? 0.55 : 0.55 + 0.16 * ph(f, sp0);   // the bottom pool sags and draws back
    tmax = 0;
    for (let j = 0; j <= NT; j += 1) {
      const [bx, by] = rrPointAt(j / NT, hw, hh, r);
      const o = nearestLocal(bx * 0.999, by * 0.999, hw, hh, r);   // the outline normal there
      const n1 = vnoise(bx / 15 + ox, by / 15 + seed * 3.1 + oy, seed), n2 = vnoise(bx / 5.5 - ox * 0.8, by / 5.5 + seed * 1.7 + oy * 0.8, seed + 11);
      let bead = 0;
      for (let k = 0; k < Bd.length; k += 1) {
        const b = Bd[k], dx = bx - b[0], dy = by - b[1];
        if (Math.abs(dx) > b[2] * 3 || Math.abs(dy) > b[2] * 3) continue;
        bead += b[2] * 1.25 * Math.exp(-(dx * dx + dy * dy) / (b[2] * b[2]));
      }
      const sag = 0.82 + pool * Math.max(0, o.ny) - 0.24 * Math.max(0, -o.ny);
      TT[j] = reach * (base0 + 0.52 * n1 + 0.16 * n2) * sag + bead;
      // frame B is the hover look: its pool and beads on the lower half never hang lower than frame A's (the room under a control is
      // measured for frame A; a deeper pool in B plus the hover scale reached words 14 px under a hovered control)
      if (f === 0) TTA[j] = TT[j]; else TT[j] = Math.min(TT[j], TTA[j]);   // nowhere past frame A: B and C are laid over A as the moving skin
      tmax = Math.max(tmax, TT[j]);
      const rn = dry ? 0 : vnoise(bx / 9 + 40, by / 9 + seed * 2.3, seed + 29);
      TR[j] = rn > 0.9 ? (rn - 0.9) * 9 : 0;
    }
  };
  const nearIn = -inset - 2;
  // light: key from the upper left, a rim light from the lower right, the viewer straight on
  const nrm = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
  const L1 = nrm(-0.55, -0.83, 0.95), H1 = nrm(L1[0], L1[1], L1[2] + 1), L2 = nrm(0.62, 0.7, 0.55), H2 = nrm(L2[0], L2[1], L2[2] + 1);
  for (let f = 0; f < NF; f += 1) {
    const eo = dry ? 0 : 0.2 * ph(f, 1.3);   // the softbox streak slides along the oil from frame to frame
    S.fill(99); Hh.fill(0); RED.fill(0);
    const G = hangs[f];
    table(f);
    const far = tmax + 1, nearInF = nearIn;
    const Lk = Math.max(inset + 3, -nearInF) + 1;
    // the deep inside of the box (no oil, no halo) is skipped a row span at a time
    const skip = (py) => {
      const y = Math.abs((py + 0.5) / s - pad - hh);
      let X = -1;
      if (y < hh - r - Lk) X = hw - Lk; else if (y < hh - Lk) X = Math.min(hw - r, hw - Lk);
      if (X <= 0) return [W, -1];
      return [Math.floor((-X + pad + hw) * s - 0.5) + 1, Math.ceil((X + pad + hw) * s - 0.5) - 1];
    };
    for (let py = 0; py < H; py += 1) {
      if ((py & 7) === 7) { ms += now() - tA; yield; tA = now(); }
      const y = (py + 0.5) / s - pad - hh;
      const [k0, k1] = skip(py);
      for (let px = 0; px < W; px += 1) {
        if (px >= k0 && px <= k1) { px = k1; continue; }
        const x = (px + 0.5) / s - pad - hw;
        const d = sdRRect(x, y, hw, hh, r);
        let inHang = false;
        for (let k = 0; k < G.length && !inHang; k += 1) { const g = G[k]; if (Math.abs(x - g[0]) < g[3] + 4 && y > g[1] - 4 && y < g[1] + g[2] + g[3] + 4) inHang = true; }
        if ((d < nearInF || d > far) && !inHang) continue;
        const o = nearestLocal(x, y, hw, hh, r);
        const j = Math.round(rrParamOf(o.bx, o.by, o.nx, o.ny, hw, hh, r) * NT);
        let oil =Math.max(-inset - d, d - TT[j]);
        for (let k = 0; k < G.length; k += 1) {
          const g = G[k], dx = x - g[0];
          if (y < g[1] - 3) continue;
          const t = clamp((y - g[1]) / g[2], 0, 1);
          let dh = y <= g[1] + g[2] ? Math.abs(dx) - g[3] * (1 - 0.5 * t) : 99;
          dh = Math.min(dh, Math.hypot(dx, y - (g[1] + g[2])) - g[3] * 0.95);
          oil = smin(oil, dh, 2.4);
        }
        const i = py * W + px;
        S[i] = oil;
        if (JX) JX[i] = j;
        if (oil < 0) {
          const c = Math.min(-oil, W0) / W0;
          Hh[i] = W0 * Math.sqrt(1 - (1 - c) * (1 - c));
          RED[i] = TR[j] * c;
        }
      }
    }
    // light it
    const base = f * W * H * 4;
    for (let py = 0; py < H; py += 1) {
      if ((py & 15) === 15) { ms += now() - tA; yield; tA = now(); }
      const [k0, k1] = skip(py);
      for (let px = 0; px < W; px += 1) {
        if (px >= k0 && px <= k1) { px = k1; continue; }
        const i = py * W + px, sd = S[i];
        const a = sd < 1 ? clamp(-sd * s + 0.5, 0, 1) : 0;
        let sh = 0;
        if (a < 1) {
          // a soft dark halo round the oil (it sits on the page), never deep inside the box
          const x = (px + 0.5) / s - pad - hw, y = (py + 0.5) / s - pad - hh, d = sdRRect(x, y, hw, hh, r);
          if (d > -inset - 3 && d < reach + 9) {
            sh = 0.46 * (1 - smoothstep(reach * 0.5, reach + 8, d));
            if (d < -inset) sh *= clamp(1 - (-d - inset) / 2.5, 0, 1);
          }
        }
        const A = a + sh * (1 - a);
        if (A <= 0.003) continue;
        let cr = 0, cg = 0, cb = 0;
        if (a > 0) {
          const hl = px > 0 ? Hh[i - 1] : 0, hr = px < W - 1 ? Hh[i + 1] : 0, hu = py > 0 ? Hh[i - W] : 0, hd = py < H - 1 ? Hh[i + W] : 0;
          const gx = (hr - hl) * s / 2, gy = (hd - hu) * s / 2;
          const n = nrm(-gx * 1.15, -gy * 1.15, 1), nz = n[2];
          const dh1 = Math.max(0, n[0] * H1[0] + n[1] * H1[1] + nz * H1[2]), dh2 = Math.max(0, n[0] * H2[0] + n[1] * H2[1] + nz * H2[2]);
          const fres = Math.pow(1 - nz, 3);
          let g;
          if (dry) {
            const grain = hash2(px, py, seed + f) - 0.5;
            g = 0.075 + Math.pow(dh1, 9) * 0.13 + fres * 0.07 + grain * 0.035;
            cr = g * 1.0; cg = g * 0.95; cb = g * 0.88;
          } else {
            const rx = 2 * nz * n[0], ry = 2 * nz * n[1];
            const v = -ry * 0.8 - rx * 0.4;
            const env = smoothstep(0.42 + eo, 0.6 + eo, v) * (1 - smoothstep(0.8 + eo, 0.98 + eo, v)) * 0.14;
            // 0.3.3 light round 3: black oil, not mercury (the broad streak, the fresnel edge and the soft lobe were silver)
            g = 0.008 + Math.pow(dh1, 120) * 1.1 + Math.pow(dh1, 16) * 0.05 + Math.pow(dh2, 70) * 0.3 + env + fres * 0.1;
            g = Math.min(1, g);
            const red = RED[i];
            cr = g + red * 0.36; cg = g * (1 - red * 0.7); cb = g * (1 - red * 0.62) + red * 0.03;
          }
        }
        const k = base + i * 4, m = a / A;
        data[k] = clamp(cr * m * 255, 0, 255); data[k + 1] = clamp(cg * m * 255, 0, 255); data[k + 2] = clamp(cb * m * 255, 0, 255); data[k + 3] = A * 255;
      }
    }
    if (f === 0 && wantLight) {
      // ---- the light (0.3.3): LIGHT_K pictures of frame A's own oil lit by a lamp that moves along the outline. Only the slopes of the oil
      // that face the lamp light up (the outer ridge, beads, the pool's lip, a hanging drip), inside a soft window round the lamp's place.
      // Painted at 1/ls of the rim's scale (a soft wet light needs no more), white with alpha, nothing outside frame A's oil.
      const P = lightPath(per, seed, w, h, kind);
      const ls = Math.max(1, Math.ceil(Math.sqrt((W * H * LIGHT_K) / LIGHT_AREA))), LW = Math.ceil(W / ls), LH = Math.ceil(H / ls);
      LT = new Uint8ClampedArray(LW * LH * LIGHT_K * 4);
      const ACC = new Float32Array(LW * LH);
      const LAMP = [];
      for (let q = 0; q <= NT; q += 1) { const [bx, by] = rrPointAt(q / NT, hw, hh, r), o = nearestLocal(bx * 0.999, by * 0.999, hw, hh, r), L = nrm(o.nx, o.ny, 0.9); LAMP.push(nrm(L[0], L[1], L[2] + 1)); }
      for (let lf = 0; lf < LIGHT_K; lf += 1) {
        ACC.fill(0);
        const c0 = P.c[lf], hwid = P.hw, gn = P.n;
        for (let py = 0; py < H; py += 1) {
          if ((py & 15) === 15) { ms += now() - tA; yield; tA = now(); }
          const [k0, k1] = skip(py);
          for (let px = 0; px < W; px += 1) {
            if (px >= k0 && px <= k1) { px = k1; continue; }
            const i = py * W + px, sd = S[i];
            if (sd >= 1) continue;
            const a = clamp(-sd * s + 0.5, 0, 1);
            if (a <= 0) continue;
            const u = JX[i] / NT;
            let win = 0;
            for (let q = 0; q < gn; q += 1) { let du = Math.abs(u - c0 - q / gn); du -= Math.floor(du); du = Math.min(du, 1 - du); win = Math.max(win, 1 - smoothstep(hwid * 0.3, hwid, du * per)); }
            if (win <= 0.002) continue;
            const hl = px > 0 ? Hh[i - 1] : 0, hr = px < W - 1 ? Hh[i + 1] : 0, hu = py > 0 ? Hh[i - W] : 0, hd = py < H - 1 ? Hh[i + W] : 0;
            const n = nrm(-(hr - hl) * s / 2 * 1.15, -(hd - hu) * s / 2 * 1.15, 1);
            const Hk = LAMP[JX[i]], sp = Math.max(0, n[0] * Hk[0] + n[1] * Hk[1] + n[2] * Hk[2]);
            const thick = smoothstep(0.55, 0.95, TT[JX[i]] / Math.max(1e-3, tmax)) * smoothstep(0.4, 1, Hh[i] / W0);
            // a narrow hard glint (a lamp reflected in black oil): a bright core on the crest facing the lamp, a quick falloff into dark
            // grey, a small glint on a pool or a drip; the rest stays the black of the painted rim
            const g = Math.min(0.95, win * win * (1.45 * Math.pow(sp, 14) + 0.06 * Math.pow(sp, 6) + 0.35 * thick * Math.pow(sp, 18)));
            ACC[Math.floor(py / ls) * LW + Math.floor(px / ls)] += g * a;
          }
        }
        const b0 = lf * LW * LH * 4, q = 1 / (ls * ls);
        for (let i = 0; i < LW * LH; i += 1) { const v = ACC[i] * q; if (v > 0.003) { LT[b0 + i * 4] = 255; LT[b0 + i * 4 + 1] = 252; LT[b0 + i * 4 + 2] = 248; LT[b0 + i * 4 + 3] = Math.min(1, v) * 255; } }
      }
      LT = { W: LW, H: LH, K: LIGHT_K, data: LT, path: P.c };
      JX = null;
    }
  }
  ms += now() - tA;
  return { W, H, F: NF, data, pad, drips, ms, light: LT };
}

// ---- rest lobes (0.3.2, "alive 3"): every live control and edge carries 2 to 4 fat oil TONGUES in ONE shared overlay. A tongue is one
// painted shape (thin root, fat round end) lit with the rim's own light (a long streak along its lit slope, no white dot of its own), its
// root faded where it lies on the rim, over a still MENISCUS (a wide concave fillet of the same oil that joins it to the rim on both sides).
// The tongues sit in LOBE_G shared phase GROUPS: a group is one element with one endless transform animation (dip.css: vk-dip-g0 ..
// vk-dip-g11) that slides every tongue in it LOBE_D px along the group's direction and pulls it back, slow and heavy. Gravity: most
// directions point down (three phases straight down, two each down-left and down-right), a few sideways (creeping along a top edge or
// out of a side) and one up. A running animation costs main-thread time at every frame whatever it moves, so 12 groups cost the same
// on a page with 8 controls or 200.
const LOBE_G = 8, LOBE_D = 9, SKIN_G = 0;   // 0.3.3: the skins gave way to the light chain (LIGHT_K groups)
// [direction in degrees (0 = right, 90 = down), phase 0..1]: never two groups with the same direction and phase
const GROUPS = [[90, 0], [90, 0.5], [55, 0.27], [125, 0.73], [0, 0.15], [180, 0.62], [0, 0.88], [180, 0.4]];
// the tongues on screen at once: what the page pays per frame grows with them, so a crowded screen gets fewer per control (2 at least)
const LOBE_BUDGET = 240;
// A: half length of a tongue, B: the radius of its round end (css px, before the size factor); n: tongues per box at most
const LOBE = {
  control: { A: 6.5, B: 4.6, n: 4, min: 2 },
  edge: { A: 9.5, B: 6.4, n: 4, min: 3 },
  small: { A: 4.4, B: 3.2, n: 2, min: 1 },
};
const LOBE_SZ = [0.7, 1, 1.4];   // three sizes (up to 2.3 times): a box wears one big, the others smaller
/** The tongue size a box wears: a small control (under 34 px across) the small ones, so a 24 px ball is not drowned. */
const lobeKind = (kind, w, h) => (kind === "edge" ? "edge" : Math.min(w, h) < 34 ? "small" : "control");
const groupDir = (g) => { const a = (GROUPS[((g % LOBE_G) + LOBE_G) % LOBE_G][0] * Math.PI) / 180; return [+Math.cos(a).toFixed(6), +Math.sin(a).toFixed(6)]; };
/** A whole-number hash of a control (its size and its index on the page): placement and phase never come from Math.random(). */
const hostHash = (i, w, h) => Math.floor(hash2(i | 0, Math.round(w) * 7 + Math.round(h) * 131, 97) * 1e6);
/** The tongues of one box (w x h, radius r): [{ x, y (outline point, relative to the centre), nx, ny, g (group), sz (size index),
    r0 (where the root sits, along the normal), A, B, out (how far it reaches past the outline at its farthest), down (how far it
    reaches under the bottom edge) }]. Few, irregular, gathered low (gravity). below: the free room under the box (px; Infinity =
    plenty): a tongue that would reach the words below is left out. density < 1: a crowded screen, fewer per box. */
function lobesFor(w, h, r, kind, seed, below = Infinity, density = 1) {
  const lk = lobeKind(kind, w, h), L = LOBE[lk], hw = w / 2, hh = h / 2;
  r = clamp(r || 0, 0, Math.min(hw, hh));
  const per = 2 * (w - 2 * r) + 2 * (h - 2 * r) + 2 * Math.PI * r;
  const want = lk === "small" ? 2 : lk === "edge" ? (per > 1400 ? 4 : 3) : 2 + (per > 170 ? 1 : 0) + (per > 330 ? 1 : 0);
  const n = Math.max(L.min, Math.min(L.n, Math.round(want * Math.min(1, density))));
  const R = rng((seed | 0) * 977 + Math.round(w) * 13 + Math.round(h) * 7 + (kind === "edge" ? 3 : 0) + 1);
  const us = [], out = [];
  const gap = (u) => Math.min(...us.map((v) => { const d = Math.abs(u - v); return Math.min(d, 1 - d); }), 1);
  for (let i = 0; i < n; i += 1) {
    // the first one hangs from the bottom or a lower corner; the others mostly low too, one in three may creep on a side or the top
    let best = null, bs = -1;
    for (let k = 0; k < 10; k += 1) {
      const u = R(), [bx, by] = rrPointAt(u, hw, hh, r), o = nearestLocal(bx * 0.999, by * 0.999, hw, hh, r);
      const low = o.ny > 0.35, sc = (i === 0 ? (o.ny > 0.5 ? 2 : 0) : low ? 1.2 : R() < 0.33 ? 1 : 0.1) + Math.min(gap(u), 0.22) * 6 + R() * 0.4;
      if (sc > bs) { bs = sc; best = { u, bx, by, o }; }
    }
    const { u, bx, by, o } = best;
    us.push(u);
    // one tongue: group g, size sz; null when it would reach the words below
    const mk = (g, sz) => {
      const [dx, dy] = groupDir(g), dot = dx * o.nx + dy * o.ny, A = L.A * LOBE_SZ[sz], B = L.B * LOBE_SZ[sz];
      const r0 = dot < 0.4 ? 1.5 : -3.5;   // a creeping one lies on the rim band; an outward one roots inside the box's edge (it grows out of the rim)
      const reach = r0 + Math.max(0, dot) * (2 * A + LOBE_D) + B * Math.sqrt(Math.max(0, 1 - dot * dot));
      const tipY = by + o.ny * r0 + dy * (2 * A + LOBE_D) + 1 + (dy > 0.5 ? 0 : B);
      const down = Math.max(tipY, by + o.ny * r0 + B + 1) - hh + 2.5;   // + the soft halo round the oil (2.5 px), + the 1 px sag
      if (down > 0 && down + 2 > below) return null;
      return { x: bx, y: by, nx: o.nx, ny: o.ny, g, sz, r0, A, B, creep: dot < 0.4, out: reach, down: Math.max(0, down) };
    };
    // the groups that fit here: outward or sagging (at least 60 degrees toward the outside); and the creeping ones (along the rim)
    const cands = [], creep = [];
    for (let g = 0; g < LOBE_G; g += 1) {
      const [dx, dy] = groupDir(g), dot = dx * o.nx + dy * o.ny;
      if (dot >= 0.5) cands.push(g); else if (Math.abs(dot) < 0.4) creep.push(g);
    }
    // prefer the down-hanging ones low on the box; the box's hash picks the phase, so neighbours differ
    const pool = o.ny > 0.35 ? cands.filter((g) => groupDir(g)[1] > 0.5) : o.ny < -0.6 ? [] : cands;
    const list = pool.length ? pool : creep.length ? creep : cands;
    if (!list.length) continue;
    const pick = (l) => l[(Math.floor(R() * 1e6) + (seed | 0) + i * 5) % l.length];
    const g = pick(list), sz0 = i === 0 ? 2 : (R() < 0.34 ? 1 : 0);
    // what to try, in order: this tongue, smaller, then one creeping along the rim (needs no room)
    const alts = [];
    for (let sz = sz0; sz >= 0; sz -= 1) alts.push(mk(g, sz));
    if (creep.length) { const c = pick(creep); for (let sz = sz0; sz >= 0; sz -= 1) alts.push(mk(c, sz)); }
    const ok = alts.filter(Boolean);
    if (!ok.length) continue;
    out.push(Object.assign({}, ok[0], { alts: ok }));
  }
  return out;
}
// the rim's light (paintRim): black body, hard white studio highlights, a soft-box streak along the lit slope, a fresnel edge
function oilLight(n, gloss, streakK = 0) {
  const nrm = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
  const L1 = nrm(-0.55, -0.83, 0.95), H1 = nrm(L1[0], L1[1], L1[2] + 1), L2 = nrm(0.62, 0.7, 0.55), H2 = nrm(L2[0], L2[1], L2[2] + 1);
  const nz = n[2], dh1 = Math.max(0, n[0] * H1[0] + n[1] * H1[1] + nz * H1[2]), dh2 = Math.max(0, n[0] * H2[0] + n[1] * H2[1] + nz * H2[2]);
  const rx = 2 * nz * n[0], ry = 2 * nz * n[1], v = -ry * 0.8 - rx * 0.4;
  const env = smoothstep(0.42, 0.6, v) * (1 - smoothstep(0.8, 0.98, v)) * 0.5;
  // streak: a broad soft band on the slopes that face the key light (the rim's long highlight, not a dot)
  const face = -(n[0] * -0.55 + n[1] * -0.83) / Math.max(1e-6, Math.hypot(n[0], n[1])) * Math.min(1, Math.hypot(n[0], n[1]) * 3);
  const streak = streakK * smoothstep(-0.2, 0.75, -face) * smoothstep(0.08, 0.3, Math.hypot(n[0], n[1])) * (1 - smoothstep(0.75, 0.95, Math.hypot(n[0], n[1])));
  return Math.min(1, 0.012 + gloss * (Math.pow(dh1, 95) * 1.4 + Math.pow(dh1, 16) * 0.05 + Math.pow(dh2, 70) * 0.3 + env * 0.28 + Math.pow(1 - nz, 3) * 0.1 + streak));
}
/** Paint a shape of oil from its signed distance field f(u, v) -> [sd, fade] in a frame turned to the angle ang (u along it): a rounded
    bead-tube height field lit with the rim's light; fade (0..1) takes the alpha and the light away together (a root lying on the rim
    shows no edge). T: how deep the rounding goes (px). Returns { W (= H, device px), size (css px), data }. Pure. */
function paintOil(f, Rr, ang, s, gloss, T, halo = 2.5, streakK = 0.5) {
  const W = Math.ceil(2 * Rr * s), data = new Uint8ClampedArray(W * W * 4), ca = Math.cos(ang), sa = Math.sin(ang);
  const at = (x, y) => f(x * ca + y * sa, -x * sa + y * ca);
  const hgt = (x, y) => { const sd = at(x, y)[0]; if (sd >= 0) return 0; const c = Math.min(-sd, T) / T; return T * Math.sqrt(1 - (1 - c) * (1 - c)); };
  for (let py = 0; py < W; py += 1) for (let px = 0; px < W; px += 1) {
    const x = (px + 0.5) / s - W / s / 2, y = (py + 0.5) / s - W / s / 2;
    const [sd, fade] = at(x, y);
    const a = clamp(-sd * s + 0.5, 0, 1) * fade, sh = sd > 0 ? 0.42 * (1 - smoothstep(0, halo, sd)) * fade : 0, AA = a + sh * (1 - a);
    if (AA <= 0.003) continue;
    let g = 0;
    if (a > 0) {
      const e = 0.5, gx = (hgt(x + e, y) - hgt(x - e, y)) / (2 * e), gy = (hgt(x, y + e) - hgt(x, y - e)) / (2 * e);
      const l = Math.hypot(gx * 1.15, gy * 1.15, 1);
      g = oilLight([-gx * 1.15 / l, -gy * 1.15 / l, 1 / l], gloss * fade, streakK);
    }
    const i = (py * W + px) * 4, m = a / AA;
    data[i] = data[i + 1] = data[i + 2] = clamp(g * m * 255, 0, 255); data[i + 3] = AA * 255;
  }
  return { W, size: W / s, data };
}
/** A tongue: half length A, end radius B, pointing at ang; its local origin is its centre; the root (u = -A) fades out over 4 px. */
function paintTongue(A, B, ang, s = 2, gloss = 1) {
  const r1 = B * 0.5, h = 2 * A - B + 6 - r1, b = (r1 - B) / h, a = Math.sqrt(1 - b * b);
  const f = (u, v) => {
    // an uneven capsule from a thin circle behind the root (so the light sees no root edge) to the fat end at u = A - B
    const px = Math.abs(v), py = u + A + 6 - r1;
    const k = -b * px + a * py;
    const sd = k < 0 ? Math.hypot(px, py) - r1 : k > a * h ? Math.hypot(px, py - h) - B : a * px + b * py - r1;
    return [sd, smoothstep(-A, -A + 4.5, u)];
  };
  return paintOil(f, A + 3.5, ang, s, gloss, Math.max(2.2, B * 0.8));
}
/** A meniscus: the wide concave fillet that joins a tongue to the rim, along the outward normal ang; base half width 2.5 B on the rim,
    0.7 B where it meets the tongue's root (6 px out); its base fades into the rim. */
function paintMeniscus(B, ang, s = 2) {
  const top = 6, w0 = 2.5 * B, w1 = 0.7 * B;
  const f = (u, v) => {
    const t = clamp((u + 3) / (top + 3), 0, 1), hwid = w1 + (w0 - w1) * (1 - t) * (1 - t);
    const sd = Math.max(Math.abs(v) - hwid, u - top, -4 - u) * (1 / Math.sqrt(1 + ((w0 - w1) * 2 * (1 - t) / (top + 3)) ** 2));
    return [sd, smoothstep(-4, -1, u)];
  };
  return paintOil(f, Math.max(w0, top) + 3.5, ang, s, 0.9, 3);
}
/** The keyframes of the 12 shared groups (written into dip.css; a test checks they match): out slowly, a heavy sag at the end, back. */
function lobeKeyframes() {
  const f = (v) => +v.toFixed(2);
  let css = "";
  for (let g = 0; g < LOBE_G; g += 1) {
    const [dx, dy] = groupDir(g), X = dx * LOBE_D, Y = dy * LOBE_D;
    const t = 2.6 + ((g * 0.618) % 1) * 1.6, d = -(GROUPS[g][1] * t);
    css += `.vk-dip-g${g} { --vk-dip-gt: ${t.toFixed(2)}s; --vk-dip-gd: ${d.toFixed(2)}s; }\n`;
    css += `@keyframes vk-dip-g${g} { 0%, 4% { transform: translate3d(0, 0, 0); } 52% { transform: translate3d(${f(X * 0.8)}px, ${f(Y * 0.8)}px, 0); } 68% { transform: translate3d(${f(X)}px, ${f(Y + 1)}px, 0); } 100% { transform: translate3d(0, 0, 0); } }\n`;
  }
  // the skin groups: a second lit picture of every rim (frame C) fades in and out over frame A, so the skin itself moves (beads creep,
  // the pool sags, the streak slides) on every control even where no tongue sits
  for (let k = 0; k < SKIN_G; k += 1) {
    const t = 3.1 + ((k * 0.618 + 0.3) % 1) * 1.5, d = -(((k * 0.29 + 0.13) % 1) * t);
    css += `.vk-dip-s${k} { --vk-dip-gt: ${t.toFixed(2)}s; --vk-dip-gd: ${d.toFixed(2)}s; }\n`;
    css += `@keyframes vk-dip-s${k} { 0%, 8% { opacity: 0; } 46%, 60% { opacity: 1; } 100% { opacity: 0; } }\n`;
  }
  return css + lightKeyframes();
}

// ---- review fixes (0.3.3, lead 11): pure helpers the page part and the tests share
// our own layers: the lobe layer and the strand overlay (a change in or of them never changes the room around a control)
const isOwnLayer = (n) => !!n && n.nodeType === 1 && (n.classList.contains("vk-dip-lobes") || n.classList.contains("vk-dip-overlay"));
function ownLayerMutation(m) {
  if (m.type !== "childList") return false;
  const t = m.target;
  if (t && t.nodeType === 1 && (isOwnLayer(t) || (t.closest && t.closest(".vk-dip-lobes, .vk-dip-overlay")))) return true;
  const added = [...(m.addedNodes || [])], removed = [...(m.removedNodes || [])];
  return added.length + removed.length > 0 && added.every(isOwnLayer) && removed.every(isOwnLayer);
}
// what a rest tick does with a host: "hide" (something covers it), "keep" (same box, nothing to do), "build" (new box, or the cover went)
function lobStep(occl, key, lobKey, seen) {
  if (occl || key !== lobKey) { if (!seen) return "hide"; if (key === lobKey) return "keep"; return "build"; }
  return "keep";
}
const SNAP_K = 0.01, SNAP_D = 0.88;   // the tip is still 45 % out a quarter second after release and reaches the root at about 0.5 s, 6 % past it once (0.03 / 0.8 was home in 0.3 s: the judge read a blink)
// the release spring, one axis (the loop's own step at dt = 1): where the tip is after each frame, for the tests
// HOME: the strand goes the moment its tip is at the root (or has just passed it). A bead left waiting at the rim while the spring settled read as a grey blob; the rim's own swell (vk-dip-snap) is the overshoot the eye gets.
const SNAP_HOME = 2.5;
function snapSim(pull, frames = 80) { let x = pull, v = 0; const out = []; for (let f = 0; f < frames; f += 1) { v = (v + (0 - x) * SNAP_K) * SNAP_D; x += v; if (x < SNAP_HOME) break; out.push(x); } return out; }
const coveredKey = (key) => "covered|" + key;
// a host that is a text-entry field: the oil is wiped from its whole inner box (the typed value, a background icon)
const WIPE_TYPES = /^(text|search|email|url|tel|password|number|date|datetime-local|month|week|time)?$/i;   // text-like input types ("" = no type attribute = text)
// 0.3.3 (lead 11): only text-entry hosts (textarea, select, a text-like input) are wiped whole; every other host wipes its words and small pictures
const wipeWholeHost = (tag, type) => { const t = String(tag || "").toUpperCase(); return t === "TEXTAREA" || t === "SELECT" || (t === "INPUT" && WIPE_TYPES.test(String(type || ""))); };
// mount option light (default on): 0 / false = no travelling light at all; the light is also shown only in mode "on" and without reduced motion
const lightOption = (v) => !(v === 0 || v === false || v === "0");
const lightWantedOf = ({ light, mode, reduced }) => lightOption(light) && mode === "on" && !reduced;
const textKeyOf = (w, h, len) => `${w.toFixed(0)}x${h.toFixed(0)}:${len}`;

const math = { ownLayerMutation, lobStep, coveredKey, SNAP_K, SNAP_D, SNAP_HOME, snapSim, wipeWholeHost, lightOption, lightWantedOf, textKeyOf, SKIN_G, LIGHT_K, LIGHT_T, lightPath, lightKeyframes, lobeKind, LOBE_BUDGET, lobesFor, paintTongue, paintMeniscus, hostHash, GROUPS, lobeKeyframes, groupDir, LOBE, LOBE_G, LOBE_D, dripFall, dripRoom, needsClip, strandCtrl, strandBox, capScale, scrollBox, padsFor, cacheUse, cacheLeave, kindOf, placeOf, lookOf, radiusOf, sdRRect, nearestLocal, nearestOnRect, nearestHost, rrPointAt, rrParamOf, loopWanted, restMoves, normMode, toStart, FLOWS, DROPS, FRAMES, paintRim, paintRimSteps, NEAR, EDGE_NEAR, BREAK, LOOK, SELECTOR };

// ============================================================================================ the page part
let instance = null;

function createDip(options) {
  const opt = Object.assign({ mode: null, root: null, scale: 2, controls: "", edges: "", flows: FLOWS, drops: DROPS }, options || {});   // the default root (the body) is read when the dip is built: mount may run in <head>
  const extra = { controls: opt.controls || "", edges: opt.edges || "" };
  const PICK = [SELECTOR, extra.controls, extra.edges].filter(Boolean).join(", ");
  const html = document.documentElement;
  const S = {
    mode: normMode(opt.mode || html.getAttribute(ATTR) || "on"),
    hosts: [], byEl: new Map(), cache: new Map(), queue: [], idle: 0,
    strands: new Map(), drops: [], pointer: null, pressed: null, near: null,
    running: false, raf: 0, last: 0, dirty: true, protect: [], box: null, dropping: new Map(), restT: 0,
    io: null, ro: null, mo: null, built: false, rescanT: 0, roT: 0, roLast: 0, roPend: new Set(), remT: 0, remLast: 0, docW: -1, docH: -1, allT: 0, followT: 0, waitDom: null, grave: [], graveT: 0, dpr: 0, AREA: 8e6,
    stats: { measures: 0, followRuns: 0, followMs: 0, sprites: 0, spriteMs: 0, loopFrames: 0, loopMs: 0, frames: [] },
    hidden: document.visibilityState === "hidden",
    reduced: !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  };
  const RM = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const DPR = () => Math.min(window.devicePixelRatio || 1, 1.5);
  let overlay = null, g = null, work = null, lightWork = null;

  // ---------------------------------------------------------------------------------------- hosts
  function scan() {
    const seen = new Set(), fresh = [];
    const els = opt.root.querySelectorAll(PICK);
    for (const el of els) {
      if (el.closest(`[${ATTR}="none"]`)) continue;
      const kind = kindOf(el, extra);
      if (!kind) continue;
      seen.add(el);
      if (!S.byEl.has(el)) fresh.push([el, kind]);
    }
    for (const h of [...S.hosts]) if (!seen.has(h.el) || !h.el.isConnected) dropHost(h);
    addHosts(fresh);
    S.dirty = true;
  }
  // new hosts together: read every style first, then write the classes, then measure them as one batch
  function addHosts(list) {
    if (!list.length) return;
    const info = list.map(([el]) => { const cs = getComputedStyle(el); return { ox: cs.overflowX, oy: cs.overflowY, pos: cs.position, z: cs.zIndex }; });
    const added = [];
    list.forEach(([el, kind], i) => {
      const f = info[i], place = placeOf(el.tagName, f.ox, f.oy);
      const h = { el, kind, place, span: null, key: "", clKey: "", w: 0, h: 0, r: 0, rect: null, live: false, seed: S.hosts.length % 3, setPos: false, dry: false, pin: el.getAttribute("data-vk-dip-show"),
        fixed: f.pos === "fixed", z: f.z === "auto" ? "" : f.z, hadClass: el.hasAttribute("class"), pads: null };
      S.hosts.push(h); S.byEl.set(el, h);
      if (place !== "sib" && f.pos === "static") { el.classList.add("vk-dip-pos"); h.setPos = true; }
      el.classList.add("vk-dip-host");
      S.ro?.observe(el); S.io?.observe(el);
      added.push(h);
    });
    measureMany(added);
  }
  function dropHost(h) {
    if (S.near === h) setNear(null);
    if (S.pressed === h) S.pressed = null;
    for (const [k, st] of S.strands) if (st.h === h) S.strands.delete(k);
    clearTimeout(h.relT);
    if (h.key) cacheLeave(S.cache, h.key, h, evict);
    h.span?.remove(); h.span = null;
    h.el.classList.remove("vk-dip-host", "vk-dip-hover"); if (h.setPos) h.el.classList.remove("vk-dip-pos");
    if (!h.hadClass && !h.el.getAttribute("class")) h.el.removeAttribute("class");   // no empty class="" left behind
    S.ro?.unobserve(h.el); S.io?.unobserve(h.el);
    S.dropping.delete(h); hideLobes(h);
    S.byEl.delete(h.el); S.hosts.splice(S.hosts.indexOf(h), 1);
  }
  function isDry(el) { return !!(el.disabled || el.getAttribute("aria-disabled") === "true" || el.matches(":disabled")); }

  // A batch of hosts is measured in three steps so the browser lays the page out twice, not once per host: (1) fold the batch's
  // layers into their hosts' boxes (their own overhang must not count as the page's extent), (2) read everything, unfold, (3) write
  // everything. Folded, not hidden: display: none would cancel the running rest animations and start them again from 0 (a page whose
  // text changes every second, a clock or a status line, re-measures every second: its oil never got past the first 4 % of a flow).
  function measureMany(list) {
    list = list.filter((h) => S.byEl.get(h.el) === h);
    if (!list.length) return;
    S.stats.measures += 1;
    const fold = list.filter((h) => h.span && h.span.isConnected && !h.span.hidden);
    for (const h of fold) h.span.classList.add("vk-dip-measure");
    const scr = new Map();
    let reads;
    try { reads = list.map((h) => readHost(h, scr)); } finally { for (const h of fold) h.span.classList.remove("vk-dip-measure"); }   // a throw never leaves a layer folded
    let placed = false;
    list.forEach((h, i) => { if (writeHost(h, reads[i])) placed = true; });
    if (placed) placeSibs();
  }
  const measure = (h) => measureMany([h]);
  function readHost(h, scr) {
    const el = h.el, w = el.offsetWidth, hgt = el.offsetHeight;
    if ((w < 8 && hgt < 8) || !el.getClientRects().length) return null;
    const cs = getComputedStyle(el);
    const r = { w, hgt, fixed: cs.position === "fixed", pos: cs.position, z: cs.zIndex === "auto" ? "" : cs.zIndex, rtl: cs.direction === "rtl",
      place: placeOf(el.tagName, cs.overflowX, cs.overflowY),   // a panel scrolls on the desk and not on a phone
      radii: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius], dry: isDry(el), room: null, at: null };
    r.below = belowOf(el, scr);
    if (!r.fixed) { r.room = roomOf(el, scr); r.below = dripRoom(r.below, r.room.b, hgt); }
    if (r.place === "sib") r.at = whereOf(el, r.fixed);
    return r;
  }
  // the free room under a control (px): up to the next thing that holds words or clips: the following siblings of the control and of each
  // ancestor up to the body (a button that is the last child of a wrapper has its words in the wrapper's next sibling), a clipping
  // ancestor, a [data-vk-protect] box within 30 px. Infinity = nothing near. Drips stay inside it.
  let rng = null;
  const clips = (v) => v !== "visible" && v !== "clip";
  function belowOf(el, scr) {
    const b = el.getBoundingClientRect(), x0 = b.left - 4, x1 = b.right + 4;
    let room = Infinity, budget = 16;
    const take = (r) => { if (r.width > 0 && r.height > 0 && r.top >= b.bottom - 1 && r.left < x1 && r.right > x0) room = Math.min(room, r.top - b.bottom); };
    const rects = scr.rc || (scr.rc = new Map());
    const sibs = (n) => {
      for (; n && budget > 0; n = n.nextSibling, budget -= 1) {
        if (n.nodeType === 1) { if (!n.classList.contains("vk-dip")) { let r = rects.get(n); if (!r) rects.set(n, (r = n.getBoundingClientRect())); take(r); } }
        else if (n.nodeType === 3 && n.nodeValue.trim()) { rng = rng || document.createRange(); rng.selectNodeContents(n); take(rng.getBoundingClientRect()); }
      }
    };
    sibs(el.nextSibling);
    const ov = scr.ov || (scr.ov = new Map());
    for (let a = el.parentElement, i = 0; a && a !== document.body && a !== document.documentElement && i < 8; a = a.parentElement, i += 1) {
      let c = ov.get(a);
      if (c === undefined) { c = clips(getComputedStyle(a).overflowY) ? a.getBoundingClientRect().bottom : null; ov.set(a, c); }
      if (c !== null) room = Math.min(room, c - b.bottom);
      sibs(a.nextSibling);
    }
    if (!scr.prot) scr.prot = [...opt.root.querySelectorAll("[data-vk-protect]")].slice(0, 300).map((e) => e.getBoundingClientRect());
    for (const r of scr.prot) if (r.top < b.bottom + 30) take(r);
    return Math.max(0, room);
  }
  // how far the host is from the end of every scrollable box around it (viewport px). Only the sides a box can scroll to count: the right
  // of an ltr box, the left of an rtl one (each box by its own direction), and the bottom; the other sides stay Infinity. For the page
  // itself Chromium takes the side from the body's direction (measured: html dir=ltr, body dir=rtl scrolls to the left) and the spec from
  // html's: where they differ both sides are cut (a cut on a side that cannot scroll costs nothing). A fixed ancestor
  // ends the walk (what is inside it adds no page scroll); the body is a scroller only when html does not take its overflow, and the
  // page itself is not counted when html is overflow: hidden / clip.
  const FIXED = { fixed: true };
  function roomOf(el, scr) {
    const b = el.getBoundingClientRect(), room = { l: Infinity, t: Infinity, r: Infinity, b: Infinity };
    const take = (sb) => {
      if (sb.rtl || sb.both) room.l = Math.min(room.l, b.left - sb.l);
      if (!sb.rtl || sb.both) room.r = Math.min(room.r, sb.r - b.right);
      room.b = Math.min(room.b, sb.b - b.bottom);
    };
    const de = document.documentElement;
    if (!scr.html) {
      const hc = getComputedStyle(de), hid = (v) => v === "hidden" || v === "clip";
      scr.html = { visible: !clips(hc.overflowX) && !clips(hc.overflowY), still: hid(hc.overflowX) && hid(hc.overflowY), rtl: hc.direction === "rtl", both: !!document.body && (getComputedStyle(document.body).direction === "rtl") !== (hc.direction === "rtl") };
    }
    const box = (a, cs) => { const q = a.getBoundingClientRect(), rtl = cs.direction === "rtl"; return { ...scrollBox({ left: q.left, top: q.top, clientLeft: a.clientLeft, clientTop: a.clientTop, clientWidth: a.clientWidth, clientHeight: a.clientHeight, scrollLeft: a.scrollLeft, scrollTop: a.scrollTop, scrollWidth: a.scrollWidth, scrollHeight: a.scrollHeight, rtl }), rtl }; };
    let fixed = false;
    for (let a = el.parentElement; a && a !== de; a = a.parentElement) {
      let sb = scr.get(a);
      if (sb === undefined) {
        const cs = getComputedStyle(a);
        if (cs.position === "fixed") sb = FIXED;
        else if (a === document.body && scr.html.visible) sb = null;   // the body's overflow went to the viewport
        else if (!clips(cs.overflowX) && !clips(cs.overflowY)) sb = null;
        else sb = box(a, cs);
        scr.set(a, sb);
      }
      if (sb === FIXED) { fixed = true; break; }
      if (sb) take(sb);
    }
    if (!fixed && !scr.html.still) {
      let rb = scr.get(document);
      if (!rb) {
        const se = document.scrollingElement || de;
        rb = { ...scrollBox({ left: 0, top: 0, clientLeft: 0, clientTop: 0, clientWidth: de.clientWidth, clientHeight: de.clientHeight, scrollLeft: se.scrollLeft, scrollTop: se.scrollTop, scrollWidth: se.scrollWidth, scrollHeight: se.scrollHeight, rtl: scr.html.rtl }), rtl: scr.html.rtl, both: scr.html.both };
        scr.set(document, rb);
      }
      take(rb);
    }
    return room;
  }
  // the layer goes back where it belongs (after a wipe of the host's content, or when a measure finds it gone)
  function attach(h) {
    const sp = h.span;
    if (!sp || sp.isConnected || !h.el.isConnected) return;
    if (h.place === "sib") h.el.after(sp); else h.el.append(sp);
  }
  // returns true when it changed something a sibling layer's place depends on
  function writeHost(h, r) {
    if (!r) { if (h.span) h.span.hidden = true; return false; }
    let moved = false;
    const el = h.el;
    h.fixed = r.fixed; h.z = r.z;
    if (r.place !== h.place) {
      if (h.key) cacheLeave(S.cache, h.key, h, evict);
      h.span?.remove(); h.span = null; h.key = ""; h.clKey = ""; h.place = r.place;
      if (r.place === "sib" && h.setPos) { el.classList.remove("vk-dip-pos"); h.setPos = false; moved = true; }
    }
    if (h.place === "child" && r.pos === "static" && !h.setPos) { el.classList.add("vk-dip-pos"); h.setPos = true; moved = true; }
    if (h.span && !h.span.isConnected) attach(h);   // the app wrote textContent / innerHTML: the same layer goes back in
    const rad = Math.round(radiusOf(r.radii, r.w, r.hgt));
    const look = lookOf(h.kind);
    if (!h.span) {
      const sp = document.createElement("span");
      sp.className = "vk-dip"; sp.setAttribute("aria-hidden", "true");
      sp.dataset.kind = h.kind; sp.dataset.place = h.place;
      sp.innerHTML = '<i class="vk-dip-a"></i><i class="vk-dip-b"></i><i class="vk-dip-run"></i><i class="vk-dip-ring"></i>';
      sp.addEventListener("animationend", (e) => {
        if (e.animationName === "vk-dip-bead") { endDrop(h); rest(); }
      });
      sp.__vkDipHost = h;
      if (h.place === "sib") { sp.classList.add("vk-dip--sib"); el.after(sp); } else el.append(sp);
      h.span = sp; h.clKey = "";
      if (h.live) sp.classList.add("vk-dip-live");
    }
    const sp = h.span; sp.hidden = false;
    const pads = padsFor(look.pad, r.room);
    // words closer under a control than the rim's pool and hangs reach (about 12 px): the layer is cut 2 px above them (0.3.2)
    if (h.kind === "control" && Number.isFinite(r.below) && r.below < 16) pads.b = Math.min(pads.b, Math.max(0, Math.floor(r.below - 2)));
    const cut = pads.t < look.pad || pads.r < look.pad || pads.b < look.pad || pads.l < look.pad || needsClip(look.pad, r.room, r.w, r.hgt);
    h.pads = pads; h.below = r.below;
    sp.style.setProperty("--vk-dip-pad", `${look.pad}px`);
    sp.style.setProperty("--vk-dip-reach", `${look.reach}px`);
    sp.style.setProperty("--vk-dip-r", `${rad}px`);
    sp.style.setProperty("--vk-dip-diag", `${Math.ceil(Math.hypot(r.w, r.hgt) + 2 * look.pad)}px`);
    const clKey = (cut ? `${pads.t}|${pads.r}|${pads.b}|${pads.l}` : "") + "~" + (r.below < 80 ? Math.round(r.below) : "");
    if (cut) {
      sp.dataset.clamp = "";
      sp.style.setProperty("--vk-dip-ct", `${pads.t}px`); sp.style.setProperty("--vk-dip-cr", `${pads.r}px`);
      sp.style.setProperty("--vk-dip-cb", `${pads.b}px`); sp.style.setProperty("--vk-dip-cl", `${pads.l}px`);
      sp.style.setProperty("--vk-dip-bw", `${r.w + 2 * look.pad}px`); sp.style.setProperty("--vk-dip-bh", `${r.hgt + 2 * look.pad}px`);
      sp.style.setProperty("--vk-dip-bx", `${pads.l - look.pad}px`); sp.style.setProperty("--vk-dip-by", `${pads.t - look.pad}px`);
    } else {
      delete sp.dataset.clamp;
      for (const p of ["ct", "cr", "cb", "cl", "bw", "bh", "bx", "by"]) sp.style.removeProperty(`--vk-dip-${p}`);
    }
    if (h.place === "sib") put(h, r.at);
    if (r.dry) sp.dataset.dry = ""; else delete sp.dataset.dry;
    const s0 = Math.min(window.devicePixelRatio || 1, opt.scale), s = capScale(r.w, r.hgt, look.pad, s0, S.AREA);
    h.tlen = (h.el.textContent || "").length;
    const lt = lightWanted() || h.lt ? 1 : 0; h.lt = lt;   // sticky: a host that has its light pictures keeps them (going to cheap repaints nothing)   // lead 11: cheap mode and reduced motion never show the light, so its 8 pictures are not painted (they are, once, when the mode turns on)
    const key = `${h.kind}|${h.place}|${r.w}|${r.hgt}|${rad}|${h.seed}|${r.dry ? 1 : 0}|${s}|${lt}`;
    h.w = r.w; h.h = r.hgt; h.r = rad; h.dry = r.dry;
    if (key === h.key) {
      if (clKey !== h.clKey) { h.clKey = clKey; const c = S.cache.get(key); if (c && c.url) apply(h, c); }
      return moved;
    }
    if (h.key) cacheLeave(S.cache, h.key, h, evict);
    h.key = key; h.clKey = clKey;
    sprite(key, { w: r.w, h: r.hgt, r: rad, kind: h.kind, place: h.place, seed: h.seed, dry: r.dry, s, light: !!lt }, h);
    return moved;
  }
  // a sibling layer sits on its host's box: the same offset parent (absolute), or the viewport for a fixed host (a panel)
  const whereOf = (el, fixed) => {
    if (fixed) { const b = el.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; }
    return [el.offsetLeft, el.offsetTop, el.offsetWidth, el.offsetHeight];
  };
  const put = (h, a) => {
    const pad = lookOf(h.kind).pad, p = h.pads || { t: pad, r: pad, b: pad, l: pad };
    h.at = a;
    Object.assign(h.span.style, { position: h.fixed ? "fixed" : "", zIndex: h.z, left: `${a[0] - p.l}px`, top: `${a[1] - p.t}px`, width: `${a[2] + p.l + p.r}px`, height: `${a[3] + p.t + p.b}px` });
  };
  // a sibling layer follows its host when the host moves without resizing (a layout change elsewhere): every rest tick (450 ms), after
  // a batch of DOM changes and after a transition ends, the on-screen sibling hosts are read in one batch and only a moved one is written.
  // At rest that is one read of a few offsets (nothing is dirty, so no layout).
  function followSibs() {
    if (!S.built || S.hidden) return;
    const t0 = performance.now();
    const sib = S.hosts.filter((h) => h.place === "sib" && h.live && h.span && !h.span.hidden);
    if (sib.length) {
      const at = sib.map((h) => whereOf(h.el, h.fixed));
      sib.forEach((h, i) => { const a = at[i], o = h.at; if (!o || a[0] !== o[0] || a[1] !== o[1] || a[2] !== o[2] || a[3] !== o[3]) put(h, a); });
    }
    S.stats.followRuns += 1; S.stats.followMs += performance.now() - t0;
  }
  // The room to the end of the scroll and the room under a control are read when a layer is measured. A later change (a footer goes, a line of
  // text appears under a control, a box shrinks) is caught here: every host is measured again in one batch (a layer below the fold adds scroll
  // size too), at most once per 500 ms.
  function queueRemeasure(delay) {
    if (S.remT || !S.built) return;
    S.remT = setTimeout(runRemeasure, Math.max(delay, S.remLast + 500 - performance.now()));
  }
  function runRemeasure() {
    S.remT = 0;
    if (!S.built) return;
    S.remLast = performance.now();
    measureMany(S.hosts);
    const se = document.scrollingElement || html;
    S.docW = se.scrollWidth; S.docH = se.scrollHeight;
  }
  // on the rest tick: the page got a different scroll size (CSS or content changed without a DOM change we saw) -> measure again
  function checkDoc() {
    if (!S.built || S.hidden) return;
    const se = document.scrollingElement || html, w = se.scrollWidth, hh = se.scrollHeight;
    if (S.docW < 0) { S.docW = w; S.docH = hh; return; }
    if (w !== S.docW || hh !== S.docH) { S.docW = w; S.docH = hh; queueRemeasure(60); }
  }
  const queueFollow = () => { if (!S.followT) S.followT = setTimeout(() => { S.followT = 0; followSibs(); }, 60); };
  function placeSibs() {
    const sib = S.hosts.filter((h) => h.place === "sib" && h.span && !h.span.hidden);
    const at = sib.map((h) => whereOf(h.el, h.fixed));   // read all, then write all
    sib.forEach((h, i) => put(h, at[i]));
  }

  // ---------------------------------------------------------------------------------------- sprites (painted in idle time, cached by size)
  function sprite(key, spec, h) {
    const { c, made } = cacheUse(S.cache, key, h);
    if (made) { S.queue.push([key, spec]); kick(); }
    if (c.url) apply(h, c); else c.waiters.add(h);
  }
  // an entry nobody uses any more: its picture goes after a moment (a layer may still be showing it for a frame or two)
  function evict(c) {
    if (c.light) { S.grave.push(c.light); c.light = ""; }
    if (!c.url) return;
    S.grave.push(c.url); c.url = "";
    if (!S.graveT) S.graveT = setTimeout(() => { S.graveT = 0; for (const u of S.grave.splice(0)) URL.revokeObjectURL(u); }, 2500);
  }
  function apply(h, c) {
    if (!h.span || !h.key || S.cache.get(h.key) !== c) return;
    // set as plain inline images, not through a custom property: a url() inside var() is parsed again at every style
    // recalculation of the element, and an animated layer is recalculated at every frame
    const img = `url("${c.url}")`;
    for (const el of h.span.querySelectorAll(".vk-dip-a, .vk-dip-b")) el.style.backgroundImage = img;
    const run = h.span.querySelector(".vk-dip-run");
    if (run) { run.style.webkitMaskImage = img; run.style.maskImage = img; }
    for (const d of h.span.querySelectorAll(".vk-dip-drip")) d.remove();
    // the rim shows frame A at rest (frame B is the hover look); the rest motion is the lobes (layoutLobes)
    setFrame(h, 0); h.lobKey = ""; queueLobes();
    {
      // the picture's drips hang past the bottom of the box: on a layer cut back at the bottom there is no room for them
      const pad = lookOf(h.kind).pad, p0 = h.pads || { t: pad, l: pad, b: pad };
      const max = p0.b < pad ? 0 : h.kind === "edge" ? 3 : 1;
      c.drips.slice(0, max).forEach((p, i) => {
        const fall = dripFall(h.below ?? Infinity, p.y + 12 - pad - h.h);   // words under the control: a shorter fall, or none
        if (fall === null) return;
        const b = document.createElement("b"); b.className = "vk-dip-drip";
        if (fall < 21) b.style.setProperty("--vk-dip-fall", `${fall.toFixed(1)}px`);
        b.style.marginLeft = `${(p.x - 3 - (pad - p0.l)).toFixed(1)}px`; b.style.marginTop = `${(p.y - (pad - p0.t)).toFixed(1)}px`;
        b.style.setProperty("--vk-dip-dd", `${(4.2 + Math.random() * 2.4).toFixed(2)}s`);
        h.span.append(b);
      });
    }
    h.span.dataset.ready = "";
  }
  const ric = window.requestIdleCallback ? (f) => window.requestIdleCallback(f, { timeout: 120 }) : (f) => setTimeout(() => f({ timeRemaining: () => 8 }), 16);
  const cic = window.cancelIdleCallback ? (i) => window.cancelIdleCallback(i) : (i) => clearTimeout(i);
  function kick() { if (!S.idle && S.queue.length) S.idle = ric(drain); }
  function drain(dl) {
    S.idle = 0;
    const t0 = performance.now();
    const budget = Math.max(4, Math.min(10, dl.timeRemaining ? dl.timeRemaining() : 8));
    // on-screen controls first
    while (S.queue.length && performance.now() - t0 < budget) {
      if (!S.queue[0][2]) {
        const li = S.queue.findIndex((j) => { const c = S.cache.get(j[0]); return c && [...c.waiters].some((h) => h.live); });
        if (li > 0) S.queue.unshift(S.queue.splice(li, 1)[0]);
      }
      const job = S.queue[0], key = job[0];
      const c = S.cache.get(key);
      if (!c || c.url || !c.users.size) { S.queue.shift(); continue; }   // nobody wants it (or an older job already painted it)
      if (!job[2]) job[2] = paintRimSteps(job[1]);
      let step;
      do step = job[2].next(); while (!step.done && performance.now() - t0 < budget);
      if (!step.done) break;
      S.queue.shift();
      const p = step.value;
      S.stats.sprites += 1; S.stats.spriteMs += p.ms;
      if (!work) work = document.createElement("canvas");
      work.width = p.W; work.height = p.H * p.F;
      const wg = work.getContext("2d");
      wg.putImageData(new ImageData(p.data, p.W, p.H * p.F), 0, 0);
      c.drips = p.drips;
      work.toBlob((blob) => {
        if (!blob || S.cache.get(key) !== c) return;
        c.url = URL.createObjectURL(blob);
        for (const h of c.waiters) apply(h, c);
        c.waiters.clear();
      }, "image/png");
      // the light pictures (0.3.3): their own blob; a box without them (dry, or the painting failed) keeps the still rim
      c.light = p.light ? null : ""; c.lpath = p.light ? p.light.path : null;
      if (p.light) {
        try {
          if (!lightWork) lightWork = document.createElement("canvas");
          lightWork.width = p.light.W; lightWork.height = p.light.H * p.light.K;
          lightWork.getContext("2d").putImageData(new ImageData(p.light.data, p.light.W, p.light.H * p.light.K), 0, 0);
          lightWork.toBlob((blob) => {
            if (S.cache.get(key) !== c) return;
            c.light = blob ? URL.createObjectURL(blob) : "";
            if (c.light) { for (const h of c.users) h.lobKey = ""; queueLobes(); }
          }, "image/png");
        } catch { c.light = ""; }
      }
    }
    kick();
  }

  // ---------------------------------------------------------------------------------------- observers
  function observe() {
    S.io = new IntersectionObserver((es) => {
      for (const e of es) {
        const h = S.byEl.get(e.target); if (!h) continue;
        h.live = e.isIntersecting;
        h.span?.classList.toggle("vk-dip-live", h.live);
        if (!h.live) hideLobes(h);
      }
      placeSibs(); queueLobes();
      S.dirty = true;
    }, { rootMargin: "60px" });
    // a host whose size animates reports at every frame: the batches are joined, one measure per 100 ms
    const flushRo = () => {
      S.roT = 0; S.roLast = performance.now();
      const list = [...S.roPend]; S.roPend.clear();
      if (!S.built) return;
      measureMany(list); placeSibs(); S.dirty = true;
    };
    S.ro = new ResizeObserver((es) => {
      for (const e of es) { const h = S.byEl.get(e.target); if (h) S.roPend.add(h); }
      if (S.roT) return;
      const wait = S.roLast + 100 - performance.now();
      if (wait <= 0) flushRo(); else S.roT = setTimeout(flushRo, wait);
    });
    // a change inside a control (its label) or of our own layers cannot change the room around other controls; any other change can
    const ours = (m) => {
      const t = m.target;
      // review: the lobe layer is ours too (its adds and removes re-measured every host)
      if (t.nodeType === 1) { if (t.closest(".vk-dip, .vk-dip-lobes")) return true; const x = t.closest(PICK), h = x && S.byEl.get(x); if (h && h.kind === "control") return true; }
      const mine = (n) => n.nodeType === 1 && (n.classList.contains("vk-dip") || n.classList.contains("vk-dip-lobes") || n.classList.contains("vk-dip-overlay"));
      for (const n of m.addedNodes) if (!mine(n)) return false;
      for (const n of m.removedNodes) if (!mine(n)) return false;
      return true;
    };
    S.mo = new MutationObserver((ms) => {
      let rescan = false, layout = false;
      const again = new Set(), wiped = new Set();
      for (const m of ms) {
        if (m.type === "childList" && ownLayerMutation(m)) continue;   // lead 11: our own lobe layer and overlay change nothing for anyone else (no layout, no rescan)
        if (m.type === "childList" && !layout && !ours(m)) layout = true;
        if (m.type === "attributes") {
          const h = S.byEl.get(m.target);
          if (m.attributeName === ATTR) rescan = true;
          else if (h) { if (m.attributeName === "data-vk-dip-show") h.pin = m.target.getAttribute("data-vk-dip-show"); else again.add(h); }
          else if (m.target.tagName === "FIELDSET") for (const x of S.hosts) if (m.target.contains(x.el)) again.add(x);   // a disabled fieldset dries what is inside
          continue;
        }
        for (const n of m.addedNodes) if (n.nodeType === 1 && !n.classList.contains("vk-dip") && !n.classList.contains("vk-dip-drip")) rescan = true;
        for (const n of m.removedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.classList.contains("vk-dip")) { const h = n.__vkDipHost; if (h && h.span === n) wiped.add(h); }   // the app wiped a layer (textContent, innerHTML): the same layer goes back in, no measure (a size change reaches the ResizeObserver)
          else if (!n.classList.contains("vk-dip-drip")) rescan = true;
        }
      }
      for (const h of wiped) attach(h);
      if (again.size) { measureMany([...again]); S.dirty = true; }
      queueFollow();
      if (layout || rescan) queueRemeasure(150);
      if (rescan && !S.rescanT) S.rescanT = setTimeout(() => { S.rescanT = 0; if (S.built) { scan(); placeSibs(); } }, 90);
    });
    for (const h of S.hosts) { S.ro.observe(h.el); S.io.observe(h.el); }
    S.mo.observe(opt.root, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "aria-disabled", ATTR, "data-vk-dip-show"] });
  }

  // ---------------------------------------------------------------------------------------- the strand overlay and its one loop
  function makeOverlay() {
    overlay = document.createElement("canvas");
    overlay.className = "vk-dip-overlay"; overlay.setAttribute("aria-hidden", "true");
    document.body.append(overlay);
    g = overlay.getContext("2d");
    sizeOverlay();
  }
  // the overlay is a small window that moves to where the strands are: the browser composites and uploads that much, not a canvas
  // the size of the screen. lead 11: it is as big as the strands need (a tongue is about 100 css px: 128 x 128 to start) and grows in
  // 64 px steps up to 640 x 640 for a long pull; it was always 640 x 640, redrawn whole every frame over 16 animated layers
  const OVERLAY_MIN = 128, OVERLAY_MARGIN = 20;
  function setOverlaySize(w, h) {
    const d = DPR();
    S.ow = w; S.oh = h;
    overlay.width = Math.round(w * d); overlay.height = Math.round(h * d);   // (this clears it)
    overlay.style.width = `${w}px`; overlay.style.height = `${h}px`;
    S.org = null;
  }
  function sizeOverlay() {
    if (!overlay) return;
    S.omw = Math.min(innerWidth, 640); S.omh = Math.min(innerHeight, 640);
    setOverlaySize(Math.min(S.omw, OVERLAY_MIN), Math.min(S.omh, OVERLAY_MIN));
    S.box = null; S.dirty = true;
  }
  function refreshRects() {
    for (const h of S.hosts) {
      if (!h.live || !h.span || h.span.hidden) { h.rect = null; continue; }
      const b = h.el.getBoundingClientRect();
      h.rect = { x: b.left, y: b.top, w: b.width, h: b.height };
      h.off = h.dry;
    }
    S.protect = [];
    for (const el of opt.root.querySelectorAll("[data-vk-protect]")) {
      if (S.protect.length > 200) break;
      if (S.byEl.has(el) && S.byEl.get(el).kind === "edge") continue;
      const b = el.getBoundingClientRect();
      if (b.bottom < 0 || b.top > innerHeight || b.width === 0) continue;
      S.protect.push([b.left, b.top, b.width, b.height]);
    }
    S.dirty = false;
  }
  const pinsLive = () => S.hosts.some((h) => h.pin && h.live && !h.dry);
  function state() { return { mode: S.mode, reduced: S.reduced, hidden: S.hidden, near: !!S.near, pressed: !!S.pressed, strands: S.strands.size, drops: S.drops.length, pins: pinsLive() ? 1 : 0 }; }
  function wake() {
    if (S.running || !loopWanted(state())) return;
    S.running = true; S.last = performance.now();
    S.raf = requestAnimationFrame(frame);
  }
  function sleep() {
    S.running = false; cancelAnimationFrame(S.raf); clearTimeout(S.tm); S.tm = 0;
    setNear(null);
    if (S.pressed) { S.pressed.span?.classList.remove("vk-dip-press"); S.pressed = null; }
    S.strands.clear(); S.drops = [];
    if (g) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, overlay.width, overlay.height); }
    S.box = null;
  }
  function setNear(h) {
    if (S.near === h) return;
    S.near?.span?.classList.remove("vk-dip-near"); lightFree(S.near);
    S.near = h; h?.span?.classList.add("vk-dip-near");
    // hover scales the rim: an old skin laid over it would double it. The light stays (no write at all): hiding 8 pictures in 8 group
    // layers at every host change made the browser raster those layers again in a pointer sweep (+4 to +6 ms a frame)
    if (h && !(h.skin && h.skin.length === LIGHT_K)) skinShow(h, false);
  }
  // the light near the pointer (0.3.3): the chain stops for this control and the one light picture whose lamp stands nearest the
  // pointer shows at full, so the wet streak gathers where the pointer is and follows it round the rim
  function lightAt(h, px, py) {
    if (!h || !h.rect || !h.lpath || !h.skin || h.skin.length !== LIGHT_K || !lobeRoot) return;
    const R0 = h.rect, hw = R0.w / 2, hh = R0.h / 2, r = Math.min(h.r || 0, hw, hh);
    const o = nearestLocal(px - R0.x - hw, py - R0.y - hh, hw, hh, r), u = rrParamOf(o.bx, o.by, o.nx, o.ny, hw, hh, r);
    let j = 0, bd = 2;
    h.lpath.forEach((v, k) => { let d = Math.abs(v - u); d = Math.min(d, 1 - d); if (d < bd) { bd = d; j = k; } });
    if (h.lightJ === j) return;
    // ONE shared element shows the chosen picture (a copy of the host's light element's place and image): nothing moves between
    // groups, nothing is laid out again
    if (!nearLight || !nearLight.isConnected) { nearLight = document.createElement("i"); nearLight.className = "vk-dip-lt vk-dip-lt--near"; lobeRoot.append(nearLight); }
    const src = h.skin[j];
    if (h.lightJ === undefined || h.lightJ < 0) {
      for (const p of ["left", "top", "width", "height", "backgroundImage", "clipPath"]) nearLight.style[p] = src.style[p];
      skinShow(h, false);
    }
    nearLight.style.backgroundPosition = src.style.backgroundPosition; nearLight.style.visibility = "";
    h.lightJ = j;
  }
  function lightFree(h) {
    if (!h) return;
    skinShow(h, true);
    if (h.lightJ === undefined || h.lightJ < 0) return;
    h.lightJ = -1;
    if (nearLight) nearLight.style.visibility = "hidden";
  }
  // the strands one host wants for a (real or pinned) pointer
  function want(h, px, py, pull, t, out) {
    const rect = h.rect; if (!rect) return;
    // round 4: a container edge or a big tile does not reach out to a pointer outside it (black on black, only its lit tip showed: an orphan pill)
    if ((h.kind === "edge" || (rect.h > 64 && rect.w * rect.h > 24000)) && !pull && sdRRect(px - rect.x - rect.w / 2, py - rect.y - rect.h / 2, rect.w / 2, rect.h / 2, Math.min(h.r || 0, rect.w / 2, rect.h / 2)) > 0) return;
    // round 2: the light does not gather at the pointer (it cost about 6 ms a frame in a sweep); near and hover hide the chain like the skins
    const look = lookOf(h.kind);
    const base = nearestOnRect(rect, h.r, px, py);
    const tx = -base.ny, ty = base.nx;
    const slots = [0];   // near, hover and press: ONE fat tongue (0.3.2: three thin strands read as wire)
    slots.forEach((o, si) => {
      const b = o ? nearestOnRect(rect, h.r, base.x + tx * o + base.nx * 4, base.y + ty * o + base.ny * 4) : base;
      const lift = Math.max(2, look.reach * 0.45);
      const ax = b.x + b.nx * lift, ay = b.y + b.ny * lift;
      let gx, gy, bridge = false;
      const wob = Math.sin(t / 380 + si * 2.1 + h.seed) * 2.5;
      if (pull) {
        if (base.d > 0) { gx = px + o * 0.5; gy = py + o * 0.3; bridge = true; }
        else { const L = 12 + 5 * Math.sin(t / 260 + si); gx = ax + b.nx * L + -b.ny * wob; gy = ay + b.ny * L + b.nx * wob; }
      } else if (base.d <= 0) {
        const L = 17 + 4 * Math.sin(t / 420 + si * 1.7 + h.seed);   // hover: the oil gathers in a fat bulge where the pointer is
        gx = ax + b.nx * L - b.ny * wob; gy = ay + b.ny * L + b.nx * wob;
      } else {
        const k = 1 - clamp(base.d / (h.kind === "edge" ? EDGE_NEAR : NEAR), 0, 1);
        const dx = px - ax, dy = py - ay, dl = Math.hypot(dx, dy) || 1;
        const L = Math.min(dl + 2, (10 + 46 * k)) * (si ? 0.6 : 1);   // near: a fat tongue of oil leans out toward the pointer
        gx = ax + (dx / dl) * L - (dy / dl) * wob; gy = ay + (dy / dl) * L + (dx / dl) * wob;
      }
      out.push({ key: `${S.hosts.indexOf(h)}:${si}`, h, ax, ay, nx: b.nx, ny: b.ny, gx, gy, bridge, tongue: !pull, lobe: !pull && base.d <= 0, w0: (pull ? (h.kind === "edge" ? 28 : 30) : (h.kind === "edge" ? 22 : base.d <= 0 ? 26 : 20)) * (si ? (pull ? 0.8 : 0.68) : 1) });
    });
  }
  function release(fling) {
    for (const st of S.strands.values()) {
      if (st.snap) continue;
      st.snap = true;
      const len = Math.hypot(st.tx - st.ax, st.ty - st.ay);
      if (fling && len > 18) S.drops.push({ x: st.tx, y: st.ty, vx: (st.tx - st.ax) / len * 1.6, vy: (st.ty - st.ay) / len * 1.6 - 1.2, r: clamp(st.w0 * 0.55, 1.8, 3.2), life: 1 });
      st.vx = fling ? (st.tx - st.ax) * 0.12 : 0; st.vy = fling ? (st.ty - st.ay) * 0.12 : 0;
    }
  }
  function frame(now) {
    if (!S.running) return;
    const t0 = performance.now();
    const dt = clamp((now - S.last) / 16.67, 0.25, 3); S.last = now;
    if (S.dirty) refreshRects();
    const desired = [];
    const P = S.pointer;
    // the pointer's speed (px a frame, smoothed): a pressed tongue leads by 3 frames so it reaches the pointer, not where it was
    if (P) { const q = S.pq || P; S.pv = { x: (S.pv?.x || 0) * 0.6 + (P.x - q.x) / dt * 0.4, y: (S.pv?.y || 0) * 0.6 + (P.y - q.y) / dt * 0.4 }; S.pq = { x: P.x, y: P.y }; }
    if (S.pressed && S.pressed.rect && P) { want(S.pressed, P.x + clamp(S.pv.x * 3, -14, 14), P.y + clamp(S.pv.y * 3, -14, 14), true, now, desired); setNear(S.pressed); }
    else if (P && now < (S.quiet || 0)) setNear(null);
    else if (P) {
      const nh = nearestHost(S.hosts, P.x, P.y);
      const h = nh ? S.hosts[nh.i] : null;
      setNear(h);
      if (h) want(h, P.x, P.y, false, now, desired);
    } else setNear(null);
    // pinned states (the demo's state row)
    for (const h of S.hosts) {
      if (!h.pin || !h.live || !h.rect || h.dry || h === S.near) continue;
      const R = h.rect, k = now / 1000;
      if (h.pin === "near") want(h, R.x + R.w + 22 + 7 * Math.sin(k * 1.4), R.y + R.h * 0.35 + 5 * Math.cos(k * 1.1), false, now, desired);
      else if (h.pin === "hover") want(h, R.x + R.w * 0.72, R.y + R.h * 0.55, false, now, desired);
      else if (h.pin === "pressed") want(h, R.x + R.w + 34 + 9 * Math.sin(k * 1.6), R.y + R.h + 24 + 7 * Math.cos(k * 1.3), true, now, desired);
      else if (h.pin === "released") {
        const ph = (now % 2600) / 2600;
        if (ph < 0.45) { const e = ph / 0.45; want(h, R.x + R.w + 8 + 46 * e, R.y + R.h + 6 + 30 * e, true, now, desired); h.span?.classList.add("vk-dip-press"); h.relDone = false; }
        else if (!h.relDone) { h.relDone = true; h.span?.classList.remove("vk-dip-press"); flash(h); }
      }
    }
    // follow, snap, break
    const seen = new Set();
    for (const d of desired) {
      seen.add(d.key);
      let st = S.strands.get(d.key);
      if (!st || st.snap) { st = { key: d.key, tx: d.ax, ty: d.ay, vx: 0, vy: 0, seed: Math.random() * 9 }; S.strands.set(d.key, st); }
      Object.assign(st, { h: d.h, ax: d.ax, ay: d.ay, nx: d.nx, ny: d.ny, bridge: d.bridge, tongue: d.tongue, lobe: d.lobe, w0: d.w0, snap: false });
      const k = d.bridge ? 1 : 1 - Math.pow(1 - 0.3, dt);
      st.tx += (d.gx - st.tx) * k; st.ty += (d.gy - st.ty) * k;
      if (Math.hypot(st.tx - st.ax, st.ty - st.ay) > BREAK) {
        st.snap = true; st.vx = (st.tx - st.ax) * 0.1; st.vy = (st.ty - st.ay) * 0.1;
        S.drops.push({ x: st.tx, y: st.ty, vx: 0, vy: 0.5, r: 2.6, life: 1 });
      }
    }
    for (const [key, st] of S.strands) {
      if (!seen.has(key) && !st.snap) { st.snap = true; st.vx = 0; st.vy = 0; }
      if (st.snap) {
        st.vx = (st.vx + (st.ax - st.tx) * SNAP_K * dt) * Math.pow(SNAP_D, dt); st.vy = (st.vy + (st.ay - st.ty) * SNAP_K * dt) * Math.pow(SNAP_D, dt);   // lead 11: home in about 0.6 s with ONE small overshoot (5 % of the pull; 0.045 / 0.86 rang for 0.9 s and swung 28 % past, 0.14 / 0.8 read as a blink)
        st.tx += st.vx * dt; st.ty += st.vy * dt;
        const dH = Math.hypot(st.tx - st.ax, st.ty - st.ay);   // home: at the root, or past its nearest point (a coarse frame can step over the root)
        if (dH < SNAP_HOME || (st.dH != null && dH > st.dH && dH < 12)) S.strands.delete(key); else st.dH = dH;
      }
    }
    for (const d of S.drops) { d.vy += 0.32 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.life -= 0.035 * dt; }
    S.drops = S.drops.filter((d) => d.life > 0);
    draw(now);
    S.stats.loopFrames += 1;
    const ms = performance.now() - t0; S.stats.loopMs += ms; S.stats.frames.push(ms); if (S.stats.frames.length > 240) S.stats.frames.shift();
    if (!loopWanted(state())) { sleep(); return; }
    // at most 60 frames a second: on a 144 or 240 Hz screen asking at every refresh makes the browser draw the whole page
    // (and service every running animation) 2 to 4 times as often for no visible gain
    const wait = 16.4 - (performance.now() - now);
    if (wait > 6) S.tm = setTimeout(() => { S.tm = 0; if (S.running) S.raf = requestAnimationFrame(frame); }, wait - 4);
    else S.raf = requestAnimationFrame(frame);
  }
  const INK = "#030303";
  function strandPath(st, t) {
    const ax = st.ax, ay = st.ay, tx = st.tx, ty = st.ty, len = Math.hypot(tx - ax, ty - ay);
    const n = 14, P = [], Wd = [];
    const [cx, cy] = strandCtrl(st);
    // a tongue (near, hover) stays fat to a round tip; a pulled strand (press) thins to a thread or a bridge as before
    const w0 = st.w0 * (st.tongue ? clamp(30 / (len + 14) + 0.55, 0.75, 1.05) : clamp(40 / (len + 14) + 0.55, 0.68, 1.05));
    const w1 = st.bridge ? w0 * 0.9 : st.tongue ? Math.max(2.2, w0 * 0.6) : Math.max(3, w0 * 0.55);
    const neck = st.bridge ? clamp(len / 220, 0.2, 0.55) : st.tongue ? 0.1 : 0.12;
    for (let i = 0; i <= n; i += 1) {
      const u = i / n, v = 1 - u;
      let x = v * v * ax + 2 * v * u * cx + u * u * tx, y = v * v * ay + 2 * v * u * cy + u * u * ty;
      const wob = Math.sin(t / 300 + st.seed + u * 5) * Math.min(2.2, len * 0.04) * Math.sin(Math.PI * u);
      const ddx = 2 * v * (cx - ax) + 2 * u * (tx - cx), ddy = 2 * v * (cy - ay) + 2 * u * (ty - cy), dl = Math.hypot(ddx, ddy) || 1;
      x += (-ddy / dl) * wob; y += (ddx / dl) * wob;
      P.push([x, y]);
      Wd.push(Math.max(0.5, (w0 + (w1 - w0) * u) * (1 - neck * Math.sin(Math.PI * u)) / 2));
    }
    return { P, Wd, w0, w1, len };
  }
  // the line boxes of the words (and the controls) inside a big host, relative to its box: at most 120 text runs and 60 child controls
  function textBoxes(el, R) {
    const out = [], rg = document.createRange(), tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(), k = 0; n && k < 120; n = tw.nextNode(), k += 1) {
      if (!n.nodeValue.trim() || n.parentElement?.closest(".vk-dip")) continue;
      rg.selectNodeContents(n);
      for (const q of rg.getClientRects()) if (q.width > 0 && q.height > 0) out.push([q.left - R.x, q.top - R.y, q.width, q.height]);
    }
    for (const c of [...el.querySelectorAll("svg, img, canvas, button, input, a")].slice(0, 60)) { const q = c.getBoundingClientRect(); if (q.width > 0 && q.height < 64 && q.width < 240) out.push([q.left - R.x, q.top - R.y, q.width, q.height]); }
    return out;
  }
  function drawStrand(st, t) {
    const { P, Wd, w0, w1, len } = strandPath(st, t);
    if (len < 1.2) return;
    const n = P.length, L = [], Rr = [];
    for (let i = 0; i < n; i += 1) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], dl = Math.hypot(dx, dy) || 1;
      const ox = -dy / dl * Wd[i], oy = dx / dl * Wd[i];
      L.push([P[i][0] + ox, P[i][1] + oy]); Rr.push([P[i][0] - ox, P[i][1] - oy]);
    }
    g.fillStyle = INK; g.beginPath(); g.moveTo(L[0][0], L[0][1]);
    for (const p of L) g.lineTo(p[0], p[1]);
    for (let i = n - 1; i >= 0; i -= 1) g.lineTo(Rr[i][0], Rr[i][1]);
    g.closePath(); g.fill();
    // the root sits in the rim, the tip is a bead
    g.beginPath(); g.ellipse(st.ax, st.ay, w0 * 0.75, w0 * 0.75, 0, 0, Math.PI * 2); g.fill();
    const tr = st.bridge ? w1 * 0.75 : st.tongue ? w1 * 0.5 : Math.max(1.3, w1 * 1.1);   // a tongue ends in a round cap as wide as its tip
    g.beginPath(); g.ellipse(st.tx, st.ty, tr, tr * 1.08, 0, 0, Math.PI * 2); g.fill();
    // light: a hard white line along the lit side, a faint edge on the other, a speck on the tip
    const lit = (L[(n / 2) | 0][0] - Rr[(n / 2) | 0][0]) * -0.55 + (L[(n / 2) | 0][1] - Rr[(n / 2) | 0][1]) * -0.83 > 0 ? L : Rr;
    const dim = lit === L ? Rr : L;
    g.lineCap = "round"; g.lineJoin = "round";
    // black oil on a black page shows by its light: no outline (an outline loop reads as wire), one broad soft sheen and one soft gleam
    // along the lit side, like the rim's own streak
    g.strokeStyle = "rgba(255,255,255,0.16)"; g.lineWidth = Math.max(2, w0 * 0.38);
    g.beginPath(); P.forEach((p, i) => { const x = p[0] + (lit[i][0] - p[0]) * 0.42, y = p[1] + (lit[i][1] - p[1]) * 0.42; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.62)"; g.lineWidth = clamp(w0 * 0.1, 1.1, 2);
    g.beginPath();
    for (let i = 1; i < n; i += 1) { const q = 0.6; const x = P[i][0] + (lit[i][0] - P[i][0]) * q, y = P[i][1] + (lit[i][1] - P[i][1]) * q; i === 1 ? g.moveTo(x, y) : g.lineTo(x, y); }
    g.stroke();
    // the tip is a bead with a soft glint, so the tongue visibly reaches the pointer (black on black, its tip showed short)
    g.fillStyle = "rgba(255,255,255,0.42)"; g.beginPath(); g.arc(st.tx - tr * 0.3, st.ty - tr * 0.35, clamp(tr * 0.16, 0.8, 1.6), 0, Math.PI * 2); g.fill();
    void dim;
  }
  function draw(t) {
    const d = DPR();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (x, y, m) => { x0 = Math.min(x0, x - m); y0 = Math.min(y0, y - m); x1 = Math.max(x1, x + m); y1 = Math.max(y1, y + m); };
    for (const st of S.strands.values()) { const b = strandBox(st); grow(b[0], b[1], 0); grow(b[2], b[3], 0); }
    for (const p of S.drops) grow(p.x, p.y, 8);
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (x0 === Infinity) {
      if (S.box) g.clearRect(0, 0, overlay.width, overlay.height);
      S.box = null;
      if (S.ow > OVERLAY_MIN || S.oh > OVERLAY_MIN) setOverlaySize(Math.min(S.omw, OVERLAY_MIN), Math.min(S.omh, OVERLAY_MIN));   // nothing to draw: back to the small window
      return;
    }
    // the window grows (in 64 px steps, never past 640) when the strands need more; a resize clears the canvas, the frame is drawn after it
    const nw = x1 - x0 + 2 * OVERLAY_MARGIN, nh = y1 - y0 + 2 * OVERLAY_MARGIN;
    const gw = nw > S.ow ? Math.min(S.omw, Math.ceil(nw / 64) * 64) : S.ow, gh = nh > S.oh ? Math.min(S.omh, Math.ceil(nh / 64) * 64) : S.oh;
    if (gw !== S.ow || gh !== S.oh) setOverlaySize(gw, gh); else if (S.box) g.clearRect(0, 0, overlay.width, overlay.height);
    S.box = [x0, y0, x1, y1];
    // the window moves only when the strands come close to its edge, so it is not re-placed at every frame of a sweep
    const fits = S.org && x0 - OVERLAY_MARGIN >= S.org[0] && y0 - OVERLAY_MARGIN >= S.org[1] && x1 + OVERLAY_MARGIN <= S.org[0] + S.ow && y1 + OVERLAY_MARGIN <= S.org[1] + S.oh;
    let ox = S.org ? S.org[0] : 0, oy = S.org ? S.org[1] : 0;
    if (!fits) {
      ox = Math.round(clamp((x0 + x1) / 2 - S.ow / 2, 0, Math.max(0, innerWidth - S.ow)));
      oy = Math.round(clamp((y0 + y1) / 2 - S.oh / 2, 0, Math.max(0, innerHeight - S.oh)));
    }
    if (!S.org || S.org[0] !== ox || S.org[1] !== oy) { S.org = [ox, oy]; overlay.style.transform = `translate(${ox}px, ${oy}px)`; }
    g.setTransform(d, 0, 0, d, -ox * d, -oy * d);
    for (const st of S.strands.values()) drawStrand(st, t);
    for (const p of S.drops) {
      g.globalAlpha = clamp(p.life * 1.4, 0, 1);
      g.fillStyle = INK; g.beginPath(); g.ellipse(p.x, p.y, p.r, p.r * 1.15, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "rgba(255,255,255,0.85)"; g.beginPath(); g.arc(p.x - p.r * 0.35, p.y - p.r * 0.4, p.r * 0.3, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    }
    // words stay clean: wipe every control's label area and every protected box out of the oil
    g.globalCompositeOperation = "destination-out"; g.fillStyle = "#000";
    const hit = (x, y, w, h) => x < x1 && x + w > x0 && y < y1 && y + h > y0;
    for (const h of S.hosts) {
      if (!h.rect || h.kind === "edge") continue;
      const R = h.rect, ins = lookOf(h.kind).inset + 0.5;
      if (!hit(R.x, R.y, R.w, R.h)) continue;
      // a big control (a tile holding a whole drop zone): wiping its whole box cut a press tongue into a detached pill. Only its words
      // are wiped there (their line boxes, read once per box size), so the tongue passes over its empty surface
      if (true) {   // round 4: every control wipes only its words and small pictures (a tongue crossing a neighbour or a tile stays whole)
        const key = textKeyOf(R.w, R.h, (h.tlen || 0) + (h.el.value ? String(h.el.value).length : 0));   // tlen: the subtree text length, read when the host is measured (not every frame)
        if (h.txtKey !== key) { h.txtKey = key; h.txt = textBoxes(h.el, R); }
        // a field (or a host with no text of its own): the whole inner box is wiped, so no tongue draws over the typed value or a background icon
        if (wipeWholeHost(h.el.tagName, h.el.type)) {
          g.beginPath();
          if (g.roundRect) g.roundRect(R.x + ins, R.y + ins, Math.max(0, R.w - 2 * ins), Math.max(0, R.h - 2 * ins), Math.max(0, Math.min(h.r - ins, (R.h - 2 * ins) / 2, (R.w - 2 * ins) / 2)));
          else g.rect(R.x + ins, R.y + ins, Math.max(0, R.w - 2 * ins), Math.max(0, R.h - 2 * ins));
          g.fill(); continue;
        }
        for (const q of h.txt) if (hit(R.x + q[0], R.y + q[1], q[2], q[3])) g.fillRect(R.x + q[0] - 2, R.y + q[1] - 2, q[2] + 4, q[3] + 4);
        continue;
      }
      g.beginPath();
      if (g.roundRect) g.roundRect(R.x + ins, R.y + ins, Math.max(0, R.w - 2 * ins), Math.max(0, R.h - 2 * ins), Math.max(0, Math.min(h.r - ins, (R.h - 2 * ins) / 2, (R.w - 2 * ins) / 2)));
      else g.rect(R.x + ins, R.y + ins, Math.max(0, R.w - 2 * ins), Math.max(0, R.h - 2 * ins));
      g.fill();
    }
    for (const p of S.protect) {
      if (hit(p[0], p[1], p[2], p[3])) g.fillRect(p[0] + 2, p[1] + 2, Math.max(0, p[2] - 4), Math.max(0, p[3] - 4));
    }
    g.globalCompositeOperation = "source-over";
  }
  function flash(h) {
    const sp = h.span; if (!sp) return;
    sp.classList.remove("vk-dip-release"); void sp.offsetWidth; sp.classList.add("vk-dip-release");
    clearTimeout(h.relT); h.relT = setTimeout(() => sp.classList.remove("vk-dip-release"), 960);
    if (h.pin === "released") release(true);
  }

  // ---------------------------------------------------------------------------------------- rest motion: shared lobe groups, a few drips
  // the frame a layer shows (A) and the one hover shows (B): both are parts of the same picture
  function setFrame(h, f) {
    h.fa = f;
    const a = h.span?.querySelector(".vk-dip-a"), b = h.span?.querySelector(".vk-dip-b");
    a?.style.setProperty("--vk-dip-f", String(f)); b?.style.setProperty("--vk-dip-f", String((f + 1) % FRAMES));
  }
  function endDrop(h) { h.span?.classList.remove("vk-dip-drop"); S.dropping.delete(h); }
  function stopRest() { for (const h of [...S.dropping.keys()]) endDrop(h); if (lobeRoot) lobeRoot.hidden = true; }

  // ---- the lobes: one fixed overlay (never adds scroll size, never takes a click) with a static layer of necks and LOBE_G group
  // elements, each with one endless animation in dip.css. Positions are written only when a host moved or changed (a check every
  // rest tick is one read of the live hosts' boxes); a lobe is placed only where its head, at its farthest, lands on free room: inside
  // every clipping box around the host, over nothing but the host's own ancestors, and not over their words.
  let lobeRoot = null, lobeNecks = null, lobeGroups = [], skinGroups = [], lightGroups = [], lobeCanvas = null, nearLight = null;
  const lobeImg = new Map();
  const lobesWanted = () => opt.flows !== 0 && restMoves({ mode: S.mode, reduced: S.reduced, hidden: S.hidden });
  function makeLobes() {
    if (lobeRoot) return;
    lobeRoot = document.createElement("div"); lobeRoot.className = "vk-dip-lobes"; lobeRoot.setAttribute("aria-hidden", "true"); lobeRoot.hidden = true;
    lobeNecks = document.createElement("div"); lobeNecks.className = "vk-dip-necks"; lobeRoot.append(lobeNecks);
    lobeGroups = [];
    skinGroups = [];
    for (let k = 0; k < SKIN_G; k += 1) { const d = document.createElement("div"); d.className = `vk-dip-s vk-dip-s${k}`; lobeRoot.append(d); skinGroups.push(d); }
    lightGroups = [];
    if (lightOption(opt.light)) for (let k = 0; k < LIGHT_K; k += 1) { const d = document.createElement("div"); d.className = `vk-dip-l vk-dip-l${k}`; lobeRoot.append(d); lightGroups.push(d); }
    lobeRoot.append(lobeNecks);   // the fillets lie over the skins, the tongues over both
    for (let g = 0; g < LOBE_G; g += 1) { const d = document.createElement("div"); d.className = `vk-dip-g vk-dip-g${g}`; lobeRoot.append(d); lobeGroups.push(d); }
    document.body.append(lobeRoot);
  }
  function dropLobes() {
    for (const h of S.hosts) { h.lob = null; h.lobKey = ""; }
    lobeRoot?.remove(); lobeRoot = lobeNecks = nearLight = null; lobeGroups = []; skinGroups = []; lightGroups = [];
    if (lobeCanvas) { lobeCanvas.width = lobeCanvas.height = 0; lobeCanvas = null; }
    lobeImg.clear();
  }
  // the pictures: one per kind, part, direction and size (small PNGs painted on first use, a few dozen on a page)
  function blobUrl(kind, part, g, sz) {
    const key = `${kind}|${part}|${g}|${sz}`;
    let u = lobeImg.get(key);
    if (u) return u;
    const L = LOBE[kind] || LOBE.control, k = LOBE_SZ[sz] || 1;
    const ang = part === "head" ? Math.atan2(...groupDir(g).reverse()) : (2 * Math.PI * g) / LOBE_G;
    const p = part === "head" ? paintTongue(L.A * k, L.B * k, ang, 2) : paintMeniscus(L.B * k, ang, 2);
    if (!lobeCanvas) lobeCanvas = document.createElement("canvas");
    lobeCanvas.width = lobeCanvas.height = p.W;
    lobeCanvas.getContext("2d").putImageData(new ImageData(p.data, p.W, p.W), 0, 0);
    u = { url: `url("${lobeCanvas.toDataURL("image/png")}")`, size: p.size };
    lobeImg.set(key, u);
    return u;
  }
  function queueLobes() { if (!S.lobeT && S.built) S.lobeT = setTimeout(() => { S.lobeT = 0; layoutLobes(true); }, 80); }
  // words that sit right in an ancestor (not in an element of their own) are not seen by elementFromPoint: test its text runs
  let trng = null;
  function overText(el, x, y) {
    trng = trng || document.createRange();
    for (let n = el.firstChild, k = 0; n && k < 60; n = n.nextSibling, k += 1) {
      if (n.nodeType !== 3 || !n.nodeValue.trim()) continue;
      trng.selectNodeContents(n);
      for (const q of trng.getClientRects()) if (x > q.left - 3 && x < q.right + 3 && y > q.top - 3 && y < q.bottom + 3) return true;
    }
    return false;
  }
  // a point is free for a lobe of h: over nothing but h's own ancestors (not over their words), or on the outer 5 px of a
  // neighbouring control (its own oil is there; its label is deeper in)
  function freeAt(h, x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return true;
    if (el === html || el === document.body) return !overText(el, x, y);
    if (el.contains(h.el)) return el !== h.el && !overText(el, x, y);
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const o = S.byEl.get(a);
      if (!o || o === h) continue;
      if (o.kind !== "control") return false;
      const r = a.getBoundingClientRect();
      return Math.min(x - r.left, r.right - x, y - r.top, r.bottom - y) < 5;
    }
    return false;
  }
  function hideLobes(h) { if (h.lob) for (const it of h.lob) { it.n.remove(); it.hd.remove(); } h.lob = null; h.lobKey = ""; hideSkin(h); }
  function hideSkin(h) { if (h.skin) for (const el of h.skin) el.remove(); h.skin = null; }
  const skinShow = (h, on) => { if (h?.skin) for (const el of h.skin) el.style.visibility = on ? "" : "hidden"; };
  function layoutLobes(force) {
    if (!S.built) return;
    if (!lobesWanted()) { if (lobeRoot) lobeRoot.hidden = true; return; }
    if (S.scrolling) return;
    makeLobes();
    const t0 = performance.now();
    const list = S.hosts.filter((h) => h.live && h.span && !h.span.hidden && h.span.hasAttribute("data-ready") && !h.dry);
    const keep = new Set(list), boxes = list.map((h) => h.el.getBoundingClientRect()), sboxes = list.map((h) => h.span.getBoundingClientRect());   // the skin sits on the layer itself (inside the host's border)
    const occl = force || (S.lobeTick = (S.lobeTick || 0) + 1) % 4 === 0;   // is something laid over a host now (a dialog)? every 1.8 s
    const clipOf = new Map(), writes = [];
    // a crowded screen: fewer lobes per control, so the whole screen stays inside LOBE_BUDGET
    const est = list.reduce((sum, h, i) => sum + LOBE[lobeKind(h.kind, boxes[i].width, boxes[i].height)].n, 0);
    const density = Math.max(0.05, Math.round(Math.min(1, LOBE_BUDGET / Math.max(1, est)) * 20) / 20);
    let n = 0;
    list.forEach((h, i) => {
      const b = boxes[i], key = `${b.left.toFixed(1)},${b.top.toFixed(1)},${b.width.toFixed(1)},${b.height.toFixed(1)},${h.r},${Math.round(Math.min(h.below ?? 999, 999))},${density}`;
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      let seen = true;
      if (occl || key !== h.lobKey) {
        const top = document.elementFromPoint(clamp(cx, 0, innerWidth - 1), clamp(cy, 0, innerHeight - 1));
        seen = !!top && (h.el.contains(top) || top.contains(h.el) || top === h.span || h.span.contains(top));
      }
      const step = lobStep(occl, key, h.lobKey, seen);
      if (step === "hide") { hideLobes(h); h.lobKey = coveredKey(key); return; }   // review: a different key, so the next tick looks again once the cover goes
      if (step === "keep") { n += h.lob ? h.lob.length : 0; return; }
      h.lobKey = key;
      // the clip: the viewport and every box around the host that clips its overflow
      let cl = [0, 0, innerWidth, innerHeight];
      for (let a = h.el.parentElement; a && a !== document.body && a !== html; a = a.parentElement) {
        let c = clipOf.get(a);
        if (c === undefined) { const cs = getComputedStyle(a); c = clips(cs.overflowX) || clips(cs.overflowY) || cs.overflowX === "clip" || cs.overflowY === "clip" ? a.getBoundingClientRect() : null; clipOf.set(a, c); }
        if (c) cl = [Math.max(cl[0], c.left), Math.max(cl[1], c.top), Math.min(cl[2], c.right), Math.min(cl[3], c.bottom)];
      }
      // placement and phase come from the control itself (its index and size): two loads look and measure the same
      h.lobSeed = hostHash(S.hosts.indexOf(h), b.width, b.height);
      const spec = lobesFor(b.width, b.height, h.r, h.kind, h.lobSeed, h.below ?? Infinity, density), put = [];
      for (const lb0 of spec) for (const lb of lb0.alts) {
        const [dx, dy] = groupDir(lb.g), ox = cx + lb.x, oy = cy + lb.y;
        // the tongue's centre at its farthest (root on the rim + its half length + the group's travel), and its round end
        const ex = ox + lb.nx * lb.r0 + dx * (lb.A + LOBE_D), ey = oy + lb.ny * lb.r0 + dy * (lb.A + LOBE_D) + (lb.ny < -0.5 ? 0 : 1);   // the 1 px sag (not on a top edge: it would hide the reach up)
        const tx = ex + dx * (lb.A + 3), ty = ey + dy * (lb.A + 3), px = -dy * (lb.B + 3.5), py = dx * (lb.B + 3.5);   // + the halo
        const inC = (x, y) => x > cl[0] + 1 && y > cl[1] + 1 && x < cl[2] - 1 && y < cl[3] - 1;
        if (!inC(tx, ty) || !inC(tx - dx * lb.B + px, ty - dy * lb.B + py) || !inC(tx - dx * lb.B - px, ty - dy * lb.B - py)) continue;
        if (!freeAt(h, tx, ty) || !freeAt(h, tx - dx * lb.B + px, ty - dy * lb.B + py) || !freeAt(h, tx - dx * lb.B - px, ty - dy * lb.B - py)) continue;
        put.push([lb, ox, oy]);
        break;
      }
      writes.push([h, put, lobeKind(h.kind, b.width, b.height), b, cl, sboxes[i]]);
    });
    // write: reuse the host's elements, add or remove the rest
    for (const [h, put, lk, b, cl, sb] of writes) {
      // the skin: frame C of the host's own rim picture, laid on its box (not on a layer cut back at a page end), clipped like the tongues
      const c = S.cache.get(h.key);
      // two skins (frames B and C) on two skin groups half a cycle of groups apart: a control never stands still in a 2 s window
      if (c && c.url && c.light) {
        // the light (0.3.3): LIGHT_K pictures of the host's own oil under a moving lamp, one in each light group; the host's hash picks
        // where in the chain it starts and which way it runs, so neighbours never move together
        if (!h.skin || h.skin.length !== LIGHT_K) { hideSkin(h); h.skin = Array.from({ length: LIGHT_K }, () => { const el = document.createElement("i"); el.className = "vk-dip-lt"; return el; }); }
        const pd = lookOf(h.kind).pad, pp = h.pads || { t: pd, r: pd, b: pd, l: pd };
        const x0 = sb.left - (pd - pp.l), y0 = sb.top - (pd - pp.t), w = sb.width + (pd - pp.l) + (pd - pp.r), hh = sb.height + (pd - pp.t) + (pd - pp.b);
        const lowest = Math.min(cl[3], sb.bottom, Number.isFinite(h.below) ? b.bottom + Math.max(0, h.below - 2) : Infinity);
        // like the skins were: the rim band only (6 px past the box on the top and the sides), cut at the clip and at the words below
        const band = (v) => Math.max(0, Math.floor(v - 6));
        const ct = Math.max(0, cl[1] - y0, sb.top - y0, band(b.top - y0)), cr = Math.max(0, x0 + w - cl[2], x0 + w - sb.right, band(x0 + w - b.right)), cb = Math.max(0, y0 + hh - lowest), clf = Math.max(0, cl[0] - x0, sb.left - x0, band(b.left - x0));
        h.lpath = c.lpath;
        const p0 = h.lobSeed % LIGHT_K, sense = (Math.floor(h.lobSeed / LIGHT_K) & 1) ? 1 : -1, img = `url("${c.light}")`;
        h.skin.forEach((el, j) => {
          Object.assign(el.style, { left: `${x0.toFixed(1)}px`, top: `${y0.toFixed(1)}px`, width: `${w}px`, height: `${hh}px`, backgroundImage: img,
            backgroundPosition: `0 ${((100 * j) / (LIGHT_K - 1)).toFixed(4)}%`,
            clipPath: ct || cr || cb || clf ? `inset(${ct}px ${cr}px ${cb}px ${clf}px)` : "", visibility: h === S.pressed || h.lightJ >= 0 ? "hidden" : "" });
          const grp = lightGroups[(((p0 - sense * j) % LIGHT_K) + LIGHT_K) % LIGHT_K];
          if (el.parentNode !== grp) grp.append(el);
        });
      } else if (c && c.url && SKIN_G) {
        if (!h.skin) h.skin = ["vk-dip-skin", "vk-dip-skin vk-dip-skin--b"].map((cn) => { const el = document.createElement("i"); el.className = cn; return el; });
        // the picture's own box (a layer cut at a page end or above close words is smaller than its picture): the skin is cut like the layer
        const pd = lookOf(h.kind).pad, pp = h.pads || { t: pd, r: pd, b: pd, l: pd };
        const x0 = sb.left - (pd - pp.l), y0 = sb.top - (pd - pp.t), w = sb.width + (pd - pp.l) + (pd - pp.r), hh = sb.height + (pd - pp.t) + (pd - pp.b);
        // cut at the clip and at the words below (frames B and C may sit lower than frame A, which the room was measured for)
        const lowest = Math.min(cl[3], sb.bottom, Number.isFinite(h.below) ? b.bottom + Math.max(0, h.below - 2) : Infinity);
        // the skin covers the rim band only (6 px past the box on the top and the sides): words 6 px beside or 8 px over a control stay clean,
        // and the halos of three stacked pictures never darken the page further out
        const band = (v) => Math.max(0, Math.floor(v - 6));
        const ct = Math.max(0, cl[1] - y0, sb.top - y0, band(b.top - y0)), cr = Math.max(0, x0 + w - cl[2], x0 + w - sb.right, band(x0 + w - b.right)), cb = Math.max(0, y0 + hh - lowest), clf = Math.max(0, cl[0] - x0, sb.left - x0, band(b.left - x0));
        const k = h.lobSeed % SKIN_G;
        h.skin.forEach((el, j) => {
          Object.assign(el.style, { left: `${x0.toFixed(1)}px`, top: `${y0.toFixed(1)}px`, width: `${w}px`, height: `${hh}px`, backgroundImage: `url("${c.url}")`,
            clipPath: ct || cr || cb || clf ? `inset(${ct}px ${cr}px ${cb}px ${clf}px)` : "", visibility: h === S.near || h === S.pressed ? "hidden" : "" });
          const grp = skinGroups[(k + 2 * j) % SKIN_G];
          if (el.parentNode !== grp) grp.append(el);
        });
      } else hideSkin(h);
      const items = h.lob || [];
      while (items.length > put.length) { const it = items.pop(); it.n.remove(); it.hd.remove(); }
      put.forEach(([lb, ox, oy], k) => {
        let it = items[k];
        if (!it) { it = { n: document.createElement("i"), hd: document.createElement("i"), g: -1 }; items.push(it); lobeNecks.append(it.n); }
        const gn = (((Math.round(Math.atan2(lb.ny, lb.nx) / ((2 * Math.PI) / LOBE_G))) % LOBE_G) + LOBE_G) % LOBE_G;
        const ni = blobUrl(lk, "neck", gn, lb.sz), hi = blobUrl(lk, "head", lb.g, lb.sz);
        const [dx, dy] = groupDir(lb.g);
        const nx = ox, ny = oy, hx = ox + lb.nx * lb.r0 + dx * lb.A, hy = oy + lb.ny * lb.r0 + dy * lb.A;
        Object.assign(it.n.style, { left: `${(nx - ni.size / 2).toFixed(1)}px`, top: `${(ny - ni.size / 2).toFixed(1)}px`, width: `${ni.size}px`, height: `${ni.size}px`, backgroundImage: ni.url, display: lb.creep ? "none" : "" });   // a creeping tongue lies on the rim: no fillet
        Object.assign(it.hd.style, { left: `${(hx - hi.size / 2).toFixed(1)}px`, top: `${(hy - hi.size / 2).toFixed(1)}px`, width: `${hi.size}px`, height: `${hi.size}px`, backgroundImage: hi.url });
        if (it.g !== lb.g || !it.hd.isConnected) { lobeGroups[lb.g].append(it.hd); it.g = lb.g; }
      });
      h.lob = items.length ? items : null;
      n += items.length;
    }
    for (const h of S.hosts) if (h.lob && !keep.has(h)) hideLobes(h);
    lobeRoot.hidden = false;
    S.stats.lobes = n; S.stats.lobeMs = performance.now() - t0;
  }
  function rest() {
    if (!restMoves({ mode: S.mode, reduced: S.reduced, hidden: S.hidden })) { stopRest(); return; }
    const now = performance.now();
    for (const [h, t] of S.dropping) if (!h.live || now - t > 9000) endDrop(h);
    const live = S.hosts.filter((h) => h.live && h.span && !h.span.hidden && h.span.hasAttribute("data-ready") && !h.dry && h !== S.near && h !== S.pressed);
    const nF = 0;
    const drippers = live.filter((h) => h.span.querySelector(".vk-dip-drip"));
    const nD = toStart(drippers.length, S.dropping.size, opt.drops, 1);
    if (!nF && !nD) return;
    // spread over the screen: each new one goes where nothing moves yet (the free control farthest from the moving ones, with a
    // little chance), and a control wholly on screen before one that is only partly there. One read of the boxes (nothing is dirty).
    const at = new Map(), vw = innerWidth, vh = innerHeight;
    const box = (h) => { let c = at.get(h); if (!c) { const b = h.el.getBoundingClientRect(); c = [b.left + b.width / 2, b.top + b.height / 2, b.top >= 0 && b.bottom <= vh && b.left >= 0 && b.right <= vw]; at.set(h, c); } return c; };
    const busy = [...S.dropping.keys()].filter((h) => h.live).map(box);
    const pick = (pool, n, map, cls, prop, lo, span) => {
      const free = pool.filter((h) => !map.has(h));
      for (let i = 0; i < n && free.length; i += 1) {
        let best = -1, bs = -Infinity;
        free.forEach((h, k) => {
          const c = box(h);
          let d = busy.length ? Infinity : 1e4;
          for (const q of busy) d = Math.min(d, Math.hypot(c[0] - q[0], c[1] - q[1]));
          const sc = (c[2] ? d : d * 0.25) * (0.5 + Math.min(1, (now - (h.restAt || 0)) / 8000)) * (0.6 + 0.8 * Math.random());   // and one that has rested longest
          if (sc > bs) { bs = sc; best = k; }
        });
        const h = free.splice(best, 1)[0];
        busy.push(box(h));
        if (prop) h.span.style.setProperty(prop, `${(lo + Math.random() * span).toFixed(2)}s`);
        h.span.classList.add(cls); map.set(h, now);
      }
    };
    pick(drippers, nD, S.dropping, "vk-dip-drop", null);
  }

  // ---------------------------------------------------------------------------------------- pointer
  const hostOf = (target) => {
    for (let el = target; el && el !== document; el = el.parentElement) { const h = S.byEl.get(el); if (h && h.kind === "control") return h; }
    return null;
  };
  const onMove = (e) => {
    if (e.pointerType === "touch" && !S.pressed) return;
    S.pointer = { x: e.clientX, y: e.clientY };
    if (S.running || S.mode !== "on" || S.reduced) return;
    if (S.dirty) refreshRects();
    const nh = nearestHost(S.hosts, e.clientX, e.clientY);
    if (nh) { setNear(S.hosts[nh.i]); wake(); }
  };
  const onDown = (e) => {
    const h = hostOf(e.target);
    if (!h || h.dry || !h.span) return;
    S.pressed = h; S.pointer = { x: e.clientX, y: e.clientY }; S.pq = S.pv = null;   // a new press starts without the last tap's speed
    h.span.classList.add("vk-dip-press");
    if (S.mode === "on" && !S.reduced) { S.dirty = true; wake(); }
  };
  const onUp = (e) => {
    const h = S.pressed;
    if (h) { S.pressed = null; h.span?.classList.remove("vk-dip-press"); flash(h); release(false); S.quiet = performance.now() + 560; }   // the snap shows alone: no near tongue for 0.56 s (the tip is home at about 0.5 s)
    if (e.pointerType === "touch") { S.pointer = null; S.pq = S.pv = null; }
  };
  const onOut = (e) => { if (!e.relatedTarget) { S.pointer = null; S.pq = S.pv = null; } };
  // while the page or a box scrolls the lobes (placed by viewport position) step aside; they come back where the hosts now are
  const onScroll = () => {
    S.dirty = true;
    if (!lobeRoot || lobeRoot.hidden) return;
    S.scrolling = true; lobeRoot.classList.add("vk-dip-lobes--away");
    clearTimeout(S.scrollT); S.scrollT = setTimeout(() => { S.scrollT = 0; S.scrolling = false; layoutLobes(true); lobeRoot?.classList.remove("vk-dip-lobes--away"); }, 180);
  };
  // a transition of a size or place property ends: the room around controls may have changed (our own layers' transitions do not count)
  const LAYOUT_PROP = /^(width|height|min-|max-|margin|padding|top|left|right|bottom|inset|flex|grid|gap|font|line-height|border-\w+-width)/;
  const onTrans = (e) => { queueFollow(); if (LAYOUT_PROP.test(e.propertyName || "") && !(e.target.closest && e.target.closest(".vk-dip"))) queueRemeasure(100); };
  // a window or zoom change: the overlay is sized now, the layers are measured again once it settles (the room at the page edge,
  // the picture scale and the sibling places all depend on it)
  const onResize = () => {
    if (!S.built) return;
    sizeOverlay(); placeSibs(); onScroll();
    S.dpr = window.devicePixelRatio || 1;
    clearTimeout(S.allT); S.allT = setTimeout(() => { S.allT = 0; if (S.built) measureMany(S.hosts); }, 120);
  };
  const onLoad = () => { if (S.built) { measureMany(S.hosts); placeSibs(); } };
  // the screen scale changes without a resize (the window moves to another monitor): a media query on the scale tells
  let dprMq = null;
  const onDpr = () => { watchDpr(); if ((window.devicePixelRatio || 1) !== S.dpr) onResize(); };
  function watchDpr(on = true) {
    dprMq?.removeEventListener?.("change", onDpr); dprMq = null;
    if (on && window.matchMedia) { dprMq = window.matchMedia("(resolution: " + (window.devicePixelRatio || 1) + "dppx)"); dprMq.addEventListener?.("change", onDpr); }
  }
  const onVis = () => {
    S.hidden = document.visibilityState === "hidden";
    if (S.hidden) { html.setAttribute("data-vk-dip-hidden", ""); sleep(); stopRest(); } else { html.removeAttribute("data-vk-dip-hidden"); wake(); queueRemeasure(200); queueLobes(); }
  };
  const lightWanted = () => lightWantedOf({ light: opt.light, mode: S.mode, reduced: S.reduced });   // mount option light: 0 = no travelling light at all
  // the light pictures are painted only while the light can show: when that changes, every host is measured again (a new key, a new picture set)
  function lightSync() { const on = lightWanted(); if (!on) { S.lightOn = false; return; } if (S.lightOn) return; S.lightOn = true; if (S.built && S.hosts.length) { measureMany(S.hosts); S.dirty = true; } }   // only turning ON paints: going to cheap (the Lab records audio) repaints nothing
  const onRM = () => { S.reduced = !!RM?.matches; if (S.reduced) { sleep(); stopRest(); } else { wake(); queueLobes(); } lightSync(); };
  let pinTimer = 0;
  function listen(on) {
    const f = on ? "addEventListener" : "removeEventListener";
    window[f]("pointermove", onMove, { passive: true, capture: true });
    window[f]("pointerdown", onDown, { passive: true, capture: true });
    window[f]("pointerup", onUp, { passive: true, capture: true });
    window[f]("pointercancel", onUp, { passive: true, capture: true });
    document[f]("pointerout", onOut, { passive: true });
    window[f]("scroll", onScroll, { passive: true, capture: true });
    window[f]("resize", onResize, { passive: true });
    window[f]("load", onLoad);
    document[f]("transitionend", onTrans, { capture: true, passive: true });
    if (on) document.fonts?.ready?.then(onLoad);
    document[f]("visibilitychange", onVis);
    RM?.[f]?.("change", onRM);
    watchDpr(on); if (on) S.dpr = window.devicePixelRatio || 1;
    clearInterval(pinTimer); clearInterval(S.restT);
    if (on) {
      pinTimer = setInterval(() => { if (!S.running && pinsLive()) { S.dirty = true; wake(); } }, 700);
      S.restT = setInterval(() => { followSibs(); rest(); layoutLobes(false); checkDoc(); }, 450);
    } else stopRest();
  }

  // ---------------------------------------------------------------------------------------- build / tear down / modes
  function build() {
    if (S.built) return;
    S.built = true;
    opt.root = opt.root || document.body;
    S.hidden = document.visibilityState === "hidden";           // read again: they may have changed since the last time it was on
    S.reduced = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    S.lightOn = lightWanted();   // the first scan paints the light only if it can show
    observe(); scan(); makeOverlay(); listen(true);
    if (S.hidden) html.setAttribute("data-vk-dip-hidden", "");
  }
  function teardown() {
    if (!S.built) return;
    S.built = false;
    sleep(); listen(false);
    S.io?.disconnect(); S.ro?.disconnect(); S.mo?.disconnect(); S.io = S.ro = S.mo = null;
    clearTimeout(S.lobeT); S.lobeT = 0; clearTimeout(S.scrollT); S.scrollT = 0; S.scrolling = false; dropLobes();
    clearTimeout(S.rescanT); S.rescanT = 0; clearTimeout(S.allT); S.allT = 0; clearTimeout(S.followT); S.followT = 0;
    clearTimeout(S.roT); S.roT = 0; S.roPend.clear(); clearTimeout(S.remT); S.remT = 0; S.docW = S.docH = -1;
    if (S.idle) { cic(S.idle); S.idle = 0; }
    for (const h of [...S.hosts]) dropHost(h);
    overlay?.remove(); overlay = null; g = null;
    if (work) { work.width = work.height = 0; work = null; }
    if (lightWork) { lightWork.width = lightWork.height = 0; lightWork = null; }
    clearTimeout(S.graveT); S.graveT = 0;
    for (const u of S.grave.splice(0)) URL.revokeObjectURL(u);
    for (const c of S.cache.values()) { if (c.url) URL.revokeObjectURL(c.url); if (c.light) URL.revokeObjectURL(c.light); }
    S.cache.clear(); S.queue.length = 0; S.strands.clear(); S.drops = []; S.near = null; S.pressed = null; S.pointer = null;
    html.removeAttribute("data-vk-dip-hidden");
  }
  function cancelWait() { if (S.waitDom) { document.removeEventListener("DOMContentLoaded", S.waitDom); S.waitDom = null; } }
  function setMode(m) {
    m = normMode(m);
    S.mode = m;
    if (m === "off") { cancelWait(); teardown(); html.removeAttribute(ATTR); return ctl; }
    html.setAttribute(ATTR, m);
    if (!document.body) {   // mounted from <head>: build when the page has a body
      if (!S.waitDom) { S.waitDom = () => { S.waitDom = null; setMode(S.mode); }; document.addEventListener("DOMContentLoaded", S.waitDom, { once: true }); }
      return ctl;
    }
    build();
    if (m === "cheap") { sleep(); stopRest(); } else { wake(); queueLobes(); }
    lightSync();
    return ctl;
  }

  const ctl = {
    version: VERSION,
    setMode, mode: (m) => (m === undefined ? S.mode : setMode(m)),
    refresh() { if (!S.built) return ctl; scan(); measureMany(S.hosts); S.dirty = true; return ctl; },
    stats() {
      const f = S.stats.frames, avg = f.length ? f.reduce((a, b) => a + b, 0) / f.length : 0;
      return { mode: S.mode, hosts: S.hosts.length, live: S.hosts.filter((h) => h.live).length, sprites: S.stats.sprites, spriteMs: +S.stats.spriteMs.toFixed(1),
        pending: S.queue.length, running: S.running, lobes: S.stats.lobes || 0, lobeMs: +(S.stats.lobeMs || 0).toFixed(2), drops: S.dropping.size, loopFrames: S.stats.loopFrames, loopMsAvg: +avg.toFixed(3), strands: S.strands.size, reduced: S.reduced, hidden: S.hidden,
        measures: S.stats.measures, followRuns: S.stats.followRuns, followMsAvg: +(S.stats.followMs / Math.max(1, S.stats.followRuns)).toFixed(4),
        cache: S.cache.size, box: S.box ? S.box.slice() : null, org: S.org ? S.org.slice() : null };
    },
    destroy() { cancelWait(); teardown(); html.removeAttribute(ATTR); instance = null; },
  };
  setMode(S.mode);
  return ctl;
}

const api = {
  version: VERSION, modes: MODES, attr: ATTR, math,
  /** VkDip.mount({ mode: "on" | "cheap" | "off", root, controls: "<css selector>", edges: "<css selector>", light: 1 | 0 })
   *  light (default 1): 0 = mode "on" without the travelling light (no light pictures painted, no light elements in the page); drips, flows, hover, the press tongue and the spring-back stay alive.
   *   -> controller (one per page; a second call returns the same one) */
  mount(options) {
    if (typeof document === "undefined") throw new Error("VkDip.mount needs a browser document");
    if (instance) { if (options?.mode) instance.setMode(options.mode); return instance; }
    instance = createDip(options);
    return instance;
  },
};
const root = typeof globalThis !== "undefined" ? globalThis : this;
if (typeof module === "object" && module && module.exports) module.exports = api;
if (root) root.VkDip = api;
})();
