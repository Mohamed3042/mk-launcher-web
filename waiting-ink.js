// The pen on the Waiting board, with no DOM: when a touch becomes ink or a scroll, whether a stroke strikes a slip,
// whether a second stroke crosses the first (an X), and the settled hand-drawn line each mark leaves on its slip.
// Coordinates are a slip's own: (0,0) is its top-left corner before its slight turn, in CSS pixels.
// Tested with node --test (tests/web/waiting-ink.test.mjs).
import { seeded } from "./waiting-rules.js";

// ---------- ink or scroll (a touch that starts on the paper) ----------
// The rule, tuned on a 390x844 touch screen:
//  - mouse and stylus: always ink (they never scroll the page);
//  - a finger held still for PEN_DOWN_MS first: ink (pen down), whatever way it then goes;
//  - a finger that sets off across or on a slant (|dx| >= 0.75 |dy|): ink; the page never scrolls sideways;
//  - a finger that sets off up or down: a scroll, unless it starts well inside a slip and moves slowly
//    (under SLOW px/ms), the way a pen draws a slash and a thumb never scrolls.
// Decided once, on the first move past SLOP px; until then it waits.
export const PEN_DOWN_MS = 150;
export const SLOP = 6;
export const SLOW = 0.28;
export function decide({ dx = 0, dy = 0, dt = 0, still = 0, inside = false, pointerType = "touch" }) {
  if (pointerType !== "touch") return "ink";
  if (still >= PEN_DOWN_MS) return "ink";
  const d = Math.hypot(dx, dy);
  if (d < SLOP) return "wait";
  if (Math.abs(dx) >= Math.abs(dy) * 0.75) return "ink";
  if (inside && d / Math.max(dt, 1) < SLOW) return "ink";
  return "scroll";
}

// A client point into a slip's own coordinates. box: the slip's layout size (w, h), the centre of its on-screen
// bounding box (cx, cy) and its turn in degrees (rot); the turn is undone around the centre.
export function toLocal(x, y, { cx, cy, w, h, rot = 0 }) {
  const a = (-rot * Math.PI) / 180, dx = x - cx, dy = y - cy;
  return { x: dx * Math.cos(a) - dy * Math.sin(a) + w / 2, y: dx * Math.sin(a) + dy * Math.cos(a) + h / 2 };
}

// ---------- what a stroke did ----------
export const MIN_LEN = 22;
export function strokeInfo(pts, w, h) {
  const a = pts[0], b = pts[pts.length - 1];
  const chordLen = Math.hypot(b.x - a.x, b.y - a.y);
  let pathLen = 0, dev = 0;
  for (let i = 1; i < pts.length; i++) pathLen += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  if (chordLen > 0) for (const p of pts) dev = Math.max(dev, Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / chordLen);
  const cl = (v, m) => Math.min(Math.max(v, 0), m);
  const xs = pts.map((p) => cl(p.x, w)), ys = pts.map((p) => cl(p.y, h));
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return {
    chord: { x1: a.x, y1: a.y, x2: b.x, y2: b.y }, chordLen, pathLen,
    straight: pathLen ? chordLen / pathLen : 1, dev,
    spanX: w ? (Math.max(...xs) - Math.min(...xs)) / w : 0, spanY: h ? (Math.max(...ys) - Math.min(...ys)) / h : 0,
    midInside: mid.x >= -8 && mid.x <= w + 8 && mid.y >= -8 && mid.y <= h + 8,
  };
}

// One straight-ish line that crosses most of the slip's long side, or most of its short side, in any direction.
export function isStrike(pts, w, h) {
  if (!pts || pts.length < 2) return false;
  const s = strokeInfo(pts, w, h);
  return s.chordLen >= MIN_LEN && s.straight >= 0.8 && s.dev <= Math.max(7, s.chordLen * 0.16) && s.midInside &&
    (s.spanX >= 0.6 || s.spanY >= 0.7);
}

// Do two lines cross (an X), at a real angle (not two lines along each other)? Slips are long and low, so the angle is small.
export function crosses(c1, c2, minAngle = 4) { // on a 300x40 slip an X corner to corner is only ~15 degrees apart
  const d1 = { x: c1.x2 - c1.x1, y: c1.y2 - c1.y1 }, d2 = { x: c2.x2 - c2.x1, y: c2.y2 - c2.y1 };
  const den = d1.x * d2.y - d1.y * d2.x;
  if (!den) return false;
  const t = ((c2.x1 - c1.x1) * d2.y - (c2.y1 - c1.y1) * d2.x) / den;
  const u = ((c2.x1 - c1.x1) * d1.y - (c2.y1 - c1.y1) * d1.x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return false;
  const cos = Math.abs(d1.x * d2.x + d1.y * d2.y) / (Math.hypot(d1.x, d1.y) * Math.hypot(d2.x, d2.y));
  return Math.acos(Math.min(1, cos)) * (180 / Math.PI) >= minAngle;
}

// The infinite line through a chord, cut to the slip's box grown by pad; it keeps the chord's direction.
export function clipToBox(c, w, h, pad = 5) {
  const dx = c.x2 - c.x1, dy = c.y2 - c.y1;
  let t0 = -Infinity, t1 = Infinity;
  for (const [p, q0, lo, hi] of [[dx, c.x1, -pad, w + pad], [dy, c.y1, -pad, h + pad]]) {
    if (!p) { if (q0 < lo || q0 > hi) return null; continue; }
    const a = (lo - q0) / p, b = (hi - q0) / p;
    t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
  }
  if (!(t1 > t0) || !Number.isFinite(t0)) return null;
  return { x1: c.x1 + dx * t0, y1: c.y1 + dy * t0, x2: c.x1 + dx * t1, y2: c.y1 + dy * t1 };
}

// Chords are kept per slip in 0..1 of its width and height, so a line survives a reflow and a reload.
export const norm = (c, w, h) => [c.x1 / w, c.y1 / h, c.x2 / w, c.y2 / h].map((v) => Math.round(v * 1000) / 1000);
export const denorm = (n, w, h) => ({ x1: n[0] * w, y1: n[1] * h, x2: n[2] * w, y2: n[3] * h });

// The line the pen draws by itself (a tap, a key): one stroke along the writing, a slight slope; the second line of
// an X goes corner to corner across it. dir: "rtl" draws from the right.
export function autoChord(seed, n = 0, dir = "ltr") {
  const r = seeded(`${seed}:pen${n}`);
  let c;
  if (n === 0) {
    const y = 0.5 + (r() - 0.5) * 0.12, tilt = (r() - 0.5) * 0.16;
    c = [0.03, y + tilt, 0.97, y - tilt];
  } else {
    const a = 0.12 + r() * 0.1, b = 0.84 + r() * 0.1;
    c = n === 1 ? [0.07, a, 0.93, b] : [0.07, b, 0.93, a];
  }
  return dir === "rtl" ? [1 - c[0], c[1], 1 - c[2], c[3]] : c;
}

// ---------- the settled line ----------
// From a stroke's chord: a clean hand-drawn line right through the slip, a touch past its edges, with a slight bow,
// a round nib start and a flicked tail. kind: "done" (the stroke) or "cross" (a line of the X, a little finer).
export function settle(c, w, h, seed, kind = "done") {
  const edge = clipToBox(c, w, h, 0) || c; // edge to edge, then 6 px past each edge along the line itself
  const l0 = Math.hypot(edge.x2 - edge.x1, edge.y2 - edge.y1) || 1;
  const ux = (edge.x2 - edge.x1) / l0, uy = (edge.y2 - edge.y1) / l0;
  const cut = { x1: edge.x1 - ux * 6, y1: edge.y1 - uy * 6, x2: edge.x2 + ux * 6, y2: edge.y2 + uy * 6 };
  const r = seeded(`${seed}:ink`);
  const len = l0 + 12;
  const bow = (r() < 0.5 ? -1 : 1) * (0.6 + r() * 1.1);
  const base = kind === "cross" ? 2.3 : 2.8;
  const n = Math.max(14, Math.round(len / 7));
  const ph = r() * 6.28, ph2 = r() * 6.28;
  const pts = [], widths = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const off = bow * Math.sin(Math.PI * t) + 0.25 * Math.sin(ph + t * 11);
    pts.push({ x: cut.x1 + ux * len * t - uy * off, y: cut.y1 + uy * len * t + ux * off });
    const press = 1 + 0.08 * Math.sin(ph2 + t * 7);
    const shape = t < 0.06 ? 0.86 + (t / 0.06) * 0.14 : t > 0.72 ? 1 - ((t - 0.72) / 0.28) ** 1.6 * 0.82 : 1 - 0.1 * t;
    widths.push(+(base * press * shape).toFixed(3));
  }
  return { pts, widths, chord: cut };
}

const f = (v) => (Math.round(v * 100) / 100).toString();
// A filled ribbon around the points, as wide as widths says at each, with a round start.
export function ribbon(pts, widths) {
  if (pts.length < 2) return "";
  const left = [], right = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / l, ny = (b.x - a.x) / l, hw = widths[i] / 2;
    left.push([pts[i].x + nx * hw, pts[i].y + ny * hw]);
    right.push([pts[i].x - nx * hw, pts[i].y - ny * hw]);
  }
  const p0 = pts[0], p1 = pts[1], l0 = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
  const dx = (p1.x - p0.x) / l0, dy = (p1.y - p0.y) / l0, nx = -dy, ny = dx, hw = widths[0] / 2;
  const cap = [];
  for (let k = 1; k < 8; k++) { // around the back of the nib, from the right side to the left
    const th = -Math.PI / 2 + (k / 8) * Math.PI;
    cap.push([p0.x + hw * (Math.cos(th) * -dx + Math.sin(th) * nx), p0.y + hw * (Math.cos(th) * -dy + Math.sin(th) * ny)]);
  }
  const ring = [...left, ...right.reverse(), ...cap];
  return `M${ring.map(([x, y]) => `${f(x)} ${f(y)}`).join("L")}Z`;
}

export const centerline = (pts) => `M${pts.map((p) => `${f(p.x)} ${f(p.y)}`).join("L")}`;
export function lengthOf(pts) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return l;
}

// ---------- the wet ink under the finger ----------
// The nib's width breathes with speed (px/ms): slow is full, fast is fine; eased so it never jumps.
export function nibWidth(prev, speed) {
  const target = Math.min(3.6, Math.max(1.4, 3.6 - speed * 1.5));
  return prev == null ? target : prev + (target - prev) * 0.35;
}
// The flick when the pen lifts: a short tail on along the last direction, longer the faster it left.
export function tail(pts) {
  const n = pts.length;
  if (n < 3) return [];
  const a = pts[Math.max(0, n - 4)], b = pts[n - 1];
  const dt = Math.max(1, b.t - a.t), vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt, v = Math.hypot(vx, vy);
  const len = Math.min(16, v * 22);
  if (len < 2) return [];
  return [0.35, 0.7, 1].map((k) => ({ x: b.x + (vx / v) * len * k, y: b.y + (vy / v) * len * k }));
}
