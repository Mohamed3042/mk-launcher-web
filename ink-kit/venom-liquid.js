/* The shared ink kit (see VERSION). */
"use strict";
(() => {
const VERSION = "0.2.0";
const ROLES = ["collar", "pod", "card", "top", "ring", "panel"];
const STATES = ["idle", "listening", "working", "calm"];
const MODES = ["full", "cheap", "still"];
function createEngine(host, options) {
  const TAU = Math.PI * 2;
  const INK = "#020202";
  const opt = Object.assign({ fps: 30, creature: true, density: 1, glints: true, film: true, mode: "full", enabled: true, desk: "auto" }, options || {});
  const FRAME_MS = 1000 / Math.max(5, Math.min(60, opt.fps));
  const CHEAP_MS = 1000 / Math.min(12, Math.max(5, opt.fps));
  const NOTCH = [1, 0.8, 0.64, 0.5];   // the budget guard's resolution steps (never below the last: the 2D fallback's quality)
  const GLINTS = () => !!opt.glints && !L.lean;
  const DPR_CAP = 1.5;
  const PX_BUDGET = 2.1e6;
  const MAP_BUDGET = 3.4e5;   // texels in the height map (CSS size on a phone, about 0.35 of it on a big screen)
  // a wide window is a STAGE and a PANEL (components.css, the same query): the creature owns the stage and holds the record
  // button in its maw, every word lives in the glass panel. It turns on only when the host marks a panel (data-vk-role="panel")
  const DESK_Q = window.matchMedia ? window.matchMedia("(min-width: 1000px) and (orientation: landscape)") : null;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const heavy = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const back = (t) => { t = clamp(t, 0, 1); const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const still = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const fill = (c) => { Object.assign(c.style, { position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none" }); return c; };
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const wob = (seed, i, t) => Math.sin(seed * 12.9 + i * 1.7 + t * 1.3) * 0.6 + Math.sin(seed * 7.1 + i * 3.1 - t * 0.9) * 0.4;
  let rs = 7;
  const rand = () => { rs = (rs * 16807) % 2147483647; return (rs - 1) / 2147483646; };
  const pick = (a) => a[Math.floor(rand() * a.length) % a.length];
  // light from the upper left
  const LX = -0.55, LY = -0.83;

  // ============================================================================================ drawing kit (2D)
  /** Catmull-Rom: ``P`` with ``k`` points between each pair (smooth curves from few simulated points). */
  function smoothPts(P, k = 2) {
    const out = [];
    for (let i = 0; i < P.length - 1; i += 1) {
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
      for (let j = 0; j < k; j += 1) {
        const s = j / k, s2 = s * s, s3 = s2 * s;
        out.push([
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * s + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * s2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * s3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * s + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * s2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * s3)]);
      }
    }
    out.push(P[P.length - 1]);
    return out;
  }
  /** Unit normals along a polyline (closed: wraps round). */
  function normals(P, closed) {
    const n = P.length, N = new Array(n);
    for (let i = 0; i < n; i += 1) {
      const p = closed ? P[(i - 1 + n) % n] : P[Math.max(0, i - 1)], q = closed ? P[(i + 1) % n] : P[Math.min(n - 1, i + 1)];
      const dx = q[0] - p[0], dy = q[1] - p[1], d = Math.hypot(dx, dy) || 1;
      N[i] = [-dy / d, dx / d];
    }
    return N;
  }
  /** The body of a tube: the outline of ``P`` with width ``W[i] * f`` per point, filled. */
  function body(g, P, N, W, closed, fill = INK, f = 1) {
    const n = P.length;
    if (closed) {
      g.beginPath();
      for (let i = 0; i < n; i += 1) { const h = W[i] * f / 2; const x = P[i][0] + N[i][0] * h, y = P[i][1] + N[i][1] * h; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.closePath();
      for (let i = n - 1; i >= 0; i -= 1) { const h = W[i] * f / 2; const x = P[i][0] - N[i][0] * h, y = P[i][1] - N[i][1] * h; if (i === n - 1) g.moveTo(x, y); else g.lineTo(x, y); }
      g.closePath(); g.fillStyle = fill; g.fill("evenodd");
      return;
    }
    // an open rope is filled in short pieces: a rope that loops over itself must not fill the inside of its loop
    g.beginPath();
    const K = 8;
    for (let a = 0; a < n - 1; a += K) {
      const b = Math.min(n - 1, a + K);
      for (let i = a; i <= b; i += 1) { const h = W[i] * f / 2, x = P[i][0] + N[i][0] * h, y = P[i][1] + N[i][1] * h; if (i === a) g.moveTo(x, y); else g.lineTo(x, y); }
      for (let i = b; i >= a; i -= 1) { const h = W[i] * f / 2; g.lineTo(P[i][0] - N[i][0] * h, P[i][1] - N[i][1] * h); }
      g.closePath();
    }
    g.fillStyle = fill; g.fill();
  }
  /** Points of a line along the tube at ``f`` of its half width toward the light (negative: the back). */
  function lineAt(P, N, W, f) {
    const n = P.length, out = new Array(n);
    for (let i = 0; i < n; i += 1) {
      const s = clamp((N[i][0] * LX + N[i][1] * LY) * 2.5, -1, 1), o = W[i] * 0.5 * f * s;
      out[i] = [P[i][0] + N[i][0] * o, P[i][1] + N[i][1] * o];
    }
    return out;
  }
  function poly(g, Q, closed) {
    g.beginPath(); g.moveTo(Q[0][0], Q[0][1]);
    for (let i = 1; i < Q.length; i += 1) g.lineTo(Q[i][0], Q[i][1]);
    if (closed) g.closePath();
  }
  /** Stroke ``Q`` in short pieces whose brightness comes from ``lum(i)`` (0..1), in six batches. */
  function glint(g, Q, lum, rgb, amax, width, closed) {
    const n = Q.length, step = 2, K = 6, B = [[], [], [], [], [], []];
    for (let i = 0; i < n - (closed ? 0 : 1); i += step) {
      const v = lum(i);
      if (v < 0.06) continue;
      B[Math.min(K - 1, Math.floor(v * K))].push(i);
    }
    for (let b = 0; b < K; b += 1) {
      if (!B[b].length) continue;
      g.beginPath();
      for (const i of B[b]) {
        g.moveTo(Q[i][0], Q[i][1]);
        for (let j = 1; j <= step; j += 1) { const q = Q[(i + j) % n]; if (!closed && i + j >= n) break; g.lineTo(q[0], q[1]); }
      }
      g.strokeStyle = `rgba(${rgb},${(amax * (b + 1) / K).toFixed(3)})`; g.lineWidth = width; g.stroke();
    }
  }
  /** A glossy wet tube (the 2D look): black body, light on both edges, a specular streak that travels. */
  function tube(g, P, W, o = {}) {
    if (!P || P.length < 2) return;
    const a = o.a ?? 1, closed = !!o.closed, N = normals(P, closed), n = P.length;
    body(g, P, N, W, closed, o.fill || INK);
    let wmax = 0; for (const w of W) wmax = Math.max(wmax, w);
    const S = new Float32Array(n); for (let i = 1; i < n; i += 1) S[i] = S[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    const t = o.t || 0, sp = o.speed ?? 16, lam = o.wave || 150, ph = (o.seed || 0) * 7;
    const face = (i) => clamp((N[i][0] * LX + N[i][1] * LY) * 1.6, -1, 1);
    const trav = (i, k, p = 3) => { const x = (S[i] - t * sp) / (lam * 1.5) * TAU + ph + k; const v = 0.62 * Math.sin(x) + 0.38 * Math.sin(x * 2.71 + k * 1.7 + ph * 0.3); return v > 0 ? Math.pow(Math.min(1, v * 1.15), p) : 0; };
    g.lineCap = "round"; g.lineJoin = "round";
    const E1 = lineAt(P, N, W, 0.8);
    g.strokeStyle = `rgba(255,255,255,${0.22 * a})`; g.lineWidth = Math.max(0.8, Math.min(1.4, wmax * 0.07)); poly(g, E1, closed); g.stroke();
    glint(g, E1, (i) => trav(i, 1.3, 3) * (0.5 + 0.5 * Math.abs(face(i))), "255,255,255", a, Math.max(1, Math.min(2.2, wmax * 0.11)), closed);
    if (wmax > 4) glint(g, lineAt(P, N, W, 0.45), (i) => trav(i, 0, 6) * (0.4 + 0.6 * Math.max(0, face(i))), "255,255,255", a, clamp(wmax * 0.16, 1.2, 3.6), closed);
    if (o.red && GLINTS()) {
      const rr = (i) => { const v = Math.sin((S[i] - t * 7) / (lam * 2.7) * TAU + o.red); return v > 0.94 ? (v - 0.94) * 16 : 0; };
      glint(g, lineAt(P, N, W, -0.5), rr, "210,22,42", 0.95 * a, clamp(wmax * 0.12, 0.8, 2), closed);
    }
    g.lineCap = "butt";
  }
  /** A bead of liquid (2D): black, a hot speck of light upper left. */
  function bead(g, x, y, r, a = 1) {
    if (r < 0.4) return;
    g.fillStyle = INK; g.beginPath(); g.ellipse(x, y, r * 0.92, r * 1.08, 0, 0, TAU); g.fill();
    g.strokeStyle = `rgba(255,255,255,${0.75 * a})`; g.lineWidth = Math.max(0.8, r * 0.22); g.lineCap = "round";
    g.beginPath(); g.arc(x, y, r * 0.62, Math.PI * 1.05, Math.PI * 1.45); g.stroke(); g.lineCap = "butt";
  }
  const qpt = (a, c, b, s) => (1 - s) * (1 - s) * a + 2 * (1 - s) * s * c + s * s * b;
  /** Points of a quadratic curve. */
  function curve(x1, y1, cx, cy, x2, y2, n = 10) {
    const P = [];
    for (let i = 0; i <= n; i += 1) { const s = i / n; P.push([qpt(x1, cx, x2, s), qpt(y1, cy, y2, s)]); }
    return P;
  }
  /** A closed liquid blob (never a clean circle). Adds a new path. */
  function blob(g, x, y, r, seed, t, amount = 0.12, sx = 1, sy = 1) {
    const n = 12, pts = [];
    for (let i = 0; i < n; i += 1) { const a = (i / n) * TAU, rr = r * (1 + amount * wob(seed, i, t)); pts.push([x + Math.cos(a) * rr * sx, y + Math.sin(a) * rr * sy]); }
    g.beginPath();
    for (let i = 0; i <= n; i += 1) {
      const p = pts[i % n], q = pts[(i + 1) % n], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      if (i === 0) g.moveTo(mx, my); else g.quadraticCurveTo(p[0], p[1], mx, my);
    }
    g.closePath();
  }

  /** A closed smooth outline through ``Q`` (quadratic curves through the midpoints). Adds a new path. */
  function loopPath(g, Q) {
    const n = Q.length;
    g.beginPath();
    for (let i = 0; i <= n; i += 1) {
      const p = Q[i % n], q = Q[(i + 1) % n], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      if (i === 0) g.moveTo(mx, my); else g.quadraticCurveTo(p[0], p[1], mx, my);
    }
    g.closePath();
  }

  // ============================================================================================ the two pens
  // The scene is drawn once through a pen. The height pen draws into the map for the WebGL pass (red: height, added
  // up; green: light; blue: darkness); the 2D pen draws glossy tubes straight onto the visible canvas (the fallback).
  const HR = (a) => `rgba(255,0,0,${a.toFixed(3)})`;
  const PEN_H = {
    gl: true, g: null,
    rope(P, W, o = {}) {
      if (!P || P.length < 2) return;
      const g = this.g, a = o.a ?? 1, closed = !!o.closed, N = normals(P, closed);
      body(g, P, N, W, closed, HR(0.2 * a));            // the body: a flat plateau...
      body(g, P, N, W, closed, HR(0.15 * a), 0.55);     // ...and its core: with the blur, a rounded dome
    },
    line(x1, y1, cx, cy, x2, y2, w, a = 1) {
      if (L.lean) return;   // cheap: no hair threads
      const g = this.g;
      g.strokeStyle = HR(0.75 * a); g.lineWidth = Math.max(1.9, w); g.lineCap = "round";
      g.beginPath(); g.moveTo(x1, y1); g.quadraticCurveTo(cx, cy, x2, y2); g.stroke(); g.lineCap = "butt";
    },
    bead(x, y, r, a = 1) {
      if (r < 0.5) return;
      const g = this.g;
      g.fillStyle = HR(0.24 * a); g.beginPath(); g.ellipse(x, y, r * 0.95, r * 1.08, 0, 0, TAU); g.fill();
      g.fillStyle = HR(0.17 * a); g.beginPath(); g.arc(x, y + r * 0.1, r * 0.55, 0, TAU); g.fill();
    },
    web(Q, a = 1) { const g = this.g; poly(g, Q, true); g.fillStyle = HR(0.26 * a); g.fill(); },
    glow(x, y, r, a) {
      const g = this.g, gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(0,255,0,${a})`); gr.addColorStop(0.4, `rgba(0,255,0,${a * 0.35})`); gr.addColorStop(1, "rgba(0,255,0,0)");
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    },
    dark(x, y, rx, ry, a) {
      const g = this.g; g.save(); g.translate(x, y); g.scale(rx, ry);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      gr.addColorStop(0, `rgba(0,0,255,${a})`); gr.addColorStop(0.55, `rgba(0,0,255,${a * 0.75})`); gr.addColorStop(1, "rgba(0,0,255,0)");
      g.fillStyle = gr; g.fillRect(-1, -1, 2, 2); g.restore();
    },
    /** A sheet of liquid: the outline at ``a`` height and its core (shrunk toward cx, cy) raised: a rounded slab. */
    plate(Q, core, a) {
      const g = this.g;
      // the outline alone stays under the threshold: only where sinews lie on it does it become liquid (a mass of
      // fused strands with dark gaps); the core is one solid mass
      loopPath(g, Q); g.fillStyle = HR(0.085 * a); g.fill();
      loopPath(g, core); g.fillStyle = HR(0.08 * a); g.fill();
    },
    /** No liquid here (an eye socket, the open maw): red to zero, light and dark stay. */
    cut(Q) {
      const g = this.g; g.globalCompositeOperation = "multiply";
      loopPath(g, Q); g.fillStyle = "rgb(0,255,255)"; g.fill();
      g.globalCompositeOperation = "lighter";
    },
    mass(pts, H) {
      const g = this.g;
      for (const [off, al] of [[14, 0.14], [30, 0.12], [50, 0.12]]) {
        g.beginPath(); g.moveTo(pts[0][0], H + 10);
        for (const [x, y] of pts) g.lineTo(x, y + off);
        g.lineTo(pts[pts.length - 1][0], H + 10); g.closePath(); g.fillStyle = HR(al); g.fill();
      }
    },
    arc(x, y, r, a0, a1, w, al) {
      const g = this.g; g.strokeStyle = `rgba(0,255,0,${al})`; g.lineWidth = w; g.lineCap = "round";
      g.beginPath(); g.arc(x, y, r, a0, a1); g.stroke(); g.lineCap = "butt";
    },
  };
  const PEN_2D = {
    gl: false, g: null,
    rope(P, W, o = {}) { let m = 0; for (const w of W) m = Math.max(m, w); if (m >= 3) tube(this.g, P, W, o); },
    line() {},   // no hair scribbles in the fallback
    bead(x, y, r, a = 1) { bead(this.g, x, y, r, a); },
    web(Q, a = 1) { const g = this.g; poly(g, Q, true); g.fillStyle = `rgba(2,2,2,${0.9 * a})`; g.fill(); },
    glow(x, y, r, a) {
      const g = this.g, gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.4, `rgba(255,255,255,${a * 0.3})`); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    },
    dark(x, y, rx, ry, a) {
      const g = this.g; g.save(); g.translate(x, y); g.scale(rx, ry);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(0.55, `rgba(0,0,0,${a * 0.8})`); gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr; g.fillRect(-1, -1, 2, 2); g.restore();
    },
    plate(Q, core, a) {
      const g = this.g; let x0 = Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of Q) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
      const gr = g.createLinearGradient(0, y0, 0, y1);
      gr.addColorStop(0, `rgba(14,14,14,${a})`); gr.addColorStop(0.5, `rgba(4,4,4,${a})`); gr.addColorStop(1, `rgba(1,1,1,${a})`);
      loopPath(g, Q); g.fillStyle = gr; g.fill();
      g.strokeStyle = `rgba(255,255,255,${0.16 * a})`; g.lineWidth = 1.2; g.stroke();
    },
    cut(Q) { const g = this.g; loopPath(g, Q); g.fillStyle = "#000"; g.fill(); },
    mass(pts, H) {
      const g = this.g; let top = H; for (const p of pts) top = Math.min(top, p[1]);
      const grd = g.createLinearGradient(0, top, 0, H);
      grd.addColorStop(0, "#181818"); grd.addColorStop(0.12, "#060606"); grd.addColorStop(1, "#000");
      g.fillStyle = grd; g.beginPath(); g.moveTo(pts[0][0], H + 4);
      for (const [x, y] of pts) g.lineTo(x, y);
      g.lineTo(pts[pts.length - 1][0], H + 4); g.closePath(); g.fill();
    },
    arc(x, y, r, a0, a1, w, al) {
      const g = this.g; g.strokeStyle = `rgba(255,255,255,${al})`; g.lineWidth = w; g.lineCap = "round";
      g.beginPath(); g.arc(x, y, r, a0, a1); g.stroke(); g.lineCap = "butt";
    },
  };
  /** A tapered strand along a quadratic curve: w1 at the start, w2 at the end, thinner in the middle by ``pinch``. */
  function strand(pen, x1, y1, cx, cy, x2, y2, w1, w2, pinch, o = {}) {
    const P = curve(x1, y1, cx, cy, x2, y2, o.n || 10);
    const W = P.map((_, i) => { const s = i / (P.length - 1); return Math.max(0.6, lerp(w1, w2, s) * (1 - pinch * Math.sin(Math.PI * s))); });
    pen.rope(P, W, o);
    return P;
  }
  /** The same on a 2D context (the takeover and the result overlays). */
  function strand2d(g, x1, y1, cx, cy, x2, y2, w1, w2, pinch, o = {}) { PEN_2D.g = g; return strand(PEN_2D, x1, y1, cx, cy, x2, y2, w1, w2, pinch, o); }

  // ============================================================================================ the WebGL pass
  const VS = "attribute vec2 p;varying vec2 vUv;void main(){vUv=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}";
  const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform sampler2D uMap, uMid, uLow;
uniform vec2 uTx, uMx, uLx, uAsp, uFog, uVc;
uniform vec3 uGl[8];
uniform float uT, uK, uKm, uKf, uTh, uFogA, uRed, uGloss;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y);
}
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 4; i++) { s += a * noise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 3.1; a *= .5; } return s; }
float F(vec2 o) { return texture2D(uMap, vUv + o * uTx).r; }
float M(vec2 o) { return texture2D(uMid, vUv + o * uMx).r; }
float C(vec2 o) { return texture2D(uLow, vUv + o * uLx).r; }
void main() {
  vec2 uv = vUv, q = uv * uAsp;
  // the liquid: fine shapes plus a blurred copy (strands that come close fuse, a thinning one necks and snaps)
  float f1 = F(vec2(-.7, -.7)), f2 = F(vec2(.7, -.7)), f3 = F(vec2(-.7, .7)), f4 = F(vec2(.7, .7));
  float c0 = C(vec2(0.)), cl = C(vec2(-1., 0.)), cr = C(vec2(1., 0.)), cu = C(vec2(0., -1.)), cd = C(vec2(0., 1.));
  float ml = M(vec2(-1., 0.)), mr = M(vec2(1., 0.)), mu = M(vec2(0., -1.)), md = M(vec2(0., 1.));
  // the slope from wider, diagonal taps too: smoother normals (fewer 8-bit steps, so long streaks, not flecks)
  float d1 = M(vec2(-1., -1.)), d2 = M(vec2(1., -1.)), d3 = M(vec2(-1., 1.)), d4 = M(vec2(1., 1.));
  float h = ((f1 + f2 + f3 + f4) * .14 + (ml + mr + mu + md) * .07 + (c0 * 2. + cl + cr + cu + cd) * .06) * 1.4;
  vec2 gm = (vec2(mr - ml, md - mu) * 2. + vec2(d2 + d4 - d1 - d3, d3 + d4 - d1 - d2)) * .25;
  vec2 gr = vec2(cr - cl, cd - cu) * uK + gm * uKm * 2. + vec2(f2 + f4 - f1 - f3, f3 + f4 - f1 - f2) * uKf;
  vec2 rip = (vec2(noise(q * 26. + vec2(uT * .3, 0.)), noise(q * 26. + vec2(5.2, -uT * .25))) - .5) * .3;
  float m = smoothstep(uTh - .02, uTh + .03, h);
  vec3 N = normalize(vec3(-gr + rip * .05, 1.));
  vec3 R = reflect(vec3(0., 0., -1.), N);
  float edge = 1. - N.z;
  // black glass: a thin bright rim, two hard studio lights (long streaks along the ropes), and a studio reflected in
  // it that drifts, so the highlights travel along the wet skin
  float s1 = smoothstep(.9, .96, dot(R, normalize(vec3(-.5, -.62, .6))));
  float s2 = smoothstep(.95, .978, dot(R, normalize(vec3(.7, -.25, .67))));
  float env = smoothstep(.8, .9, noise(R.xy * 1.7 + q * vec2(.7, 1.1) + vec2(uT * .07, -uT * .05))) * .8;
  float rim = smoothstep(.42, .58, edge) * (1. - smoothstep(.62, .75, edge));
  float lit = clamp(dot(normalize(N.xy + 1e-4), normalize(vec2(-.55, -.8))) * .5 + .5, 0., 1.);
  float trav = smoothstep(.35, .75, noise(q * 9. + vec2(uT * .12, -uT * .09)));
  vec3 liq = vec3(.003) + vec3(.025) * smoothstep(.1, .5, edge) + vec3(.5) * rim * lit * lit * (.25 + .75 * trav) + vec3(1.) * (s1 * .95 + s2 * .7) * uGloss + vec3(.75) * env * smoothstep(.2, .45, edge) * uGloss;
  // a few deep red glints, light caught in blood-dark glass (a little more likely near the record button)
  // (the glints ride on the liquid: their places come from the page, 7 of them, drifting along the ropes)
  float rn = 0.;
  for (int i = 0; i < 8; i++) { vec2 d = (uv - uGl[i].xy) * uAsp; rn = max(rn, exp(-dot(d, d) / max(uGl[i].z * uGl[i].z, 1e-6))); }
  float red = smoothstep(.25, .6, rn) * smoothstep(.3, .6, noise(q * 38. + vec2(-uT * .1, uT * .07))) * smoothstep(.08, .3, edge) * (1. - smoothstep(.4, .6, edge)) * (1. - s1) * uRed;
  liq = mix(liq, vec3(.59, 0., .063) * (.7 + 1.2 * edge), red * .85);
  // the smoke behind: grey clouds round the middle, falling to black at the edges
  vec2 fd = (uv - uFog) * vec2(uAsp.x / max(uAsp.x, .9), 1.) * vec2(1.6, 1.3);
  float shape = exp(-dot(fd, fd) * 5.);
  float f = fbm(q * 2.3 + vec2(uT * .014, -uT * .009));
  float w = fbm(q * 5.6 + vec2(-uT * .022, uT * .012) + f * 1.6);
  // wisps: thin ridges of the warped noise, drifting, over a faint body
  float rg = 1. - abs(2. * fbm(q * vec2(2.2, 3.4) + vec2(uT * .018, -uT * .011) + f * 1.3) - 1.);
  float fog = uFogA * shape * (pow(rg, 6.) * smoothstep(.3, .7, w) * 1.05 + smoothstep(.45, .85, f) * smoothstep(.3, .7, w) * .35) + .015 * shape;
  vec4 m0 = texture2D(uMap, uv);
  float dk = clamp(m0.b, 0., 1.);
  fog = fog * (1. - dk * .92) + smoothstep(.12, .45, dk) * (1. - smoothstep(.5, .85, dk)) * smoothstep(.45, .8, w) * .07;
  vec3 col = vec3(fog); float al = fog;
  float vig = smoothstep(.42, 1.02, length((uv - uVc) * vec2(1.05, 1.18)));
  col *= 1. - vig * .85; al = vig * .85 + al * (1. - vig * .85);
  col += vec3(m0.g); al = max(al, clamp(m0.g, 0., 1.));
  col = liq * m + col * (1. - m); al = m + al * (1. - m);
  gl_FragColor = vec4(col, al);
}`;
  const G = { on: false, failed: false, cv: null, gl: null, u: {}, tx: null, tl: null, map: null, mg: null, half: null, hg: null, low: null, lg: null, mk: 1,
    tune: { K: 4.5, Km: 2.4, Kf: 0, Th: 0.22, Fog: 1, Red: 1, Gloss: 1 } };
  function glStart(base) {
    if (G.on) return true;
    if (G.failed) return false;
    try {
      const cv = document.createElement("canvas");
      cv.className = "vk-canvas vk-gl"; fill(cv); cv.setAttribute("aria-hidden", "true");
      const gl = cv.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: "low-power" });
      if (!gl) throw new Error("no webgl");
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      gl.useProgram(p);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(p, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const tex = (unit) => {
        const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
      };
      G.tx = tex(0); G.tl = tex(1); G.tm = tex(2);
      for (const n of ["uGl[0]", "uMap", "uMid", "uLow", "uTx", "uMx", "uLx", "uKm", "uAsp", "uFog", "uVc", "uT", "uK", "uKf", "uTh", "uFogA", "uRed", "uGloss", "uGl"]) G.u[n] = gl.getUniformLocation(p, n);
      G.u.uGl = G.u["uGl[0]"]; gl.uniform1i(G.u.uMap, 0); gl.uniform1i(G.u.uLow, 1); gl.uniform1i(G.u.uMid, 2);
      const c2 = () => { const c = document.createElement("canvas"); return [c, c.getContext("2d")]; };
      [G.map, G.mg] = c2(); [G.half, G.hg] = c2(); [G.low, G.lg] = c2();
      cv.addEventListener("webglcontextlost", (e) => { e.preventDefault(); glStop(); });
      base.after(cv);
      G.cv = cv; G.gl = gl; G.on = true;
      base.style.display = "none";
      L.layer.dataset.vkGl = "1";
      return true;
    } catch (e) {
      G.failed = true;
      return false;
    }
  }
  /** WebGL is gone (a lost context): back to the 2D pen for good. */
  function glStop() {
    if (!G.on) return;
    G.on = false; G.failed = true;
    G.cv?.remove(); G.cv = G.gl = null;
    F.cv?.remove(); F.cv = F.g = null;
    if (L.layer) delete L.layer.dataset.vkGl;
    if (L.base) { L.base.style.display = ""; L.cv = L.base; L.g = L.base.getContext("2d"); sizeLayer(); }
  }
  function glSize() {
    const mk = Math.min(1, Math.sqrt(MAP_BUDGET * NOTCH[V.q] / Math.max(1, L.W * L.H)));
    G.mk = mk;
    G.map.width = Math.max(4, Math.round(L.W * mk)); G.map.height = Math.max(4, Math.round(L.H * mk));
    G.half.width = Math.ceil(G.map.width / 2); G.half.height = Math.ceil(G.map.height / 2);
    G.low.width = Math.ceil(G.half.width / 2); G.low.height = Math.ceil(G.half.height / 2);
    G.gl.viewport(0, 0, G.cv.width, G.cv.height);
  }
  /** Where the few deep red glints are: points riding on the ropes (two on the collar), drifting along them. */
  const GL8 = new Float32Array(24);
  function glints(t, d) {
    GL8.fill(0);
    const ropes = P.ropes.filter((r) => r.w > 10), c = R.mic || R.ring;
    let k = 0;
    const put = (x, y, rad) => { if (k < 8 && x > 0 && x < L.W && y > 0 && y < L.H) { GL8[k * 3] = x / L.W; GL8[k * 3 + 1] = y / L.H; GL8[k * 3 + 2] = rad / L.H; k += 1; } };
    if (c) for (const a of [2.35, 0.25]) { const rr = (c.d || c.r) + 14 * L.U; put(c.x + Math.cos(a + 0.2 * Math.sin(t * 0.13)) * rr, c.y + d + Math.sin(a + 0.2 * Math.sin(t * 0.13)) * rr, 16 * L.U); }
    for (let i = 0; i < 9 && ropes.length && k < 7; i += 1) {
      const r = ropes[(i * 5 + 3) % ropes.length], sp = 0.2 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.05 + i * 2.1));
      const p = ropeAt(r, sp);
      put(p[0], p[1], (10 + 5 * hash(i)) * L.U * (0.6 + 0.4 * Math.sin(t * 0.3 + i)));
    }
    return GL8;
  }
  function glBegin() {
    const g = G.mg;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "source-over"; g.fillStyle = "#000"; g.fillRect(0, 0, G.map.width, G.map.height);
    g.setTransform(G.map.width / L.W, 0, 0, G.map.height / L.H, 0, 0); g.globalCompositeOperation = "lighter";
    PEN_H.g = g;
    return PEN_H;
  }
  function glEnd(t) {
    const g = G.mg, d = dy();
    // nothing alive over a word or a control: the liquid is wiped from the map under them (light and dark stay)
    // (in three soft steps, so a strand that strays near a word thins and necks there instead of being cut square)
    g.globalCompositeOperation = "multiply";
    for (const [p, v] of [[16, 150], [9, 60], [3, 0]]) {
      g.fillStyle = `rgb(${v},255,255)`; g.beginPath();
      for (const r of R.keep) { if (g.roundRect) g.roundRect(r.x - p, r.y + d - p, r.w + p * 2, r.h + p * 2, p + 4); else g.rect(r.x - p, r.y + d - p, r.w + p * 2, r.h + p * 2); }
      g.fill();
    }
    g.globalCompositeOperation = "source-over";
    // the blurred copy: two halvings (each one averages 2 x 2)
    G.hg.drawImage(G.map, 0, 0, G.half.width, G.half.height);
    G.lg.drawImage(G.half, 0, 0, G.low.width, G.low.height);
    const gl = G.gl, u = G.u, T = G.tune;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.tx); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, G.map);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, G.tl); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, G.low);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, G.tm); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, G.half);
    const asp = L.W / L.H;
    gl.uniform2f(u.uTx, 1 / G.map.width, 1 / G.map.height); gl.uniform2f(u.uLx, 1 / G.low.width, 1 / G.low.height); gl.uniform2f(u.uMx, 1 / G.half.width, 1 / G.half.height);
    gl.uniform2f(u.uAsp, asp, 1);
    const fc = R.mic ? [R.mic.x / L.W, clamp((R.mic.y + d) / L.H + 0.04, 0.3, 0.6)] : R.ring ? [R.ring.x / L.W, (R.ring.y + d) / L.H] : [SW() / 2 / L.W, 0.45];
    gl.uniform2f(u.uFog, fc[0], R.desk ? fc[1] - 0.12 : fc[1]);   // on the stage the smoke sits behind the head
    gl.uniform2f(u.uVc, R.desk ? SW() / 2 / L.W : 0.5, 0.47);
    gl.uniform1f(u.uT, t % 4000);
    gl.uniform1f(u.uK, T.K * Math.sqrt(G.mk / 0.75) / (L.U || 1)); gl.uniform1f(u.uKm, T.Km); gl.uniform1f(u.uKf, T.Kf); gl.uniform1f(u.uTh, T.Th);
    gl.uniform1f(u.uFogA, T.Fog * (V.view === "working" ? 0.8 : 1)); gl.uniform1f(u.uRed, GLINTS() ? T.Red : 0); gl.uniform1f(u.uGloss, T.Gloss);
    gl.uniform3fv(u.uGl, glints(t, d));
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // ============================================================================================ state
  const V = { on: false, view: "start", state: "idle", mode: opt.mode, q: 0, over: 0, guard: "idle", pre: null, stepAt: 0, simMs: 0, passMs: 0, cx: null, cy: null, cs: 1, dead: false, raf: 0, last: 0, t0: performance.now(), stats: { frames: 0, gaps: [], ms: [] },
    lvl: 0, lvlT: 0, ptr: null, tap: null, scanAt: 0, busy: false, backdrop: !opt.creature, dirty: true };
  const L = { base: null, cv: null, g: null, layer: null, fixed: true, lean: false, W: 0, H: 0, k: 1, ax: 0, ay: 0, S: 1, U: 1, cheap: false };
  const sy = () => (L.fixed ? window.scrollY : 0);
  const R = { text: [], keep: [], header: null, mic: null, pods: [], cards: [], ring: null, tl: null, sy: 0, phone: true, desk: false, panel: null };
  /** How wide the creature's room is: the whole window, or on a wide window the stage left of the panel. */
  const SW = () => (R.desk && R.panel ? R.panel.x : L.W);
  const MIC = { state: "idle", t0: 0, secs: 0, T: 0, open: 0 };
  const P = { ropes: [], threads: [], snaps: [], nextEvent: 2.2, events: 0, view: "", seeded: false };

  /** The desk composition: wide and landscape, a panel marked by the host, and not switched off by desk: false. */
  const panelEl = () => [...document.querySelectorAll(roleSel("panel"))].find(shown) || null;
  const deskOn = () => {
    if (opt.desk === false || !DESK_Q?.matches) return false;
    const p = panelEl(), r = p && p.getBoundingClientRect();
    return !!r && r.left + r.width / 2 > innerWidth / 2;   // the stage is left of the panel: a panel in the left half is not a desk
  };
  // the unit of thickness: 1 on a 390 x 844 phone, more on a big screen (the stage: thick and near, like the phone)
  const unitU = () => (R.desk ? clamp(L.H / 610, 1.2, 2.2) : clamp(Math.min(L.W / 390, L.H / 844), 0.85, 1.7));
  function sizeLayer() {
    if (!L.cv) return;
    const a = L.cv.getBoundingClientRect();
    L.W = L.cv.clientWidth || innerWidth; L.H = L.cv.clientHeight || innerHeight;
    // at most 1.5 device pixels per CSS pixel, and at most about 2 million pixels in all
    const px = Math.min(DPR_CAP, window.devicePixelRatio || 1, Math.sqrt(PX_BUDGET / Math.max(1, a.width * a.height))) * (L.cheap ? 0.67 : 1) * NOTCH[V.q] * Math.max(0.25, Math.min(1.5, opt.density));
    L.cv.width = Math.max(1, Math.round(a.width * px)); L.cv.height = Math.max(1, Math.round(a.height * px));
    L.k = L.cv.width / (L.W || 1);
    R.phone = L.W < 700;
    R.desk = deskOn();
    L.U = unitU();
    if (G.on) glSize();
    V.dirty = true;
  }

  // ============================================================================================ what is on the page
  // the host marks: data-vk-protect (words and controls: liquid is pushed round them, faded under them) and data-vk-role
  // = collar | pod | card | top | ring | panel
  const TEXT = "[data-vk-protect]";
  // the record button and the pods are gripped by the liquid; everything else on this list keeps it off
  const GRIPPED = '[data-vk-role="collar"], [data-vk-role="pod"]';
  const roleSel = (r) => `[data-vk-role="${r}"]`;
  const shown = (el) => el.getClientRects().length > 0;
  function scan() {
    if (!L.cv) return;
    const a = L.cv.getBoundingClientRect(), S = L.W / (a.width || 1);
    L.ax = a.left; L.ay = a.top; L.S = S;
    const m = (r) => ({ x: (r.left - a.left) * S, y: (r.top - a.top) * S, w: r.width * S, h: r.height * S });
    const take = (sel, cap = 80, skip = null) => {
      const out = [];
      for (const el of document.querySelectorAll(sel)) {
        if (out.length >= cap) break;
        if (skip && (el.matches(skip) || el.closest(roleSel("collar")))) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1 || r.bottom < a.top - 300 || r.top > a.bottom + 300) continue;
        out.push(m(r));
      }
      return out;
    };
    const dk = deskOn();   // the host may add or remove its panel at any time
    if (dk !== R.desk) { R.desk = dk; L.U = unitU(); P.seeded = false; }
    const pm = R.desk ? panelEl()?.getBoundingClientRect() : null;
    R.panel = pm && pm.width ? { x: (pm.left - a.left) * S, w: pm.width * S } : null;
    // on the stage only the words on the stage count (the panel is glass over the liquid)
    const onStage = (r) => !R.panel || r.x < R.panel.x - 4;
    R.text = take(TEXT, 160).filter(onStage);
    R.keep = take(TEXT, 160, GRIPPED).filter(onStage);
    const rects = (role) => [...document.querySelectorAll(roleSel(role))].filter(shown).map((el) => m(el.getBoundingClientRect())).filter((r) => r.w > 1);
    R.pods = R.panel ? [] : rects("pod");
    R.cards = R.panel ? [] : take(roleSel("card"), 8);
    const top = document.querySelector(roleSel("top"))?.getBoundingClientRect();
    R.header = top ? m(top) : null;
    const box = [...document.querySelectorAll(roleSel("collar"))].find(shown), disc = box?.querySelector("[data-vk-disc], .vk-rec-disc");
    const br = V.view !== "working" && box ? box.getBoundingClientRect() : null;
    R.mic = br && br.width ? { x: (br.left + br.width / 2 - a.left) * S, y: (br.top + br.height / 2 - a.top) * S, r: (br.width / 2) * S, d: ((disc?.getBoundingClientRect().width || br.width * 0.773) / 2) * S } : null;
    const ring = [...document.querySelectorAll(roleSel("ring"))].find(shown), rr = V.view === "working" && ring ? ring.getBoundingClientRect() : null;
    R.ring = rr && rr.width ? { x: (rr.left + rr.width / 2 - a.left) * S, y: (rr.top + rr.height / 2 - a.top) * S, r: (rr.width / 2) * S } : null;
    R.sy = sy(); V.scanAt = performance.now(); V.dirty = false;
  }
  /** Scroll since the last scan, in canvas units: everything scanned moves with the page. */
  const dy = () => (R.sy - sy()) * L.S;
  /** Free space straight below (x, y) before the next word or control (a drip never reaches one). */
  function room(x, y) {
    const d = dy();
    let best = Infinity;
    for (const r of R.keep) { const top = r.y + d; if (top > y && x > r.x - 10 && x < r.x + r.w + 10) best = Math.min(best, top - y); }
    return best;
  }

  // ============================================================================================ anchors
  function anchorPos(A, t) {
    const W = L.W, H = L.H, d = dy();
    switch (A.k) {
      case "L": return [-30, H * A.f];
      case "R": return R.desk && R.panel ? [R.panel.x - 6 + 10 * Math.sin(t * 0.4 + A.f * 9), H * A.f] : [W + 30, H * A.f];   // the panel's edge
      case "T": return [SW() * A.f, -30];
      case "B": return [W * A.f, H + 30];
      case "mic": if (R.mic) { const r = R.mic.d + 22 * L.U + (MIC.T > 0 ? -4 * MIC.T : 0); return [R.mic.x + Math.cos(A.a) * r, R.mic.y + d + Math.sin(A.a) * r]; } break;
      case "ring": if (R.ring) { const r = R.ring.r + 10; return [R.ring.x + Math.cos(A.a) * r, R.ring.y + d + Math.sin(A.a) * r]; } break;
      case "pod": { const p = R.pods[A.i]; if (p) return perim(p, A.f, 6, d, 0.46); break; }
      case "card": { const c = R.cards[A.i]; if (c) return perim(c, A.f, 5, d); break; }
      case "mass": return [SW() * A.f, massY(SW() * A.f, t) + 18];
      case "head": { const h = head(); return [h.x + Math.cos(A.a) * h.rx, h.y + Math.sin(A.a) * h.ry]; }
      default: break;
    }
    return A.fb ? anchorPos(A.fb, t) : [A.k === "pod" || A.k === "card" ? W * 0.5 : -30, H * 0.5];
  }
  function anchorOk(A) {
    if (A.k === "mic") return !!R.mic;
    if (A.k === "ring") return !!R.ring;
    if (A.k === "pod") return !!R.pods[A.i];
    if (A.k === "card") return !!R.cards[A.i];
    return true;
  }
  /** A point on the edge of a rounded box at fraction f (clockwise from the top left), pushed out by ``out``. */
  function perim(r, f, out, d = 0, round = 0.3) {
    const x = r.x - out, y = r.y + d - out, w = r.w + out * 2, h = r.h + out * 2, rr = Math.min(w, h) * round;
    const sw = w - 2 * rr, sh = h - 2 * rr, arc = Math.PI * rr / 2, tot = 2 * sw + 2 * sh + 4 * arc;
    let s = (((f % 1) + 1) % 1) * tot;
    const seg = [[sw, (u) => [x + rr + u, y]], [arc, (u) => { const a = -Math.PI / 2 + u / rr; return [x + w - rr + Math.cos(a) * rr, y + rr + Math.sin(a) * rr]; }],
      [sh, (u) => [x + w, y + rr + u]], [arc, (u) => { const a = u / rr; return [x + w - rr + Math.cos(a) * rr, y + h - rr + Math.sin(a) * rr]; }],
      [sw, (u) => [x + w - rr - u, y + h]], [arc, (u) => { const a = Math.PI / 2 + u / rr; return [x + rr + Math.cos(a) * rr, y + h - rr + Math.sin(a) * rr]; }],
      [sh, (u) => [x, y + h - rr - u]], [arc, (u) => { const a = Math.PI + u / rr; return [x + rr + Math.cos(a) * rr, y + rr + Math.sin(a) * rr]; }]];
    for (const [len, fn] of seg) { if (s <= len) return fn(s); s -= len; }
    return [x, y];
  }
  /** Anchors the web may grab on this view. */
  function anchorPool() {
    const pool = [];
    for (const f of [0.1, 0.22, 0.34, 0.46, 0.58, 0.7, 0.82]) { pool.push({ k: "L", f }); pool.push({ k: "R", f }); }
    for (const f of [0.15, 0.85]) pool.push({ k: "T", f });
    for (const f of [0.08, 0.3, 0.7, 0.92]) pool.push({ k: "mass", f });
    if (!V.backdrop) for (const a of R.desk ? [-2.6, -0.5, 2.9, 0.25, -2.0, -1.1, 3.4, -0.2] : [-2.6, -0.5, 2.9, 0.25]) pool.push({ k: "head", a });
    if (R.mic) for (let i = 0; i < 8; i += 1) pool.push({ k: "mic", a: (i / 8) * TAU + 0.2 });
    if (R.ring) for (let i = 0; i < 6; i += 1) pool.push({ k: "ring", a: (i / 6) * TAU + 0.4 });
    R.pods.forEach((_, i) => { for (const f of [0.02, 0.4, 0.6, 0.9]) pool.push({ k: "pod", i, f }); });
    R.cards.slice(0, 4).forEach((_, i) => { for (const f of [0.05, 0.3, 0.55, 0.8]) pool.push({ k: "card", i, f }); });
    return pool;
  }

  // ============================================================================================ the web (Verlet ropes)
  function makeRope(A, B, o = {}) {
    const n = o.n || (R.phone ? 22 : 26), t = now();
    const a = anchorPos(A, t), b = anchorPos(B, t);
    const pts = [];
    for (let i = 0; i < n; i += 1) { const s = i / (n - 1); const x = lerp(a[0], b[0], s) + Math.sin(s * Math.PI) * 30 * (hash(i + n) - 0.5), y = lerp(a[1], b[1], s) + Math.sin(s * Math.PI) * 40; pts.push({ x, y, px: x, py: y }); }
    return { pts, n, A, B, fa: null, fb: null, slack: o.slack || 1.3, slackT: o.slack || 1.3, puff: o.puff || 0, puffT: o.puff || 0,
      w: o.w || 14, seed: o.seed ?? rand() * 9, red: o.red || 0, twist: o.twist ?? true,
      speed: 10 + rand() * 16, born: t, life: 1 };
  }
  const now = () => (performance.now() - V.t0) / 1000;
  /** The web on the stage of a wide window: dense and near like the phone; it hangs the head from the ceiling and the
   *  left edge, ties it to the panel's edge, the corners and the mass, and grips the button in the maw. */
  function seedDesk() {
    const u = L.U, ropes = [];
    // (every other rope without its twisting secondary strand: the stage has many ropes, the cost stays the phone's)
    const add = (A, B, o) => ropes.push(makeRope(A, B, { n: 24, twist: ropes.length % 2 === 0, ...o, w: (o.w || 16) * u }));
    const hold = R.mic ? "mic" : R.ring ? "ring" : null;
    const H = (a) => ({ k: "head", a }), Lf = (f) => ({ k: "L", f }), Pe = (f) => ({ k: "R", f }), T = (f) => ({ k: "T", f }), M = (f) => ({ k: "mass", f });
    const Hd = (a, fb) => (hold ? { k: hold, a, fb } : fb);
    // the head hangs in its web: from the ceiling, the left edge and the panel's edge
    add(H(-2.05), T(0.2), { slack: 1.15, w: 22 });
    add(H(-1.05), T(0.8), { slack: 1.15, w: 21, red: 4 });
    add(H(-2.75), Lf(0.16), { slack: 1.2, w: 20 });
    add(H(-0.35), Pe(0.18), { slack: 1.2, w: 20 });
    add(H(2.95), Lf(0.5), { slack: 1.25, w: 24, red: 6 });
    add(H(0.2), Pe(0.46), { slack: 1.25, w: 23 });
    add(H(3.4), Lf(0.32), { slack: 1.4, w: 15 });
    add(H(-0.75), Pe(0.3), { slack: 1.4, w: 15 });
    // the grip: arms from the held button out to the edges, the mass and the panel
    add(Hd(Math.PI * 1.04, Lf(0.6)), Lf(0.66), { slack: 1.25, w: 22 });
    add(Hd(-0.06, Pe(0.6)), Pe(0.64), { slack: 1.25, w: 21, red: 5 });
    add(Hd(Math.PI * 0.78, M(0.3)), M(0.22), { slack: 1.3, w: 17 });
    add(Hd(Math.PI * 0.24, M(0.7)), M(0.8), { slack: 1.3, w: 17 });
    // big loops that frame the stage, down the left edge and down the panel's edge
    add(Lf(0.22), Lf(0.46), { slack: 2.8, puff: 1.5, w: 24 });
    add(Lf(0.58), Lf(0.84), { slack: 2.6, puff: 1.4, w: 22, red: 3 });
    add(Pe(0.26), Pe(0.5), { slack: 2.5, puff: 1.3, w: 20 });
    add(Pe(0.62), Pe(0.88), { slack: 2.5, puff: 1.3, w: 20, red: 7 });
    // the corners and the mass
    add(T(0.03), Lf(0.08), { slack: 1.6, puff: 0.8, w: 20 });
    add(T(0.97), Pe(0.06), { slack: 1.6, puff: 0.8, w: 19 });
    add(Lf(0.9), M(0.18), { slack: 1.6, puff: 0.6, w: 26, red: 4 });
    add(Pe(0.92), M(0.86), { slack: 1.6, puff: 0.6, w: 25 });
    add(M(0.04), M(0.46), { slack: 1.9, puff: 0.7, w: 18 });
    add(M(0.55), M(0.98), { slack: 1.9, puff: 0.7, w: 18 });
    // a long one across the whole stage behind the head (it slides round the face)
    add(Lf(0.4), Pe(0.36), { slack: 1.2, w: 13, twist: false });
    P.ropes = ropes;
    P.threads = []; P.snaps = [];
    for (let i = 0; i < 12; i += 1) spin(true);
    P.seeded = true;
  }
  function seedWeb() {
    if (R.desk && R.panel) { seedDesk(); return; }
    const ph = R.phone, u = L.U, ropes = [];
    // main ropes 12 to 22 px wide (at a 390 px phone), secondary 5 to 9
    const add = (A, B, o) => ropes.push(makeRope(A, B, { ...o, w: (o.w || 16) * u }));
    // big loops that frame the screen down both sides
    add({ k: "L", f: 0.24 }, { k: "L", f: 0.48 }, { slack: 2.9, puff: 1.5, w: 20 });
    add({ k: "R", f: 0.28 }, { k: "R", f: 0.52 }, { slack: 2.7, puff: 1.5, w: 18, red: 7 });
    add({ k: "L", f: 0.55 }, { k: "L", f: 0.76 }, { slack: 2.6, puff: 1.3, w: 17 });
    add({ k: "R", f: 0.58 }, { k: "R", f: 0.8 }, { slack: 2.6, puff: 1.3, w: 17, red: 3 });
    // from the presence down the sides
    if (!V.backdrop) {
      add({ k: "head", a: 2.95 }, { k: "L", f: 0.62 }, { slack: 1.2, w: 19 });
      add({ k: "head", a: 0.2 }, { k: "R", f: 0.6 }, { slack: 1.2, w: 18 });
    } else {
      add({ k: "T", f: 0.12 }, { k: "L", f: 0.18 }, { slack: 1.5, w: 16 });
      add({ k: "T", f: 0.88 }, { k: "R", f: 0.2 }, { slack: 1.5, w: 15 });
    }
    // the arms of the collar, or of whatever card is there
    const midL = R.mic ? { k: "mic", a: Math.PI * 1.02 } : R.ring ? { k: "ring", a: Math.PI } : R.cards[0] ? { k: "card", i: 0, f: 0.88 } : { k: "L", f: 0.42 };
    const midR = R.mic ? { k: "mic", a: -0.1 } : R.ring ? { k: "ring", a: 0 } : R.cards[0] ? { k: "card", i: 0, f: 0.32 } : { k: "R", f: 0.4 };
    add({ k: "T", f: 0.04 }, { k: "L", f: 0.4 }, { slack: 1.5, puff: 0.9, w: 17 });
    add({ k: "T", f: 0.96 }, { k: "R", f: 0.44 }, { slack: 1.5, puff: 0.9, w: 16 });
    add(midL, { k: "L", f: 0.5 }, { slack: 1.3, w: 20, red: 5 });
    add(midR, { k: "R", f: 0.34 }, { slack: 1.3, w: 19 });
    add(R.mic ? { k: "mic", a: -Math.PI * 0.62 } : midL, { k: "L", f: 0.16 }, { slack: 1.25, w: 13 });
    add(R.mic ? { k: "mic", a: Math.PI * 0.85 } : midL, R.pods[0] ? { k: "pod", i: 0, f: 0.06 } : { k: "L", f: 0.66 }, { slack: 1.3, w: 12 });
    add(R.mic ? { k: "mic", a: Math.PI * 0.12 } : midR, R.pods[2] ? { k: "pod", i: 2, f: 0.44 } : { k: "R", f: 0.66 }, { slack: 1.3, w: 12 });
    // the tiles hang on to the edges and to the mass
    add(R.pods[0] ? { k: "pod", i: 0, f: 0.86 } : { k: "L", f: 0.76 }, { k: "L", f: 0.68 }, { slack: 1.3, w: 16 });
    add(R.pods[2] ? { k: "pod", i: 2, f: 0.38 } : { k: "R", f: 0.78 }, { k: "R", f: 0.7 }, { slack: 1.3, w: 16, red: 6 });
    add(R.pods[0] ? { k: "pod", i: 0, f: 0.6 } : { k: "mass", f: 0.2 }, { k: "mass", f: 0.12 }, { slack: 1.4, w: 13 });
    add(R.pods[2] ? { k: "pod", i: 2, f: 0.62 } : { k: "mass", f: 0.8 }, { k: "mass", f: 0.88 }, { slack: 1.4, w: 13 });
    add({ k: "mass", f: 0.04 }, { k: "mass", f: 0.42 }, { slack: 1.9, puff: 0.7, w: 15 });
    if (ph) add(R.mic ? { k: "mic", a: -0.8 } : { k: "R", f: 0.36 }, { k: "R", f: 0.14 }, { slack: 1.3, w: 13 });
    if (!ph) {
      add({ k: "L", f: 0.86 }, { k: "mass", f: 0.25 }, { slack: 1.6, puff: 0.6, w: 20, red: 4 });
      add({ k: "R", f: 0.82 }, { k: "mass", f: 0.72 }, { slack: 1.6, puff: 0.6, w: 20 });
      add({ k: "T", f: 0.3 }, { k: "L", f: 0.3 }, { slack: 1.5, w: 14 });
      add({ k: "T", f: 0.7 }, { k: "R", f: 0.32 }, { slack: 1.5, w: 14 });
    }
    P.ropes = ropes;
    P.threads = []; P.snaps = [];
    for (let i = 0; i < (ph ? 12 : 16); i += 1) spin(true);
    P.seeded = true;
  }
  /** On a new view: ropes whose anchor is gone let go, whip across and grab something on the new page. */
  function regrabMissing() {
    const pool = anchorPool();
    let k = 0;
    for (const r of P.ropes) {
      for (const end of ["A", "B"]) {
        if (!anchorOk(r[end])) { grab(r, end, pick(pool), 0.12 + k * 0.08); k += 1; }
      }
    }
  }
  function grab(r, end, to, delay = 0) {
    const t = now(), pt = end === "A" ? r.pts[0] : r.pts[r.n - 1], nb = end === "A" ? r.pts[2] : r.pts[r.n - 3];
    r[end === "A" ? "fa" : "fb"] = { from: [pt.x, pt.y], to, t0: t + delay, dur: 0.85 + rand() * 0.35, arc: (rand() < 0.5 ? -1 : 1) * (80 + rand() * 120) };
    r[end] = to;
    // where it let go: a stub stretches after it, thins, snaps into beads
    const dx = nb.x - pt.x, dd = nb.y - pt.y, l = Math.hypot(dx, dd) || 1;
    if (pt.x > -10 && pt.x < L.W + 10 && pt.y > -10 && pt.y < L.H + 10) P.snaps.push({ x: pt.x, y: pt.y, ux: dx / l, uy: dd / l, w: r.w * 0.6, t0: t + delay });
  }
  function endPos(r, end, t) {
    const F = end === "A" ? r.fa : r.fb, A = end === "A" ? r.A : r.B;
    if (!F) return anchorPos(A, t);
    const u = (t - F.t0) / F.dur;
    if (u < 0) return F.from;
    if (u >= 1) { if (end === "A") r.fa = null; else r.fb = null; return anchorPos(A, t); }
    const to = anchorPos(F.to, t), e = back(u), dx = to[0] - F.from[0], dy0 = to[1] - F.from[1], d = Math.hypot(dx, dy0) || 1;
    const arc = Math.sin(Math.PI * clamp(u * 1.15, 0, 1)) * F.arc;
    return [lerp(F.from[0], to[0], e) - (dy0 / d) * arc, lerp(F.from[1], to[1], e) + (dx / d) * arc];
  }
  /** A new membrane or thread between two ropes that are close (``ready``: already grown, for the first frame). */
  function spin(ready = false) {
    if (P.ropes.length < 2) return;
    let best = null, bd = Infinity;
    for (let k = 0; k < 16; k += 1) {
      const i = Math.floor(rand() * P.ropes.length), j = (i + 1 + Math.floor(rand() * (P.ropes.length - 1))) % P.ropes.length;
      const sa = 0.15 + rand() * 0.7, sb = 0.15 + rand() * 0.7, a = ropeAt(P.ropes[i], sa), b = ropeAt(P.ropes[j], sb);
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d < 16 || d >= bd || inFace((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) continue;
      if (a[0] < -20 || a[0] > L.W + 20 || b[0] < -20 || b[0] > L.W + 20) continue;
      best = { i, j, sa, sb }; bd = d;
    }
    if (!best || bd > 150 * L.U) return;
    const t = now();
    P.threads.push({ a: P.ropes[best.i], b: P.ropes[best.j], sa: best.sa, sb: best.sb, born: ready ? t - 5 : t, life: 7 + rand() * 10, snap: 0,
      web: bd < 95 * L.U && rand() < 0.75, span: 0.04 + rand() * 0.05, sag: 0.1 + rand() * 0.2, seed: rand() * 9 });
  }
  /** Every few seconds the web changes its mind. */
  function rearrange(t) {
    if (t < P.nextEvent || !P.ropes.length) return;
    P.events += 1;
    const kind = P.events % 3;
    if (kind === 1) {
      // a rope lets go of one end and grabs something else
      const r = pick(P.ropes.filter((x) => !x.fa && !x.fb)) || P.ropes[0];
      const end = rand() < 0.5 ? "A" : "B", pool = anchorPool().filter((A) => A !== r.A && A !== r.B);
      const here = anchorPos(end === "A" ? r.B : r.A, t);
      const near = pool.filter((A) => { const p = anchorPos(A, t); return Math.hypot(p[0] - here[0], p[1] - here[1]) < Math.max(L.W, L.H) * 0.75; });
      grab(r, end, pick(near.length ? near : pool));
    } else if (kind === 2) {
      // a new membrane grows between two ropes, and an old one thins and snaps
      spin();
      const old = P.threads.filter((h) => !h.snap && t - h.born > 3);
      if (old.length) pick(old).snap = t;
    } else {
      // a loop changes shape
      const r = pick(P.ropes);
      r.slackT = r.puff ? 1.6 + rand() * 1.3 : 1.12 + rand() * 0.45;
      r.puffT = r.puff ? 0.4 + rand() * 0.9 : rand() < 0.3 ? 0.5 : 0;
    }
    P.nextEvent = t + 1.1 + rand() * 1.0;
  }
  function stepRope(r, t, dt, f) {
    const pts = r.pts, n = r.n;
    r.slack = lerp(r.slack, r.slackT, Math.min(1, dt * 0.8));
    r.puff = lerp(r.puff, r.puffT, Math.min(1, dt * 0.8));
    const a = endPos(r, "A", t), b = endPos(r, "B", t);
    const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const recPulse = MIC.state === "recording" && (r.A.k === "mic" || r.B.k === "mic") ? 1 + 0.25 * V.lvl : 1;
    const rest = Math.max(4, span * r.slack / (n - 1)) * (V.view === "failed" ? 1.18 : 1);
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const grav = (V.view === "failed" ? 0.5 : 0.07) * f;
    const curl = 0.11 * f;
    pts[0].x = a[0]; pts[0].y = a[1]; pts[n - 1].x = b[0]; pts[n - 1].y = b[1];
    for (let i = 1; i < n - 1; i += 1) {
      const p = pts[i];
      let vx = (p.x - p.px) * 0.94, vy = (p.y - p.py) * 0.94;
      p.px = p.x; p.py = p.y;
      vx += (curl * Math.sin(p.y * 0.011 + t * 0.55 + r.seed) + curl * 0.6 * Math.sin(t * 1.3 + i * 0.7 + r.seed)) * (r.puff ? 0.4 : 1);
      vy += curl * Math.cos(p.x * 0.012 - t * 0.47 + r.seed * 1.3) + grav;
      if (r.puff) {   // a loop: it swells round, and bulges in toward the middle of the screen
        const dx = p.x - mx, dy0 = p.y - my, d = Math.hypot(dx, dy0) || 1, cx = SW() / 2 - mx, cy = L.H * 0.5 - my, dc = Math.hypot(cx, cy) || 1;
        vx += ((dx / d) * 0.03 + (cx / dc) * 0.14) * r.puff * f; vy += ((dy0 / d) * 0.03 + (cy / dc) * 0.05) * r.puff * f;
      }
      if (R.desk && V.ptr) {                   // on the desk the mouse is always there: the ropes near it shrink away
        const dx = p.x - V.ptr.x, dy0 = p.y - V.ptr.y, d = Math.hypot(dx, dy0), rr = 190 * L.U / 1.6;
        if (d < rr && d > 1) { const k = 0.32 * Math.pow(1 - d / rr, 1.5) * f; vx += (dx / d) * k; vy += (dy0 / d) * k; }
      } else if (V.ptr && t - V.ptr.t < 4) {   // it leans toward the pointer
        const dx = V.ptr.x - p.x, dy0 = V.ptr.y - p.y, d = Math.hypot(dx, dy0);
        if (d < 170 && d > 1) { const k = 0.06 * (1 - d / 170) * f; vx += (dx / d) * k * 3; vy += (dy0 / d) * k * 3; }
      }
      p.x += vx * recPulse; p.y += vy;
    }
    if (V.tap && t - V.tap.t < 0.05 && !V.tap.done?.has(r)) {   // and recoils from a tap
      (V.tap.done ||= new Set()).add(r);
      for (let i = 1; i < n - 1; i += 1) {
        const p = pts[i], dx = p.x - V.tap.x, dy0 = p.y - V.tap.y, d = Math.hypot(dx, dy0) || 1;
        if (d < 220) { const k = 26 * (1 - d / 220); p.px -= (dx / d) * k; p.py -= (dy0 / d) * k; }
      }
    }
    for (let it = 0; it < 4; it += 1) {
      for (let i = 0; i < n - 1; i += 1) {
        const p = pts[i], q = pts[i + 1], dx = q.x - p.x, dy0 = q.y - p.y, d = Math.hypot(dx, dy0) || 0.001;
        const diff = (d - rest) / d * 0.5, ox = dx * diff, oy = dy0 * diff;
        if (i > 0) { p.x += ox; p.y += oy; } else { q.x -= ox; q.y -= oy; }
        if (i + 1 < n - 1) { q.x -= ox; q.y -= oy; } else if (i > 0) { p.x += ox; p.y += oy; }
      }
      pts[0].x = a[0]; pts[0].y = a[1]; pts[n - 1].x = b[0]; pts[n - 1].y = b[1];
    }
    // keep out of the text and the face: a rope slides round words, controls and eyes instead of crossing them
    const d = dy(), fc = face(), keep = fc ? [...R.keep, { x: fc.x, y: fc.y - d, w: fc.w, h: fc.h }] : R.keep, mg = 8 + r.w * 0.55;
    for (let i = 1; i < n - 1; i += 1) {
      const p = pts[i];
      for (const tr of keep) {
        // each word or control is a rounded capsule the rope slides round (never a straight edge it lines up on)
        const rad = tr.h / 2 + mg, cy = tr.y + d + tr.h / 2;
        if (p.y < cy - rad || p.y > cy + rad || p.x < tr.x - mg || p.x > tr.x + tr.w + mg) continue;
        const half = Math.min(tr.w, tr.h) / 2, sx = clamp(p.x, tr.x + half, tr.x + tr.w - half);
        const ex = p.x - sx, ey = p.y - cy, e = Math.hypot(ex, ey);
        if (e >= rad) continue;
        const ux = e > 1e-3 ? ex / e : 0, uy = e > 1e-3 ? ey / e : (p.y < cy ? -1 : 1), push = (rad - e) * 0.6;
        p.x += ux * push; p.y += uy * push;
      }
    }
  }
  function ropeAt(r, s) {
    const f = clamp(s, 0, 1) * (r.n - 1), i = Math.min(r.n - 2, Math.floor(f)), u = f - i, p = r.pts[i], q = r.pts[i + 1];
    return [lerp(p.x, q.x, u), lerp(p.y, q.y, u)];
  }
  function drawRope(pen, r, t) {
    const P0 = r.pts.map((p) => [p.x, p.y]);
    const Q = smoothPts(P0, 2), n = Q.length;
    const pulse = MIC.state === "recording" && (r.A.k === "mic" || r.B.k === "mic") ? 1 + 0.55 * V.lvl : 1;
    // where a rope holds on to something on the screen it narrows to a root; an end in flight is stretched thin
    const root = (A) => A.k === "head" || A.k === "pod" || A.k === "card";
    const fly = (F) => F && t >= F.t0 ? 0.25 + 0.75 * smooth((t - F.t0) / F.dur) : 1;
    const ra = root(r.A) ? 0.3 : 1, rb = root(r.B) ? 0.3 : 1, fa = fly(r.fa), fb = fly(r.fb);
    const W = Q.map((_, i) => {
      const s = i / (n - 1);
      const endA = lerp(Math.min(ra, fa), 1, smooth(s / 0.2)), endB = lerp(Math.min(rb, fb), 1, smooth((1 - s) / 0.2));
      return endA * endB * r.w * pulse * (0.6 + 0.4 * Math.pow(Math.sin(Math.PI * clamp(s * 0.9 + 0.05, 0, 1)), 0.5)) * (0.84 + 0.24 * Math.sin(s * 7 + t * 0.9 + r.seed) + 0.1 * Math.sin(s * 19 - t * 1.7 + r.seed));
    });
    pen.rope(Q, W, { t, seed: r.seed, speed: r.speed, red: r.red, wave: 110 + r.seed * 12 });
    // a secondary strand (5 to 9 px) twists round the rope, leaving it and joining it again
    if (r.twist && r.w > 10 && !L.lean) {
      const N = normals(Q, false), C = [], CW = [];
      for (let i = 2; i < n - 2; i += 1) {
        const s = i / (n - 1), o = Math.sin(s * TAU * 1.3 + t * 0.6 + r.seed) * (W[i] * 0.5 + 5 * L.U);
        C.push([Q[i][0] + N[i][0] * o, Q[i][1] + N[i][1] * o]); CW.push(Math.max(1, r.w * 0.36 * Math.sin(Math.PI * s)));
      }
      pen.rope(C, CW, { t, seed: r.seed + 2, speed: r.speed * 1.4, thin: true, wave: 90 });
    }
  }
  /** The face (eyes and the dark under them) stays clear: no thread may hang across it like a mouth. */
  function face() { if (V.backdrop || !F.S) return null; const S = F.S, u = S.u; return { x: S.x - 124 * u, y: S.y - 72 * u, w: 248 * u, h: 252 * u }; }
  function inFace(x, y) { const f = face(); return !!f && x > f.x && x < f.x + f.w && y > f.y && y < f.y + f.h; }
  /** Membranes and threads between ropes: they grow, live a while, thin, snap into beads. */
  function drawThreads(pen, t) {
    P.threads = P.threads.filter((h) => P.ropes.includes(h.a) && P.ropes.includes(h.b) && !(h.snap && t - h.snap > 1.2));
    for (const h of P.threads) {
      if (!h.snap && t - h.born > h.life) h.snap = t;
      const a = ropeAt(h.a, h.sa), b = ropeAt(h.b, h.sb), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len > 190 * L.U && !h.snap) h.snap = t;
      const cx = (a[0] + b[0]) / 2 + Math.sin(t * 0.7 + h.seed) * 6, cy = (a[1] + b[1]) / 2 + len * h.sag;
      if (inFace(cx, cy)) { if (!h.snap) h.snap = t - 0.3; continue; }
      const grow = smooth((t - h.born) / 1.6);
      const sn = h.snap ? clamp((t - h.snap) / 1.2, 0, 1) : 0;
      // the membrane: a sheet of liquid in the crook between the two ropes, its free edges sagging in
      const web = h.web ? grow * (1 - smooth(sn / 0.45)) : 0;
      if (web > 0.02) {
        const sp = h.span * web, Q = [];
        for (let k = 0; k <= 3; k += 1) Q.push(ropeAt(h.a, h.sa - sp + (2 * sp * k) / 3));
        const a2 = ropeAt(h.a, h.sa + sp), b2 = ropeAt(h.b, h.sb + sp), a1 = ropeAt(h.a, h.sa - sp), b1 = ropeAt(h.b, h.sb - sp);
        const sag = 0.28 + 0.2 * (1 - web);
        Q.push([lerp((a2[0] + b2[0]) / 2, cx, sag), lerp((a2[1] + b2[1]) / 2, cy, sag)]);
        for (let k = 0; k <= 3; k += 1) Q.push(ropeAt(h.b, h.sb + sp - (2 * sp * k) / 3));
        Q.push([lerp((a1[0] + b1[0]) / 2, cx, sag), lerp((a1[1] + b1[1]) / 2, cy, sag)]);
        pen.web(Q, 0.6 + 0.4 * web);
      }
      // the thread at its middle: a strand that thins, then breaks; both halves spring back with a bead on the end
      const w = (h.web ? 4.5 : 2) * L.U;
      if (sn < 0.45) {
        const thin = 1 - smooth(sn / 0.45) * 0.6;
        if (grow < 1) { const e = grow; pen.line(a[0], a[1], lerp(a[0], cx, e), lerp(a[1], cy, e), qpt(a[0], cx, b[0], e), qpt(a[1], cy, b[1], e), w * 0.6); continue; }
        if (h.web) strand(pen, a[0], a[1], cx, cy, b[0], b[1], w * thin, w * thin, 0.5, { t, thin: true, n: 8 });
        else pen.line(a[0], a[1], cx, cy, b[0], b[1], w * thin);
        if (h.seed > 5) pen.bead(qpt(a[0], cx, b[0], 0.5), qpt(a[1], cy, b[1], 0.5) + 2, 2.6 * L.U);
        continue;
      }
      const v = ease((sn - 0.45) / 0.55), keep = 0.5 * (1 - v);
      for (const [p, q] of [[a, b], [b, a]]) {
        const ex = qpt(p[0], cx, q[0], keep), ey = qpt(p[1], cy, q[1], keep) + 12 * v;
        pen.line(p[0], p[1], lerp(p[0], cx, keep), lerp(p[1], cy, keep) + 6 * v, ex, ey, w * 0.5 * (1 - v));
        pen.bead(ex, ey, (3.2 * (1 - v) + 1) * L.U, 1 - v * 0.6);
      }
    }
    for (let k = P.threads.filter((h) => !h.snap).length; k < (R.phone ? 12 : R.desk ? 12 : 16) && P.ropes.length > 1; k += 1) spin();
  }
  /** Where a rope let go: the stub stretches after it, thins, snaps, and the bead falls. */
  function drawSnaps(pen, t) {
    P.snaps = P.snaps.filter((s) => t - s.t0 < 1.3);
    for (const s of P.snaps) {
      const u = (t - s.t0) / 1.3;
      if (u < 0) continue;
      if (u < 0.4) {
        const v = u / 0.4, len = (14 + 46 * ease(v)) * L.U, w = s.w * (1 - 0.75 * v);
        strand(pen, s.x, s.y, s.x + s.ux * len * 0.5, s.y + s.uy * len * 0.5 + 6 * v, s.x + s.ux * len, s.y + s.uy * len + 10 * v, w, w * 0.35, 0.6 * v, { t, thin: true, n: 7 });
        pen.bead(s.x + s.ux * len, s.y + s.uy * len + 10 * v, (2 + 3 * v) * L.U);
      } else {
        const v = (u - 0.4) / 0.6, len = 60 * L.U * (1 - ease(v));
        if (len > 3) strand(pen, s.x, s.y, s.x + s.ux * len * 0.5, s.y + s.uy * len * 0.5, s.x + s.ux * len, s.y + s.uy * len, s.w * 0.4, 1.5, 0.3, { t, thin: true, n: 6 });
        const fx = s.x + s.ux * 60 * L.U, fy = s.y + s.uy * 60 * L.U + 10 + 520 * v * v;
        if (fy < L.H + 20 && room(fx, fy - 10) > 12) pen.bead(fx, fy, 4.4 * L.U * (1 - v * 0.5), 1 - v * 0.5);
      }
    }
  }

  // ============================================================================================ drips
  /** A drip hangs at (x, y): swells and stretches for ``per`` seconds, necks, lets go, falls, grows again. It never
   *  reaches a word or a control below it. */
  function drip(pen, x, y, L0, per, ph, t, o = {}) {
    L0 = Math.min(L0, room(x, y) - 12);
    if (L0 < 6) return;
    const u = (((t + ph) / per) % 1 + 1) % 1, wide = (o.w || 9) * L.U, rr = (o.r || 1) * L.U;
    if (u < 0.78) {
      const s = ease(u / 0.78), len = L0 * (0.3 + 0.7 * s), r = (2.6 + 3.2 * s) * rr;
      strand(pen, x, y - 3, x + Math.sin(t * 0.8 + ph) * 1.5, y + len * 0.5, x, y + len, wide, r * 1.3, 0.3 + 0.4 * s, { t, thin: true, n: 7 });
      pen.bead(x, y + len + r * 0.4, r);
    } else {
      const v = (u - 0.78) / 0.22, len = L0 * (0.3 + 0.7 * (1 - ease(v * 2)));
      strand(pen, x, y - 3, x, y + len * 0.5, x, y + Math.max(4, len * 0.6), wide, 2, 0.55, { t, thin: true, n: 6 });
      const fy = y + L0 + 4 + 900 * v * v * 0.5 * (o.fall || 1);
      if (fy < L.H + 20 && room(x, y) > fy - y + 8) pen.bead(x, fy, 4.6 * rr * (1 - v * 0.4), 1 - v);
    }
  }

  // ============================================================================================ the mass at the bottom
  function massY(x, t) {
    const W = SW(), H = L.H, base = H - (R.phone ? 70 : 100) * (R.phone ? 1 : L.U * 0.8);
    let y = base - 9 * Math.sin(t * 0.37) - 9 * Math.sin(x / 120 + t * 0.5) - 5 * Math.sin(x / 47 - t * 0.8) - 2.5 * Math.sin(x / 19 + t * 1.5);
    y -= (44 + 14 * Math.sin(t * 0.31)) * Math.exp(-(((x - W * 0.1) / (W * 0.16)) ** 2));
    y -= (50 + 12 * Math.sin(t * 0.27 + 2)) * Math.exp(-(((x - W * 0.88) / (W * 0.16)) ** 2));
    if (V.view === "failed") y += 10;
    return y;
  }
  function drawMass(pen, t) {
    const W = R.desk ? SW() + 60 : L.W, H = L.H, pts = [];
    for (let x = -14; x <= W + 14; x += R.phone ? 12 : 18) pts.push([x, massY(x, t)]);
    pen.mass(pts, H);
    // its skin: thick ropes lying on top of each other along the edge, each with its own wet light
    const u = L.U;
    for (let j = 0; j < 6; j += 1) {
      const Q = [], Wd = [];
      for (let x = -40; x <= W + 40; x += R.phone ? 14 : 22) {
        Q.push([x, massY(x, t) + 4 + j * 15 * u + 13 * Math.sin(x / (58 + j * 21) + t * (0.5 + j * 0.13) + j * 2.4)]);
        Wd.push((30 + 14 * Math.sin(x / 80 - t * 0.4 + j * 1.9) + 7 * Math.sin(x / 31 + t * 0.7 + j)) * u * (1 - j * 0.07));
      }
      pen.rope(Q, Wd, { t, seed: j * 4.1, speed: 12 + j * 4, red: j === 0 ? 8 : j === 2 ? 5 : 0, a: pen.gl ? 0.75 : 1 - j * 0.12, wave: 180 });
    }
    // tendrils rise out of it at the sides, feel the air and sink back
    for (const [fx, seed] of [[0.05, 1], [0.95, 2.6], [0.3, 4.2]]) {
      const x = W * fx, y0 = massY(x, t) + 12, rise = (R.phone ? 110 : 190) * (fx === 0.3 ? 0.4 : 1) * (0.5 + 0.5 * (0.5 + 0.5 * Math.sin(t * 0.29 + seed * 2)));
      strand(pen, x, y0, x + Math.sin(t * 0.45 + seed) * 40, y0 - rise * 0.55, x + Math.sin(t * 0.6 + seed) * 30 + (fx < 0.5 ? 18 : -18), y0 - rise, 28 * u, 5 * u, 0.12, { t, speed: 14 });
    }
  }

  // ============================================================================================ the creature
  // Our own creature, nobody else's: SIX narrow eyes in three pairs (largest on top, smaller and closer together going
  // down, like something from the deep sea), each with a hard core, a glow and a slit pupil that tracks; a VERTICAL
  // maw, a seam down the lower face that splits sideways like mandibles, hooked bone-white teeth along both edges and
  // strands of liquid between the halves; a CROWN of horn-like spires that run off into the web. The head is made of
  // the same liquid as the ropes (drawn into the height map); the eyes, the inside of the maw and the teeth are drawn
  // sharp on a small canvas above it (the 2D fallback draws them on its own canvas).
  // Face units: about 240 across, the top eyes on y 0, the mandible tips at y 172.
  const EYES = [   // x, y, length, height, tilt (the outer end up)
    [-49, 0, 56, 8.5, 0.28], [49, 0, 56, 8.5, -0.28],
    [-33, 30, 36, 6, 0.2], [33, 30, 36, 6, -0.2],
    [-21, 53, 22, 4.5, 0.12], [21, 53, 22, 4.5, -0.12]];
  const EXTRA = [[-98, 24, 24, 7, 0.55], [98, 24, 24, 7, -0.55], [0, -38, 22, 6.5, Math.PI / 2], [-74, -32, 17, 5, 0.3],
    [76, -28, 17, 5, -0.3], [-66, 92, 15, 4.5, 0.95], [66, 92, 15, 4.5, -0.95]];
  const MAW_PHONE = { y0: 66, y1: 154, hw: 44 };
  // on the stage the maw is longer and opens wider: it holds the record button (its middle, y 120, is the button)
  const MAW_DESK = { y0: 64, y1: 176, hw: 62 };
  let MAW = MAW_PHONE;
  const MAW_MID = () => (MAW.y0 + MAW.y1) / 2;
  // On the stage the eyes are not slits: six lidless wet ORBS sunk in sockets, uneven (x, y, radius), pinprick pupils
  // that dilate with the voice, a membrane that slides sideways over them to blink. Still six, three pairs.
  const ORBS = [[-52, 0, 20], [50, 3, 17], [-33, 32, 12.5], [35, 30, 11], [-19, 53, 8], [19, 54, 6.5]];
  const ORB_EXTRA = [[-100, 30, 7], [99, 26, 6], [0, -36, 6.5], [-76, -30, 5], [77, -26, 5.5], [-70, 96, 4.5], [70, 94, 4]];
  const orbsOn = () => (R.desk && !!R.panel) || !!G.tune.Orbs;
  const SKULL = [[0, -70], [30, -68], [64, -58], [94, -38], [113, -10], [118, 20], [109, 50], [94, 80], [78, 108], [62, 134],
    [46, 158], [32, 176], [19, 172], [9, 160]];
  const SPIRES = [   // base, bend, tip (face units, the right side; mirrored), width at the base
    [22, -66, 30, -118, 58, -168, 26], [60, -56, 102, -86, 152, -108, 24],
    [92, -38, 148, -52, 200, -40, 20], [112, -4, 158, 8, 182, 60, 16], [104, 42, 140, 70, 146, 122, 11]];
  const F = { cv: null, g: null, S: null, maw: 0, twitchAt: 3, twitch: -9, intro: -99, delay: 0.15, leave: -1, flinch: -9,
    extra: null, extraAt: 8, sink: 0, pres: 1,
    eyes: EYES.map((_, i) => ({ open: 0, k: 0, blinkAt: 1.5 + i * 0.9 + hash(i + 4) * 3, blink: -9, a: 1, lx: 0, ly: 0.5 })) };
  /** Where the face goes: under the header, the maw ending above the collar (it looks DOWN at the button). */
  function faceFit() {
    const W = L.W, H = L.H, d = dy();
    if (R.desk && R.panel) {
      // colossal: crown to jaw about two thirds of the window, centred on the stage, the maw round the held button
      const hold = R.mic || R.ring, cy = hold ? hold.y + d : H * 0.56, mid = MAW_MID();
      // (the tips of the crown may run off the top of the window: it is too big for the room)
      const u = Math.max(0.8, Math.min(H * 0.76 / 352, SW() / 430, (cy + 14) / (118 + mid)));
      const fit = { x: hold ? hold.x : SW() / 2, y: cy - mid * u, u };
      if (V.cx != null) fit.x = V.cx;   // v.creature({ x, y, scale })
      if (V.cy != null) fit.y = V.cy;
      fit.u *= V.cs;
      return fit;
    }
    // on a phone it stays under the header; on a wide screen the middle of the header is empty, so the face may rise
    // behind it up to the lowest word that sits over the middle third
    let top = R.header ? R.header.y + R.header.h + d : 56;
    if (!R.phone) {
      top = 34;
      for (const r of R.keep) if (r.x < W * 0.64 && r.x + r.w > W * 0.36 && r.y + d < H * 0.3) top = Math.max(top, r.y + r.h + d);
    }
    const low = R.mic ? R.mic.y + d - R.mic.d - 44 * L.U : R.ring ? R.ring.y + d - R.ring.r - 40 * L.U : H * 0.4;
    // never smaller than this: on views where a card sits high (the working ring) the face goes on behind it
    const u = clamp((low - top - 18) / 168, R.phone ? 0.95 : 1.3, Math.min(W / 290, 2.2));
    const fit = { x: W / 2, y: top + 18 + 14 * u + Math.max(0, low - MAW.y1 * u - top - 18 - 14 * u) * 0.3, u };
    if (V.cx != null) fit.x = V.cx;   // v.creature({ x, y, scale })
    if (V.cy != null) fit.y = V.cy;
    fit.u *= V.cs;
    return fit;
  }
  /** Half the width of the open maw at depth s (0: the top of the seam, 1: its bottom), when fully open. */
  const mawHW = (s) => MAW.hw * Math.pow(Math.sin(Math.PI * clamp(s * 0.88 + 0.06, 0, 1)), 0.75);
  const rate = (dt, r) => 1 - Math.exp(-dt * r);
  /** Once a frame: where the face is, how open each eye and the maw are, where they look. */
  function faceStep(t, dt) {
    const desk = R.desk && !!R.panel;
    MAW = desk ? MAW_DESK : MAW_PHONE;
    const fit = faceFit(), st = !!V.still, d = dy();
    const view = V.view, rec = MIC.state === "recording", working = view === "working", failed = view === "failed", result = view === "result";
    const EY = orbsOn() ? ORBS : EYES, words = desk ? R.keep : R.text;
    const hold = desk ? (R.mic ? { x: R.mic.x, y: R.mic.y + d, r: R.mic.d } : R.ring ? { x: R.ring.x, y: R.ring.y + d, r: R.ring.r } : null) : null;
    const hover = !!(hold && R.mic && V.ptr && Math.hypot(V.ptr.x - hold.x, V.ptr.y - hold.y) < hold.r * 1.15);
    F.hover = hover;
    // it rises out of the smoke when the theme starts (the face comes last) and peels away when it leaves
    const ti = t - F.intro;
    let pres = st ? 1 : ti < 0 ? 0 : smooth(ti / 1.1);
    const lv = F.leave > 0 ? smooth((t - F.leave) / 0.5) : 0;
    pres *= 1 - lv;
    F.pres = pres;
    // (on the stage it does not sink on Result: the words are in the panel, it watches them)
    const sinks = result && !desk;
    F.sink = st ? (sinks ? 1 : 0) : lerp(F.sink, sinks ? 1 : 0, rate(dt, 1.6));
    const br = Math.sin(t * (working ? 0.26 : 0.5));
    const fl = t - F.flinch, flinch = fl >= 0 && fl < 0.8 ? Math.sin(Math.min(1, fl / 0.1) * Math.PI / 2) * Math.exp(-Math.max(0, fl - 0.1) * 5) : 0;
    const u = fit.u * (1 + 0.018 * br - 0.05 * flinch - 0.08 * F.sink) * (0.9 + 0.1 * pres);
    const y = fit.y + (1.6 * br - 9 * flinch - 30 * F.sink - 34 * (1 - pres) - 50 * lv) * fit.u;
    // where they look: the pointer (all of them snap to it), else they wander and come back to the button
    const fresh = V.ptr && (desk || t - V.ptr.t < 5), snap = V.ptr && t - V.ptr.t < 0.5;
    // on the stage: the mouse while it is in the window (it settles when the mouse leaves); on Result the panel's words
    const look = desk && result && !(V.ptr && t - V.ptr.t < 1.5) ? { x: R.panel.x + R.panel.w * 0.4, y: L.H * (0.42 + 0.12 * Math.sin(t * 0.21)) } : fresh ? V.ptr : null;
    const aim = (ex, ey) => look ? [clamp((look.x - ex) / (L.W * 0.32), -1, 1), clamp((look.y - ey) / (L.H * 0.28), -1, 1)]
      : [0.45 * Math.sin(t * 0.23) + 0.25 * Math.sin(t * 0.71 + 1), 0.55 + 0.35 * Math.sin(t * 0.31 + 2)];
    // the head leans toward what it watches (the crown and the eyes; the jaw keeps its grip on the button)
    const lean = desk && look && !st ? [clamp((look.x - fit.x) / (SW() * 0.5), -1, 1) * 16 * fit.u, clamp((look.y - fit.y) / (L.H * 0.5), -1, 1) * 7 * fit.u] : [0, 0];
    F.lean = F.lean || [0, 0];
    F.lean = [lerp(F.lean[0], lean[0], rate(dt, 2.2)), lerp(F.lean[1], lean[1], rate(dt, 2.2))];
    // how open: wide while he speaks, slits while it works, droopy when it failed; each one blinks on its own
    const base = working ? 0.32 : failed ? 0.5 : rec ? 1.12 + 0.22 * V.lvl : MIC.state === "hold" ? 1.08 : 1;
    let blinking = F.eyes.filter((e) => t - e.blink < 0.2).length;
    F.eyes.forEach((e, i) => {
      let want = sinks ? (i < 2 ? 0.5 : 0) : base;
      const k = [4, 5, 2, 3, 0, 1].indexOf(i), at = 0.45 + k * 0.2 + 0.07 * hash(i);   // the arrival: one after another
      if (!st && ti < at) want = 0;
      if (lv > 0) want = 0;
      if (!st && t > e.blinkAt) {
        if (blinking < 2 && !working) { e.blink = t; blinking += 1; }
        e.blinkAt = t + 2.2 + hash(t * 3.7 + i) * 6.5 + (hash(i + t) < 0.2 ? -1.8 : 0);
      }
      const bt = t - e.blink, bk = !st && bt < 0.2 ? Math.abs(Math.cos(bt / 0.2 * Math.PI)) : 1;
      if (flinch) want *= 1 + 0.4 * flinch;
      e.open = st ? want : lerp(e.open, want, rate(dt, ti < 3 ? 24 : 10));
      e.k = e.open * bk;
      const [ax, ay] = hover ? aim(hold.x, hold.y).map((v) => v * 1.2) : aim(fit.x + EY[i][0] * u, y + EY[i][1] * u);
      const r = snap || hover ? 30 : 2.6 + i * 0.35;
      e.lx = st ? ax : lerp(e.lx, ax, rate(dt, r)); e.ly = st ? ay : lerp(e.ly, ay, rate(dt, r));
      // never behind a word or a control: an eye there closes and fades into the dark
      const ex = fit.x + EY[i][0] * u, ey = y + EY[i][1] * u, rr = (EY === ORBS ? EY[i][2] + 6 : EY[i][2] * 0.6 + 8) * u;
      const hit = words.some((q) => q.x < ex + rr && q.x + q.w > ex - rr && q.y + d < ey + rr * 0.5 && q.y + d + q.h > ey - rr * 0.5);
      e.a = st ? (hit ? 0 : 1) : clamp(e.a + (hit ? -0.15 : 0.06), 0, 1);
    });
    // now and then one more eye opens somewhere in the mass, looks round, and closes again
    if (!st && t > F.extraAt && ti > 4 && !working && !sinks && !lv) { F.extra = { e: pick(EY === ORBS ? ORB_EXTRA : EXTRA), t0: t, dur: 2 + rand() * 1.6 }; F.extraAt = t + 6 + rand() * 9; }
    if (F.extra && (EY === ORBS) !== (F.extra.e.length === 3)) F.extra = null;
    if (F.extra && (t - F.extra.t0 > F.extra.dur || lv)) F.extra = null;
    // the maw: a glossy seam that twitches; it parts with the voice; sealed by strands while working; once wide at the arrival
    if (!st && t > F.twitchAt) { F.twitch = t; F.twitchAt = t + 2.2 + rand() * 4; }
    const tw = t - F.twitch < 0.4 ? Math.sin((t - F.twitch) / 0.4 * Math.PI) : 0;
    let mw = rec ? 0.1 + 0.95 * V.lvl : MIC.state === "hold" ? 0.16 : working ? 0.07 : failed ? 0.22 : result ? 0 : 0.17 + 0.06 * Math.sin(t * 0.9) + 0.16 * tw;   // idle: parted, breathing, teeth showing
    const ow = ti - 1.9; if (!st && ow > 0 && ow < 1.2) mw = Math.max(mw, Math.pow(Math.sin(Math.PI * ow / 1.2), 0.6));
    if (flinch) mw = Math.max(mw, 0.32 * flinch);
    let grip = 0;
    if (hold) {
      // on the stage the maw HOLDS the record button (or the working ring): parted just enough that its lips grip the
      // collar; with his voice the jaw works round it, opening and clenching; when the mouse is on it, it bares more
      grip = clamp((hold.r + 7 * L.U) / (fit.u * MAW.hw * 0.97), 0.3, 0.92);
      mw = rec ? grip + (1 - grip) * (0.85 * V.lvl + 0.18 * V.lvl * Math.sin(t * 13)) : working ? grip + 0.03 * Math.sin(t * 0.9) : grip * (1.02 + 0.03 * Math.sin(t * 0.8) + 0.05 * tw) + (hover ? 0.07 : 0);
      if (!st && ow > 0 && ow < 1.2) mw = Math.max(mw, grip + (1 - grip) * Math.pow(Math.sin(Math.PI * ow / 1.2), 0.6));
    }
    if (G.tune.Maw != null) mw = G.tune.Maw;   // the lab's own knob (a still of the open maw)
    const mx0 = fit.x - 50 * u, my0 = y + MAW.y0 * u, mx1 = fit.x + 50 * u, my1 = y + (MAW.y1 + 10) * u;
    if (lv || words.some((q) => q.x < mx1 && q.x + q.w > mx0 && q.y + d < my1 && q.y + d + q.h > my0)) mw = hold ? grip : 0;
    F.maw = st ? (hold ? grip * 1.02 : result ? 0 : 0.2) : lerp(F.maw, mw, rate(dt, mw > F.maw ? 16 : 5));
    F.grip = grip;
    F.S = { x: fit.x, y, u, tw, lx: desk ? F.lean[0] : 0, ly: desk ? F.lean[1] : 0 };
    // the line under the button sits below the jaw and its drool (components.css reads --vk-hint-gap; --vk-gap is the card token)
    if (desk && R.mic) {
      const gap = Math.round(Math.max(30, fit.y + (MAW.y1 + 14) * fit.u + 26 * L.U - (R.mic.y + d + R.mic.r)));
      if (Math.abs(gap - (F.gap || 0)) > 3) { F.gap = gap; document.documentElement.style.setProperty("--vk-hint-gap", `${gap}px`); V.dirty = true; }
    }
  }
  function head() {
    const S = F.S || faceFit();
    return { x: S.x, y: S.y + 25 * S.u, s: 240 * S.u, rx: 124 * S.u, ry: 100 * S.u };
  }
  /** The points round one eye (a narrow almond, pointed at both ends), open ``k``, grown by ``grow`` face units. */
  function eyePts(S, E, k, grow = 0, n = 12, droop = 0) {
    const [ex, ey, Ln, h] = E, ang = E[4] + droop, u = S.u, c = Math.cos(ang), sn = Math.sin(ang), cx = S.x + ex * u, cy = S.y + ey * u;
    const up = [], lo = [];
    for (let i = 0; i <= n; i += 1) {
      const s = i / n, xs = (-0.5 + s) * (Ln + 2 * grow), b = Math.sin(Math.PI * s), g0 = grow * Math.pow(b, 0.5);
      // pointed at both ends, the upper lid fuller toward the outer end (a hard, narrowed stare)
      const sk = 1 + 0.4 * (s - 0.5) * Math.sign(ex);
      const yu = -(h * k * 1.1 * Math.pow(b, 1.25) * sk + g0), yl = h * k * 0.7 * Math.pow(b, 1.5) + g0;
      up.push([cx + (xs * c - yu * sn) * u, cy + (xs * sn + yu * c) * u]);
      if (i > 0 && i < n) lo.push([cx + (xs * c - yl * sn) * u, cy + (xs * sn + yl * c) * u]);
    }
    return up.concat(lo.reverse());
  }
  const droopOf = (E) => (V.view === "failed" ? 0.42 * Math.sign(E[0] || 1) : 0);
  /** How much of the head's lean a point at face height y takes: the crown and the eyes, never the gripping jaw. */
  const E0 = (e) => (e.seed ??= Math.random() * 6);
  const leanW = (y) => clamp((MAW.y0 - 6 - y) / 90, 0, 1);
  /** One orb, sharp: sunk wet glass with limb darkening, a pinprick pupil that tracks and dilates, a hard specular,
   *  and a dark membrane that slides sideways over it (``k``: 1 open, 0 covered; it comes from the outer side). */
  function orb(g, cx, cy, r, e, k, glow, pupil, side, t, droop, film = 0.97) {
    if (r < 0.8) return;
    g.globalCompositeOperation = "lighter";
    const gr = g.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 3);
    gr.addColorStop(0, `rgba(255,255,255,${(0.3 * glow).toFixed(3)})`); gr.addColorStop(0.3, `rgba(255,255,255,${(0.09 * glow).toFixed(3)})`); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(cx - r * 3, cy - r * 3, r * 6, r * 6);
    g.globalCompositeOperation = "source-over";
    g.save();
    g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.closePath();
    g.fillStyle = "#000"; g.fill();
    g.clip();
    // the ball: milky white, lit from the upper left, falling off to grey at its rim (it is round, it is wet)
    // the ball glows from inside where it looks (deep-sea light), and sinks into black toward its rim
    const lx = clamp(e.lx, -1, 1), ly = clamp(e.ly + droop, -1, 1), px = cx + lx * r * 0.42, py = cy + ly * r * 0.4;
    const b = g.createRadialGradient(lerp(cx, px, 0.6), lerp(cy, py, 0.6), r * 0.02, cx, cy, r * 1.0);
    const dim = 0.5 + 0.5 * glow, c3 = (v) => Math.round(v * dim);
    b.addColorStop(0, `rgb(${c3(255)},${c3(255)},${c3(250)})`);
    b.addColorStop(0.3, `rgb(${c3(214)},${c3(212)},${c3(205)})`);
    b.addColorStop(0.62, `rgb(${c3(96)},${c3(93)},${c3(90)})`);
    b.addColorStop(0.86, "rgb(20,18,18)");
    b.addColorStop(1, "rgb(0,0,0)");
    g.fillStyle = b; g.fillRect(cx - r, cy - r, r * 2, r * 2);
    // fine dark veins running in from the rim, and a deep red at the rim low down (light caught in blood-dark glass)
    g.strokeStyle = "rgba(0,0,0,0.5)"; g.lineWidth = Math.max(0.5, r * 0.035); g.beginPath();
    for (let i = 0; i < 7; i += 1) { const a = i * 0.9 + E0(e), q = r * (0.45 + 0.15 * Math.sin(i * 2.3)); g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.quadraticCurveTo(cx + Math.cos(a + 0.25) * r * 0.75, cy + Math.sin(a + 0.25) * r * 0.75, cx + Math.cos(a + 0.1) * q, cy + Math.sin(a + 0.1) * q); }
    g.stroke();
    const rr = g.createRadialGradient(cx, cy + r * 0.5, 0, cx, cy + r * 0.5, r * 0.8);
    rr.addColorStop(0, "rgba(130,0,18,0)"); rr.addColorStop(0.6, "rgba(130,0,18,0)"); rr.addColorStop(0.85, "rgba(150,0,20,0.24)"); rr.addColorStop(1, "rgba(150,0,20,0)");
    g.fillStyle = rr; g.fillRect(cx - r, cy - r * 0.3, r * 2, r * 1.6);
    // the pupil: a pinprick that tracks (squashed toward the rim) and opens with the voice; no iris, just a hole
    const pr = Math.max(0.8, r * pupil);
    g.fillStyle = "#000"; g.beginPath(); g.ellipse(px, py, pr * (1 - 0.32 * Math.abs(lx)), pr * (1 - 0.32 * Math.abs(ly)), 0, 0, TAU); g.fill();
    // the wet skin: a hard pin of light and a thin arc of it along the upper rim
    g.fillStyle = "rgba(255,255,255,0.95)";
    g.beginPath(); g.arc(cx - r * 0.36, cy - r * 0.5, Math.max(0.6, r * 0.075), 0, TAU); g.fill();
    g.strokeStyle = "rgba(255,255,255,0.5)"; g.lineWidth = Math.max(0.5, r * 0.04); g.beginPath(); g.arc(cx, cy, r * 0.84, Math.PI * 1.1, Math.PI * 1.42); g.stroke();
    // the membrane: a dark glossy sheet from the outer side; its edge bulges and carries a thin line of light
    const c = clamp(1 - k, 0, 1);
    if (c > 0.01) {
      const ex = cx + side * (r - 2.15 * r * c), bulge = side * r * 0.32 * Math.sin(Math.PI * Math.min(1, c * 1.4));
      g.beginPath(); g.moveTo(cx + side * r * 1.2, cy - r * 1.2); g.lineTo(ex + bulge * 0.2, cy - r * 1.2);
      g.quadraticCurveTo(ex - bulge, cy, ex + bulge * 0.2, cy + r * 1.2); g.lineTo(cx + side * r * 1.2, cy + r * 1.2); g.closePath();
      const mg = g.createLinearGradient(ex, cy, cx + side * r, cy);
      mg.addColorStop(0, `rgba(34,34,36,${film})`); mg.addColorStop(0.35, `rgba(10,10,11,${film})`); mg.addColorStop(1, `rgba(3,3,3,${film})`);
      g.fillStyle = mg; g.fill();
      g.beginPath(); g.moveTo(ex + bulge * 0.2, cy - r * 1.2); g.quadraticCurveTo(ex - bulge, cy, ex + bulge * 0.2, cy + r * 1.2);
      g.strokeStyle = `rgba(255,255,255,${(0.55 * Math.min(1, c * 4) * (1 - c * 0.5)).toFixed(3)})`; g.lineWidth = Math.max(0.7, r * 0.06); g.stroke();
    }
    // the socket throws a shadow onto the top of the ball
    const sh = g.createLinearGradient(0, cy - r, 0, cy - r * 0.1);
    sh.addColorStop(0, "rgba(0,0,0,0.92)"); sh.addColorStop(0.5, "rgba(0,0,0,0.45)"); sh.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = sh; g.fillRect(cx - r, cy - r, r * 2, r * 0.95);
    g.restore();
  }
  /** The head, in liquid: the skull, a crown of spires, sinews, lids round the eyes, the lips of the maw, drool. */
  function drawFace(pen, t) {
    if (V.backdrop || !F.S) return;
    const S = F.S, u = S.u, A = F.pres * (1 - 0.25 * F.sink), m = F.maw;
    const at = (x, y) => { const w = leanW(y); return [S.x + x * u + S.lx * w, S.y + y * u + S.ly * w]; };
    const sh = (x, y) => (y <= MAW.y0 ? at(x, y) : at(x + Math.sign(x || 1) * mawHW(clamp((y - MAW.y0) / (MAW.y1 - MAW.y0), 0, 1)) * m, y));
    const orbs = orbsOn();
    // darkness behind it: it comes out of the smoke
    pen.dark(S.x, S.y + 30 * u, 215 * u, 200 * u, 0.92);
    pen.dark(S.x, S.y - 70 * u, 170 * u, 120 * u, 0.7);
    if (A < 0.03) return;
    // on the stage: a cold backlight in the smoke behind the head, so its silhouette stands off the web
    if (R.desk) { pen.glow(S.x - 150 * u, S.y - 10 * u, 170 * u, 0.13 * A); pen.glow(S.x + 150 * u, S.y + 10 * u, 170 * u, 0.13 * A); pen.glow(S.x, S.y - 120 * u, 150 * u, 0.1 * A); }
    // the crown: horn-like spires out of the brow and the temples, swaying, webbed at the roots; they run into the room
    const sw = (i) => Math.sin(t * 0.37 + i * 1.9) * 7 + Math.sin(t * 0.83 + i) * 3;
    for (const dir of [1, -1]) {
      let prev = null;
      SPIRES.forEach((s, i) => {
        const j = i + (dir < 0 ? 7 : 0), [x1, y1] = at(dir * s[0], s[1]), [cx, cy] = at(dir * (s[2] + sw(j) * 0.6), s[3] + sw(j + 3) * 0.5), [x2, y2] = at(dir * (s[4] + sw(j) * 1.3), s[5] + sw(j + 5));
        const P = strand(pen, x1, y1, cx, cy, x2, y2, s[6] * u * A, 1.6 * u, 0.04, { t, seed: j, speed: 11, n: 12 });
        if (prev && i < 3) {
          const k = 0.32 + 0.06 * Math.sin(t * 0.5 + j);
          const a = P[Math.round(12 * k)], b = prev[Math.round(12 * k)], mid = [(a[0] + b[0]) / 2 * 0.7 + (P[0][0] + prev[0][0]) / 2 * 0.3, (a[1] + b[1]) / 2 * 0.7 + (P[0][1] + prev[0][1]) / 2 * 0.3];
          pen.web([P[0], P[2], a, mid, b, prev[2], prev[0]], 0.85 * A);
        }
        prev = P;
      });
    }
    // the skull: one slab of liquid; below the top of the seam its two halves part with the maw
    const sk = SKULL.concat(SKULL.slice(1).reverse().map(([x, y]) => [-x, y]));
    const Q = [], C = [];
    sk.forEach(([x, y], i) => { const wv = 2.2 * Math.sin(t * 0.6 + i * 1.3); Q.push(sh(x + Math.sign(x) * wv, y + wv * 0.5)); C.push(sh(x * 0.56, 40 + (y - 40) * 0.6)); });
    pen.plate(Q, C, A);
    // the mass is sinews: brow ridges, strands fanning up into the crown, down the cheeks into the mandibles, the
    // lips of the seam; they slide a little, all the time
    const rope = (pts, w0, w1, seed) => {
      const Q2 = smoothPts(pts.map(([x, y], i) => sh(x + Math.sin(t * 0.5 + seed * 1.7 + i) * 1.6, y + Math.cos(t * 0.43 + seed + i * 1.3) * 1.6)), 3), n = Q2.length;
      pen.rope(Q2, Q2.map((_, i) => Math.max(1, lerp(w0, w1, i / (n - 1)) * u * A * (0.7 + 0.3 * Math.sin(Math.PI * i / (n - 1))))), { t, seed, speed: 9, wave: 70 });
    };
    for (const d of [1, -1]) {
      // the brow: heavy, low over the top eyes, down into the temple
      rope([[d * 4, -13], [d * 30, -19], [d * 72, -24], [d * 104, -10], [d * 117, 18]], 15, 10, 2 + d);
      // fanning up from the brow into the roots of the spires
      rope([[d * 10, -16], [d * 20, -44], [d * 28, -66]], 9, 12, 10 + d);
      rope([[d * 30, -20], [d * 46, -42], [d * 60, -56]], 8, 12, 11 + d);
      rope([[d * 66, -24], [d * 82, -32], [d * 92, -38]], 8, 11, 12 + d);
      // between the eyes and under them (the orbs: round their sockets instead, out to the temples)
      if (!orbs) {
        rope([[d * 8, 15], [d * 30, 13], [d * 60, 18], [d * 84, 8]], 7, 5, 3 + d);
        rope([[d * 6, 40], [d * 24, 40], [d * 48, 46], [d * 70, 40]], 6, 4, 13 + d);
      } else {
        rope([[d * 4, 20], [d * 16, 38], [d * 44, 46], [d * 76, 28], [d * 100, 6]], 7, 4, 3 + d);
        rope([[d * 4, 44], [d * 10, 62], [d * 34, 64], [d * 56, 50], [d * 86, 50]], 6, 4, 13 + d);
      }
      // down the cheeks into the mandibles
      rope([[d * 113, 20], [d * 108, 58], [d * 84, 100], [d * 60, 146], [d * 31, 172]], 16, 8, 5 + d);
      rope([[d * 92, 24], [d * 70, 62], [d * 66, 104], [d * 44, 140], [d * 24, 164]], 10, 5, 6 + d);
      rope([[d * 70, 46], [d * 46, 74], [d * 42, 112], [d * 20, 148]], 6, 4, 7 + d);
      // and one that crosses them, so they read as a body and not as bars
      rope([[d * 108, 44], [d * 80, 82], [d * 40, 96], [d * 14, 90]], 7, 5, 14 + d);
      // the lips of the seam
      rope([[d * 3, MAW.y0 - 8], [d * 4, 92], [d * 4, 124], [d * 4, MAW.y1], [d * 12, 170]], 6, 7.5, 8 + d);
    }
    rope([[0, -8], [0, -40], [0, -68]], 7, 13, 9);
    // a heavy wet upper lid over every eye (a closed eye keeps its crease); orbs: a wet socket rim, heavy at the top
    const all = (orbs ? ORBS : EYES).map((E, i) => [E, F.eyes[i].k * F.eyes[i].a]);
    if (F.extra) all.push([F.extra.e, Math.pow(Math.sin(Math.PI * clamp((t - F.extra.t0) / F.extra.dur, 0, 1)), 0.4)]);
    if (orbs) {
      for (const [E, k] of all) {
        const [cx, cy] = at(E[0], E[1]), r = (E[2] + 2.4) * u, n = 22, Q = [], W = [];
        for (let i = 0; i < n; i += 1) {
          const a = (i / n) * TAU, top = Math.max(0, -Math.sin(a));
          Q.push([cx + Math.cos(a) * r * (1 + 0.04 * Math.sin(t * 0.7 + i)), cy + Math.sin(a) * r * (1 - 0.06 * top)]);
          W.push(Math.max(1.5, (2.2 + 4.2 * top * top + 0.9 * Math.sin(a * 3 + t * 0.6 + E[0])) * u * A));
        }
        pen.rope(Q, W, { t, seed: E[0], speed: 7, wave: 40, closed: true });
        if (k > 0.02) pen.glow(cx, cy, r * 1.9, 0.07 * Math.min(1, k));
      }
    }
    for (const [E, k] of orbs ? [] : all) {
      const R0 = eyePts(S, E, Math.max(0.3, k), 2.6, 10, droopOf(E)).slice(0, 11);
      pen.rope(R0, R0.map((_, i) => Math.max(1.2, 5.5 * u * A * (0.35 + 0.65 * Math.sin(Math.PI * i / 10)))), { t, seed: E[0], speed: 7, wave: 40 });
    }
    // drool: off the lips at the bottom of the seam and off the mandible tips
    const fail = V.view === "failed", dl = (fail ? 80 : 14 + 60 * m) * u;
    for (const [x, y, per, ph, k] of [[-5, MAW.y1 + 6, 3.1, 0.4, 1], [6, MAW.y1 + 2, 3.9, 2.1, 0.8], [-31, 176, 4.4, 1.2, 0.6], [31, 176, 5.2, 3.3, 0.7]]) {
      const [px, py] = sh(x, y);
      drip(pen, px, py, dl * k, fail ? per * 0.7 : per, ph, t, { w: 6 * u / L.U, r: u / L.U, fall: fail ? 1.4 : 1 });
    }
    // no liquid where an eye is open (an orb's socket is always open: its membrane is drawn sharp), nor inside the maw
    for (const [E, k] of all) {
      if (orbs) { const [cx, cy] = at(E[0], E[1]), r = (E[2] + 0.6) * u, Q = []; for (let i = 0; i < 12; i += 1) Q.push([cx + Math.cos(i / 12 * TAU) * r, cy + Math.sin(i / 12 * TAU) * r]); pen.cut(Q); }
      else if (k > 0.08) pen.cut(eyePts(S, E, k, 1.2, 10, droopOf(E)));
    }
    if (m > 0.015) {
      const Lf = [], Rt = [];
      for (let i = 0; i <= 12; i += 1) { const s = i / 12, y = MAW.y0 + (MAW.y1 - MAW.y0) * s, w = mawHW(s) * m; Lf.push(at(-w, y)); Rt.push(at(w, y)); }
      Lf.push(at(-mawHW(1) * m * 0.7, MAW.y1 + 16)); Rt.push(at(mawHW(1) * m * 0.7, MAW.y1 + 16));
      pen.cut(Lf.concat(Rt.reverse()));
    }
  }
  /** One hooked tooth: root at (bx, by) on the lip, pointing ``nx`` (+1 right, -1 left), its tip bent by ``hook``. */
  function tooth(g, bx, by, nx, len, wid, hook, front) {
    const tx = bx + nx * len, ty = by + hook * len * 0.55;
    const c1x = bx + nx * len * 0.5, c1y = by - wid * 0.55 + hook * len * 0.04, c2x = bx + nx * len * 0.6, c2y = by + wid * 0.5 + hook * len * 0.34;
    g.beginPath(); g.moveTo(bx - nx * 2, by - wid * 0.62); g.quadraticCurveTo(c1x, c1y, tx, ty); g.quadraticCurveTo(c2x, c2y, bx - nx * 2, by + wid * 0.62); g.closePath();
    const gr = g.createLinearGradient(bx, by, tx, ty);
    if (front) { gr.addColorStop(0, "#2a2724"); gr.addColorStop(0.3, "#9d978a"); gr.addColorStop(0.75, "#e9e4d8"); gr.addColorStop(1, "#fffdf6"); }
    else { gr.addColorStop(0, "#110f0e"); gr.addColorStop(0.5, "#4e4a44"); gr.addColorStop(1, "#8d887d"); }
    g.fillStyle = gr; g.fill();
    g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = 0.8; g.stroke();
    if (front) {   // the wet glint along its edge
      g.beginPath(); g.moveTo(bx + nx * len * 0.22, by - wid * 0.32 + hook * len * 0.03);
      g.quadraticCurveTo(c1x + nx * len * 0.06, c1y + wid * 0.2, tx - nx * len * 0.12, ty - hook * len * 0.1 - wid * 0.05);
      g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = Math.max(0.6, wid * 0.11); g.stroke();
    }
  }
  /** Inside the maw: the dark throat with a little deep red, two rows of teeth on each edge, strands across. */
  function drawMaw(g, S, t, m) {
    const u = S.u, at = (x, y) => [S.x + x * u, S.y + y * u], Lf = [], Rt = [];
    for (let i = 0; i <= 14; i += 1) { const s = i / 14, y = MAW.y0 + (MAW.y1 - MAW.y0) * s, w = mawHW(s) * m; Lf.push(at(-w, y)); Rt.push(at(w, y)); }
    Lf.push(at(-mawHW(1) * m * 0.7, MAW.y1 + 16)); Rt.push(at(mawHW(1) * m * 0.7, MAW.y1 + 16));
    g.beginPath(); Lf.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); for (let i = Rt.length - 1; i >= 0; i -= 1) g.lineTo(Rt[i][0], Rt[i][1]); g.closePath();
    const [mx, my] = at(0, MAW.y0 + (MAW.y1 - MAW.y0) * 0.55), rr = (MAW.y1 - MAW.y0) * 0.6 * u;
    const gr = g.createRadialGradient(mx, my, 0, mx, my, rr);
    gr.addColorStop(0, `rgb(${Math.round(26 + 30 * V.lvl)},1,4)`); gr.addColorStop(0.45, "#070102"); gr.addColorStop(1, "#000");
    g.fillStyle = gr; g.fill();
    g.save(); g.clip();
    g.globalCompositeOperation = "lighter";   // a few deep red glints, far inside
    for (const [ox, oy, sz, ph] of [[-0.5, 100, 1, 0], [0.4, 126, 0.55, 2.2], [-0.2, 114, 0.35, 4.1]]) {
      const [x, y] = at(ox * mawHW(0.55) * m + Math.sin(t * 0.6 + ph) * 2 * m, oy + Math.sin(t * 0.4 + ph) * 5);
      const r = (5 + 2 * Math.sin(t * 1.1 + ph)) * sz * u * (0.4 + m), a = (0.32 + 0.2 * Math.sin(t * 2.3 + ph)) * Math.min(1, m * 2.5);
      const rg = g.createRadialGradient(x, y, 0, x, y, Math.max(0.5, r));
      rg.addColorStop(0, `rgba(160,8,26,${a.toFixed(3)})`); rg.addColorStop(0.4, `rgba(110,0,16,${(a * 0.4).toFixed(3)})`); rg.addColorStop(1, "rgba(90,0,12,0)");
      g.fillStyle = rg; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    g.globalCompositeOperation = "source-over";
    // the teeth, back row then front row; top ones hook down, bottom ones up: a trap
    for (const front of [0, 1]) for (const d of [-1, 1]) for (let k = 0; k < (front ? 8 : 7); k += 1) {
      const s = clamp(0.04 + 0.92 * (k + (d > 0 ? 0.5 : 0) + (front ? 0 : 0.3)) / 8, 0, 1);
      const y = MAW.y0 + (MAW.y1 - MAW.y0) * s, w = mawHW(s) * m;
      const len = (front ? 7 + 12 * Math.sin(Math.PI * s) : 4 + 7 * Math.sin(Math.PI * s)) * (0.7 + 0.55 * hash(k * 3 + d + front * 7)) * u;
      const [bx, by] = at(d * w, y);
      tooth(g, bx, by, -d, len, len * (front ? 0.44 : 0.5), (s < 0.55 ? 1 : -1) * (0.35 + 0.3 * hash(k + d)), front);
    }
    g.restore();
    // strands of liquid across the gap: they stretch, neck and snap; a snapped one hangs off each lip with a bead
    const nS = V.view === "working" ? 9 : 6;
    for (let k = 0; k < nS; k += 1) {
      const s = 0.1 + 0.8 * (k + 0.6 * hash(k + 11)) / nS, y = MAW.y0 + (MAW.y1 - MAW.y0) * s, w = mawHW(s) * m, gap = 2 * w * u;
      const brk = (12 + 34 * hash(k * 5 + 1)) * u;
      const [x1, y1] = at(-w, y + 2 * Math.sin(k)), [x2, y2] = at(w, y + 2 * Math.sin(k * 1.7));
      if (gap < brk) {
        const f = gap / brk, wd = (2.8 - 1.9 * f) * u;
        const P = curve(x1, y1, (x1 + x2) / 2 + Math.sin(t + k) * 2 * u, (y1 + y2) / 2 + (2 + gap * 0.3), x2, y2, 10);
        tube(g, P, P.map((_, i) => Math.max(0.5, wd * (1 - 0.75 * f * Math.sin(Math.PI * i / 10)))), { t, seed: k, speed: 8, wave: 30 });
        if (f > 0.5 && k % 2) bead(g, (x1 + x2) / 2, (y1 + y2) / 2 + 2 + gap * 0.17, 1.6 * u);
      } else {
        for (const [x, yy, dd] of [[x1, y1, 1], [x2, y2, -1]]) {
          const l = (5 + 5 * hash(k + dd)) * u, P = curve(x, yy, x + dd * l * 0.45, yy + l * 0.45, x + dd * l * 0.3, yy + l, 5);
          tube(g, P, [2.2, 1.9, 1.6, 1.3, 1, 0.8].map((v) => v * u), { t, seed: k });
          bead(g, P[5][0], P[5][1] + u, 1.7 * u);
        }
      }
    }
  }
  /** The sharp parts, on a 2D context: the seam, the maw, the six eyes (and the odd seventh). */
  function faceFx(g, t, wipe) {
    if (V.backdrop || !F.S || F.pres < 0.03) return;
    const S = F.S, u = S.u, A = F.pres * (1 - 0.3 * F.sink), m = F.maw, d = dy();
    const at = (x, y) => [S.x + x * u, S.y + y * u];
    g.save(); g.globalAlpha = A;
    // the seam when it is (almost) closed: a glossy crease that twitches
    if (m < 0.12) {
      const Q = [];
      for (let i = 0; i <= 10; i += 1) { const s = i / 10, y = MAW.y0 - 4 + (MAW.y1 + 8 - MAW.y0) * s; Q.push(at(Math.sin(s * 9 + t * 11) * S.tw * 1.6 + Math.sin(s * 3 + t * 0.4) * 0.8, y)); }
      g.lineCap = "round"; poly(g, Q); g.strokeStyle = "rgba(0,0,0,0.95)"; g.lineWidth = 2.4 * u; g.stroke();
      poly(g, Q.map(([x, y]) => [x - 1.3 * u, y])); g.strokeStyle = `rgba(255,255,255,${(0.16 + 0.3 * S.tw).toFixed(3)})`; g.lineWidth = 0.9; g.stroke(); g.lineCap = "butt";
    }
    if (m > 0.015) drawMaw(g, S, t, m);
    // the eyes
    const rec = MIC.state === "recording", working = V.view === "working";
    const orbs = orbsOn();
    const list = (orbs ? ORBS : EYES).map((E, i) => [E, F.eyes[i].k * F.eyes[i].a, F.eyes[i]]);
    if (F.extra) list.push([F.extra.e, Math.pow(Math.sin(Math.PI * clamp((t - F.extra.t0) / F.extra.dur, 0, 1)), 0.4), F.eyes[2]]);
    if (orbs) {
      const failed = V.view === "failed";
      for (const [E, k, e] of list) {
        const w = leanW(E[1]), cx = S.x + E[0] * u + S.lx * w, cy = S.y + E[1] * u + S.ly * w, r = E[2] * u;
        if (R.text.some((q) => q.x < cx + r && q.x + q.w > cx - r && q.y + d < cy + r && q.y + d + q.h > cy - r) && !R.desk) continue;
        // pinpricks; they open with his voice, a little when the mouse is on the button, shrink while it works
        const pupil = rec ? 0.11 + 0.36 * V.lvl : working ? 0.07 : F.hover ? 0.2 : failed ? 0.24 : 0.11 + 0.02 * Math.sin(t * 0.7 + E[0]);
        const glow = (rec ? 1.15 + 0.6 * V.lvl : working ? 0.6 : failed ? 0.55 : 1) * (0.35 + 0.65 * Math.min(1, k + 0.2));
        // while it works the membranes close all the way and it watches through them (never a slit)
        orb(g, cx, cy, r, e, working ? 0 : failed ? Math.min(1, 0.55 + 0.5 * k) : Math.min(1, k), glow, pupil, Math.sign(E[0] || 1), t, failed ? 0.5 : 0, working ? 0.8 : 0.97);
      }
      g.restore();
      if (wipe) {   // (the held button is not wiped: the page draws it over the maw that holds it)
        g.globalCompositeOperation = "destination-out"; g.fillStyle = "#000";
        for (const r of R.desk ? R.keep : R.text) g.fillRect(r.x - 6, r.y + d - 6, r.w + 12, r.h + 12);
        g.globalCompositeOperation = "source-over";
      }
      return;
    }
    for (const [E, k, e] of list) {
      if (k < 0.05) continue;
      const droop = droopOf(E), ang = E[4] + droop, [cx, cy] = at(E[0], E[1]), Lp = E[2] * u, hp = E[3] * u * k;
      if (R.text.some((q) => q.x < cx + Lp && q.x + q.w > cx - Lp && q.y + d < cy + Lp * 0.4 && q.y + d + q.h > cy - Lp * 0.4)) continue;
      const glow = (rec ? 1.25 + 0.9 * V.lvl : working ? 0.55 : 1) * Math.min(1, k);
      g.globalCompositeOperation = "lighter";
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, Lp * 1.25);
      gr.addColorStop(0, `rgba(255,255,255,${(0.42 * glow).toFixed(3)})`); gr.addColorStop(0.22, `rgba(255,255,255,${(0.14 * glow).toFixed(3)})`); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.fillRect(cx - Lp * 1.25, cy - Lp * 1.25, Lp * 2.5, Lp * 2.5);
      g.globalCompositeOperation = "source-over";
      const P = eyePts(S, E, Math.min(k, 1.5), 0, 14, droop);
      g.save();
      g.beginPath(); P.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
      g.shadowColor = "rgba(255,255,255,0.9)"; g.shadowBlur = 6 * u * L.k * glow;
      g.fillStyle = "#fff"; g.fill(); g.shadowBlur = 0; g.clip();
      // the pupil: a thin dark slit that tracks (wider while he speaks, a hair while it works)
      const px = cx + e.lx * Lp * 0.27, py = cy + e.ly * hp * 0.3;
      const pw = Math.max(0.7, (rec ? 0.045 + 0.03 * V.lvl : working ? 0.03 : 0.04) * Lp), ph = Math.max(hp * 1.5, 4 * u);
      g.fillStyle = "rgba(0,0,0,0.95)"; g.beginPath(); g.ellipse(px, py, pw, ph, ang * 0.4, 0, TAU); g.fill();
      // the wet upper lid throws a thin shadow into it
      const ls = g.createLinearGradient(0, cy - hp * 1.3, 0, cy);
      ls.addColorStop(0, "rgba(0,0,0,0.4)"); ls.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = ls; g.fillRect(cx - Lp, cy - hp * 1.6, Lp * 2, hp * 1.6);
      g.restore();
    }
    g.restore();
    // nothing sharp over a word or a control
    if (wipe) {
      g.globalCompositeOperation = "destination-out"; g.fillStyle = "#000";
      for (const r of R.text) g.fillRect(r.x - 6, r.y + d - 6, r.w + 12, r.h + 12);
      g.globalCompositeOperation = "source-over";
    }
  }
  /** The canvas above the liquid for the sharp parts (WebGL only; the 2D fallback draws them on its own canvas). */
  function faceLayer() {
    if (!G.on || !G.cv) return null;
    if (!F.cv) {
      F.cv = document.createElement("canvas"); F.cv.className = "vk-canvas vk-face"; fill(F.cv); F.cv.setAttribute("aria-hidden", "true");
      G.cv.after(F.cv); F.g = F.cv.getContext("2d");
    }
    if (F.cv.width !== G.cv.width || F.cv.height !== G.cv.height) { F.cv.width = G.cv.width; F.cv.height = G.cv.height; }
    return F.g;
  }

  // ============================================================================================ the collar on the record button
  function drawCollar(pen, t, c, mode) {
    // c: { x, y, d (radius of the button), r (of its box) }. mode: idle | recording | hold | drop | ring
    const lvl = mode === "recording" ? V.lvl : 0, U = L.U;
    const want = mode === "recording" ? 1 : mode === "hold" ? 1.4 : mode === "ring" ? 1.1 : mode === "drop" ? -0.7 : 0;
    MIC.T = lerp(MIC.T, want, mode === "drop" ? 0.12 : 0.06);
    const T = MIC.T, tap = V.tap && t - V.tap.t < 0.7 && Math.hypot(V.tap.x - c.x, V.tap.y - c.y) < c.r * 2.4 ? Math.sin((t - V.tap.t) * 18) * Math.exp(-(t - V.tap.t) * 5) : 0;
    const r0 = c.d + 1 - 3 * T + 3 * tap, u = c.d / 66;
    // a cold backlight: the black round the button reads as a silhouette in the smoke
    pen.glow(c.x, c.y, c.d * 2.7, 0.1 + 0.08 * lvl);
    // spikes radiate out with webbing in the crooks; they shorten and pulse when it tightens
    const nS = 8, tips = [];
    for (let i = 0; i < nS; i += 1) {
      const a = (i / nS) * TAU + 0.35 * Math.sin(i * 2.3) + 0.07 * Math.sin(t * 0.5 + i);
      if (R.desk && Math.sin(a) < -0.25) { tips.push({ a, bx: c.x, by: c.y, mx: c.x, my: c.y, ex: c.x, ey: c.y, len: 0 }); continue; }   // in the maw: none up into the face
      const down = Math.max(0, Math.sin(a));   // under the button they are short: the hint text is below
      const len = (18 + 30 * hash(i + 3) + 10 * Math.sin(t * 0.8 + i * 1.7)) * u * (1 - 0.6 * down) * (1 - 0.35 * T + 0.9 * lvl) * (1 + 0.5 * tap);
      const b0 = r0 + 14 * u, bx = c.x + Math.cos(a) * b0, by = c.y + Math.sin(a) * b0;
      let ex = c.x + Math.cos(a) * (b0 + len), ey = c.y + Math.sin(a) * (b0 + len);
      if (V.ptr && t - V.ptr.t < 4) { const dx = V.ptr.x - ex, dd = V.ptr.y - ey, d = Math.hypot(dx, dd); if (d < 160) { ex += dx * 0.18 * (1 - d / 160); ey += dd * 0.18 * (1 - d / 160); } }
      const bend = Math.sin(t * 0.9 + i * 2.1) * len * 0.35;
      const mxp = (bx + ex) / 2 - Math.sin(a) * bend, myp = (by + ey) / 2 + Math.cos(a) * bend + len * 0.1;
      tips.push({ a, bx, by, mx: mxp, my: myp, ex, ey, len });
      if (len > 4) strand(pen, bx, by, mxp, myp, ex, ey + len * 0.06, (15 + 6 * hash(i)) * u * (1 + 0.4 * T), 3 * U, 0.1, { t: t + i, speed: 6 + i % 5, n: 8 });
    }
    for (let i = 0; i < nS; i += 1) {   // the webbing between neighbouring spikes, a third of the way out
      const p = tips[i], q = tips[(i + 1) % nS];
      if (hash(i * 7.3) < 0.35 || Math.sin(p.a) > 0.5 || !p.len || !q.len) continue;
      const k = 0.45 + 0.15 * Math.sin(t * 0.6 + i);
      const pa = [lerp(p.bx, p.mx, 1.2 * k), lerp(p.by, p.my, 1.2 * k)], qa = [lerp(q.bx, q.mx, 1.2 * k), lerp(q.by, q.my, 1.2 * k)];
      const ix = lerp((pa[0] + qa[0]) / 2, c.x, 0.18), iy = lerp((pa[1] + qa[1]) / 2, c.y, 0.18);
      pen.web([[p.bx, p.by], pa, [ix, iy], qa, [q.bx, q.by]], 0.9);
    }
    // the drips under it (short: the hint text is below)
    for (const [fa, per, ph] of [[0.33, 4.2, 0], [0.52, 3.7, 3.1], [0.7, 5.4, 2.2]]) {
      const a = fa * Math.PI, x = c.x + Math.cos(a) * (r0 + 16 * u), y = c.y + Math.sin(a) * (r0 + 16 * u);
      drip(pen, x, y, (16 + 14 * hash(fa * 9)) * u, per, ph, t, { w: 10 * u });
    }
    // the grip: thick ragged rings round the button, overlapping, writhing
    for (let j = 0; j < 3; j += 1) {
      const Q = [], Wd = [], n = 60;
      for (let i = 0; i < n; i += 1) {
        const a = (i / n) * TAU;
        const rr = r0 + (7 + j * 10) * u + 3.5 * u * Math.sin(3 * a + t * 0.7 + j * 2) + 1.2 * u * Math.sin(5 * a - t * 0.9 + j) + 2 * u * lvl * Math.sin(7 * a + t * 9);
        Q.push([c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr]);
        Wd.push(Math.max(2, (23 - j * 5 + 7 * Math.sin(2 * a + t * 0.5 + j * 1.7) + 2 * Math.sin(5 * a - t * 0.3 + j)) * u * (1 + 0.45 * T + 0.5 * lvl)));
      }
      pen.rope(Q, Wd, { t, seed: j * 2.3, closed: true, speed: 10 + j * 5, red: j === 1 ? 14 : 0, wave: 70 * u });
    }
    // recording: one thin white lap round the collar, a minute a lap
    if (mode === "recording" || mode === "hold") {
      const frac = mode === "recording" ? (MIC.secs % 60) / 60 : 1, rl = r0 + 36 * u;
      pen.arc(c.x, c.y, rl, 0, TAU, 1.6, 0.16);
      pen.arc(c.x, c.y, rl, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.004, frac), 2.4, 0.95);
    }
  }

  // ============================================================================================ the pods (home tiles) and card rims
  function rim(pen, r, t, i, o = {}) {
    const d = dy(), per = 2 * (r.w + r.h), n = clamp(Math.round(per / (R.phone ? 9 : 12)), 24, 150);
    const thick = (o.w || 1) * L.U;
    for (let j = 0; j < (o.bands || 2); j += 1) {
      const Q = [], Wd = [];
      for (let k = 0; k < n; k += 1) {
        const f = k / n, out = (3 + j * 5) + 2.5 * Math.sin(f * TAU * 5 + t * 0.6 + i + j * 2) + 1.5 * Math.sin(f * TAU * 11 - t * 0.9 + j);
        Q.push(perim({ x: r.x, y: r.y, w: r.w, h: r.h }, f, out, d, o.round || 0.3));
        Wd.push(Math.max(2, (11 - j * 3 + 4.5 * Math.sin(f * TAU * 3 + t * 0.4 + j * 2 + i) + 2.5 * Math.sin(f * TAU * 8 - t * 0.7 + i)) * thick));
      }
      pen.rope(Q, Wd, { t, seed: i + j * 3, closed: true, speed: 9 + j * 4, red: o.red && j === 0 ? o.red : 0, a: o.a ?? 1, wave: 90 });
    }
  }
  function drawPods(pen, t) {
    const d = dy(), pods = R.pods;
    pods.forEach((p, i) => {
      for (const [fx, per, ph] of [[0.2, 4.4, i * 1.3], [0.42, 5.9, i * 0.4 + 2.5], [0.62 + 0.06 * (i % 2), 5.6, i * 2.1 + 1], [0.84, 3.9, i * 0.7 + 2]]) {
        drip(pen, p.x + p.w * fx, p.y + p.h + d + 9 * L.U, 16 + 16 * hash(i * 3 + fx * 7), per, ph, t, { w: 9 });
      }
      rim(pen, p, t, i, { red: i === 0 ? 9 : i === 2 ? 6 : 0, w: 1.15, round: 0.46 });
    });
    // the pods are bridged to each other: two strands and a membrane in the gap
    for (let i = 0; i + 1 < pods.length; i += 1) {
      const p = pods[i], q = pods[i + 1];
      if (Math.abs(p.y - q.y) > 8) continue;
      const x1 = p.x + p.w - 4, x2 = q.x + 4, xm = (x1 + x2) / 2;
      const ys = [0.2, 0.8].map((fy, k) => p.y + d + p.h * fy + Math.sin(t * 0.8 + i + k * 3) * 3);
      ys.forEach((y, k) => {
        const sag = (5 + 4 * Math.sin(t * 0.6 + i * 2 + k * 3)) * (k ? 1 : -1);
        strand(pen, x1, y, xm, y + sag, x2, y + sag * 0.2, 14 * L.U, 13 * L.U, 0.5 + 0.15 * Math.sin(t * 0.9 + k * 4), { t, speed: 5, n: 6 });
      });
      const k = 0.3 + 0.1 * Math.sin(t * 0.5 + i);
      pen.web([[x1, ys[0]], [xm + 2 * Math.sin(t + i), lerp(ys[0], ys[1], k)], [x2, ys[0]], [x2, ys[1]], [xm, lerp(ys[1], ys[0], k)], [x1, ys[1]]], 0.9);
    }
  }
  function drawCards(pen, t) {
    R.cards.slice(0, 6).forEach((c, i) => {
      if (c.y + dy() > L.H + 40 || c.y + c.h + dy() < -40) return;
      if (V.view === "failed" || i < 2) for (const [fx, per, ph] of [[0.18, 4.8, i], [0.63, 3.6, i * 2 + 1], [0.86, 5.4, i + 2]]) {
        drip(pen, c.x + c.w * fx, c.y + c.h + dy() + 9, 18 + 18 * hash(i + fx), per * (V.view === "failed" ? 0.6 : 1), ph, t, { w: 10, fall: V.view === "failed" ? 1.5 : 1 });
      }
      rim(pen, c, t, i + 3, { bands: 2, red: i === 0 ? 7 : 0, w: 0.9 });
    });
  }

  // ============================================================================================ frame
  function scene(pen, t) {
    drawFace(pen, t);
    drawMass(pen, t);
    for (const r of P.ropes) drawRope(pen, r, t);
    drawThreads(pen, t);
    drawSnaps(pen, t);
    drawCards(pen, t);
    drawPods(pen, t);
    if (R.mic) drawCollar(pen, t, { x: R.mic.x, y: R.mic.y + dy(), d: R.mic.d, r: R.mic.r }, MIC.state);
    if (R.ring) drawCollar(pen, t, { x: R.ring.x, y: R.ring.y + dy(), d: R.ring.r * 0.92, r: R.ring.r }, "ring");
  }
  function frame(t, dt) {
    if (!L.cv) return;
    if (V.dirty || performance.now() - V.scanAt > 1000) scan();
    V.lvl = V.lvlT > V.lvl ? lerp(V.lvl, V.lvlT, Math.min(1, dt * 14)) : lerp(V.lvl, V.lvlT, Math.min(1, dt * 4));
    if (!P.seeded) seedWeb();
    if (P.view !== V.view) { P.view = V.view; regrabMissing(); }
    faceStep(t, dt);
    if (dt > 0) {
      rearrange(t);
      const f = clamp(dt * 30, 0.3, 2);
      for (const r of P.ropes) stepRope(r, t, dt, f);
    }
    if (G.on) {
      const q0 = performance.now(); scene(glBegin(), t); const q1 = performance.now(); glEnd(t);
      V.simMs += ((q1 - q0) - V.simMs) * 0.1; V.passMs += ((performance.now() - q1) - V.passMs) * 0.1;
      const fg = faceLayer();
      if (fg) { fg.setTransform(L.k, 0, 0, L.k, 0, 0); fg.clearRect(0, 0, L.W, L.H); faceFx(fg, t, true); }
    } else {
      const g = L.g; if (!g) return;
      g.setTransform(L.k, 0, 0, L.k, 0, 0); g.clearRect(0, 0, L.W, L.H);
      PEN_2D.g = g; scene(PEN_2D, t); faceFx(g, t, false);
    }
    if (MIC.state === "drop" && performance.now() - MIC.t0 > 900) MIC.state = "idle";
  }
  function wanted() {
    if (!V.on || document.hidden || still() || V.busy || V.mode === "still") return 0;
    if (!V.view || V.view === "gone") return 0;
    return V.view === "working" || V.mode === "cheap" ? 2 : 1;
  }
  /** The liquid pass must stay under 4 ms a frame: if the rolling average stays over it for 2 s, one notch down. A step
   *  that does not help (the cost is the simulation, not the pixels) is taken back and the guard gives up (stats().guard). */
  function guard(nowMs) {
    const ms = V.stats.ms, k = Math.min(ms.length, 30);
    if (k < 20 || V.guard === "gave-up") return;
    let sum = 0; for (let i = ms.length - k; i < ms.length; i += 1) sum += ms[i];
    const avg = sum / k;
    if (V.pre != null) {   // judging the last step, once a fresh window has filled
      if (nowMs - V.stepAt < 1500 || k < 25) return;
      if (avg > V.pre * 0.9) { V.q = Math.max(0, V.q - 1); V.guard = "gave-up"; sizeLayer(); }
      V.pre = null; V.over = 0; return;
    }
    if (avg <= 4 || V.q >= NOTCH.length - 1) { V.over = 0; return; }
    if (!V.over) { V.over = nowMs; return; }
    if (nowMs - V.over > 2000) { V.pre = avg; V.stepAt = nowMs; V.q += 1; V.guard = "stepped"; V.over = 0; V.stats.ms.length = 0; sizeLayer(); }
  }
  function loop(nowMs) {
    V.raf = 0;
    const want = wanted();
    if (!want) return;
    V.raf = requestAnimationFrame(loop);
    const cheap = want === 2, lean = V.mode === "cheap";
    if (cheap !== L.cheap) { L.cheap = cheap; sizeLayer(); }
    L.lean = lean;
    if (nowMs - V.last < (cheap ? CHEAP_MS : FRAME_MS) - 2) return;
    const dt = Math.min(0.1, (nowMs - (V.last || nowMs)) / 1000);
    if (V.last) { V.stats.gaps.push(nowMs - V.last); if (V.stats.gaps.length > 600) V.stats.gaps.shift(); }
    V.last = nowMs; V.stats.frames += 1;
    const a = performance.now();
    frame((nowMs - V.t0) / 1000, dt);
    V.stats.ms.push(performance.now() - a); if (V.stats.ms.length > 600) V.stats.ms.shift();
    guard(nowMs);
  }
  function kick() { if (!V.raf) { V.last = 0; V.raf = requestAnimationFrame(loop); } }
  /** One frame now: reduced motion (the full look, still), a layout change, a tab coming back. */
  function draw() {
    if (!V.on || !L.cv) return;
    scan();
    if (still() || V.mode === "still") {
      L.cheap = false; L.lean = false;
      if (!P.seeded) seedWeb();
      P.view = V.view; regrabMissing();
      for (const r of P.ropes) { r.fa = r.fb = null; }
      P.snaps = [];
      // settle the web without time passing, then draw it once
      for (let i = 0; i < 90; i += 1) for (const r of P.ropes) stepRope(r, 20, 1 / 30, 1);
      MIC.open = 0.85; V.still = true; frame(20, 0); V.still = false;
      return;
    }
    kick();
  }
  function start() {
    if (!G.on && !glStart(L.base)) { L.cv = L.base; L.g = L.base.getContext("2d"); }
    if (G.on) { L.cv = G.cv; L.g = null; }
    if (F.delay != null) { F.intro = now() + F.delay; F.delay = null; }
    sizeLayer(); scan(); draw();
  }

  // The Lab's page takeover, result overlays and personal backdrop are Lab-only and are not part of the kit.

  // ============================================================================================ the controller
  const subs = [];
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); subs.push(() => t.removeEventListener(ev, fn, o)); };
  let rz = 0, listening = false;
  const toCanvas = (e) => ({ x: (e.clientX - L.ax) * L.S, y: (e.clientY - L.ay) * L.S, t: now() });
  function listen() {
    if (listening) return;
    listening = true;
    on(document, "visibilitychange", () => { if (!document.hidden) draw(); });
    on(window, "pointermove", (e) => { V.ptr = toCanvas(e); }, { passive: true });
    on(window, "pointerdown", (e) => { V.ptr = toCanvas(e); V.tap = toCanvas(e); F.flinch = V.tap.t; }, { passive: true });
    on(document.documentElement, "mouseleave", () => { if (R.desk) V.ptr = null; });   // the mouse left the window: it stops watching it and settles
    on(window, "scroll", () => { if (V.on && performance.now() - V.scanAt > 150) V.dirty = true; }, { passive: true });
    on(window, "resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (V.on) { sizeLayer(); P.seeded = false; draw(); } }, 120); });
  }
  function unlisten() { listening = false; subs.splice(0).forEach((f) => f()); clearTimeout(rz); }
  const ctl = {
    /** The scene: idle | listening | working | calm. */
    state(s) {
      if (!STATES.includes(s)) throw new TypeError("VenomKit state must be one of " + STATES.join(", "));
      const was = V.state;
      V.state = s;
      V.view = s === "working" ? "working" : s === "calm" ? "result" : "start";
      if (s === "listening" && was !== "listening") { MIC.state = "recording"; MIC.t0 = performance.now(); V.lvl = V.lvlT = 0; }
      else if (s !== "listening" && MIC.state === "recording") { MIC.state = "drop"; MIC.t0 = performance.now(); }
      V.dirty = true;
      if (V.on) requestAnimationFrame(draw);
      return s;
    },
    /** The cost level: full (as designed) | cheap (12 fps, a notch smaller, no glints or hair) | still (one frame, then stop). */
    setMode(m) {
      if (!MODES.includes(m)) throw new TypeError("VenomKit mode must be one of " + MODES.join(", "));
      V.mode = m; L.lean = m === "cheap"; V.dirty = true;
      if (V.on) { cancelAnimationFrame(V.raf); V.raf = 0; if (m !== "still") L.cheap = m === "cheap" || V.view === "working"; sizeLayer(); draw(); }
      return m;
    },
    /** Hide the canvases and stop every frame, timer and listener (false), or bring it back in the last mode (true). */
    enable(flag) {
      flag = flag !== false;
      if (V.dead || flag === V.on) return flag;
      if (!flag) {
        V.on = false; cancelAnimationFrame(V.raf); V.raf = 0; unlisten();
        L.layer.style.display = "none"; if (F.film) F.film.style.display = "none";
        return false;
      }
      V.on = true; L.layer.style.display = ""; if (F.film) F.film.style.display = "";
      listen(); V.dirty = true;
      start();
      requestAnimationFrame(() => { if (V.on) { sizeLayer(); scan(); draw(); } });
      return true;
    },
    pause() { return ctl.enable(false); },
    resume() { return ctl.enable(true); },
    /** Voice or any activity level, 0..1. */
    level(v) { V.lvlT = Math.max(0, Math.min(1, +v || 0)); },
    /** Optional: the page's own pointer position (viewport pixels). The kit already follows the mouse and touch. */
    pointer(x, y) { V.ptr = { x: (x - L.ax) * L.S, y: (y - L.ay) * L.S, t: now() }; },
    /** show: false hides it; x, y: where the top eye pair sits (viewport px); scale: 1 = fitted. */
    creature(o = {}) {
      if (o.show != null && !!o.show === V.backdrop) { V.backdrop = !o.show; P.seeded = false; }
      if ("x" in o) V.cx = o.x == null ? null : +o.x;
      if ("y" in o) V.cy = o.y == null ? null : +o.y;
      if (o.scale != null) V.cs = Math.max(0.2, Math.min(4, +o.scale || 1));
      V.dirty = true; if (V.on) requestAnimationFrame(draw);
      return { show: !V.backdrop, x: V.cx, y: V.cy, scale: V.cs };
    },
    /** Live look tuning (v.tune({ K: 6, Gloss: 1.2, Fog: 1, Red: 1, Th: 0.22 })). */
    tune(o) { Object.assign(G.tune, o || {}); V.dirty = true; return { ...G.tune, gl: G.on }; },
    /** Re-measure the marked elements now (also automatic on resize and scroll). */
    refresh() { V.dirty = true; if (V.on) requestAnimationFrame(draw); },
    /** Rolling numbers: average draw ms of the last frames, fps, renderer, the budget guard's notch, desk (true when the stage and panel are on). */
    stats() {
      const ms = V.stats.ms.slice(-60), gaps = V.stats.gaps.slice(-60), avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
      const g = avg(gaps);
      return { avgMs: +avg(ms).toFixed(2), fps: g ? +(1000 / g).toFixed(1) : 0, renderer: G.on ? "webgl" : "2d", notch: V.q, frames: V.stats.frames,
        busyPct: +(avg(ms) * (g ? 1000 / g : 0) / 10).toFixed(1), simMs: +V.simMs.toFixed(2), passMs: +V.passMs.toFixed(2), guard: V.guard, mode: V.mode, state: V.state, enabled: V.on, desk: !!(R.desk && R.panel), canvas: L.cv ? [L.cv.width, L.cv.height] : [0, 0] };
    },
    /** Remove the canvases, listeners, timers and the GL context. */
    destroy() {
      if (V.dead) return;
      ctl.enable(false); V.dead = true;
      const lose = G.gl?.getExtension("WEBGL_lose_context"); G.on = false; lose?.loseContext();
      L.layer.remove(); F.film?.remove(); if (F.gap) document.documentElement.style.removeProperty("--vk-hint-gap"); if (L.hostPos != null) host.style.position = L.hostPos;
    },
  };

  // ============================================================================================ mount: the layer
  const LAYER_CSS = `
.vk-layer { contain: layout paint; }
.vk-layer .vk-fog { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.vk-layer .vk-fog i { position: absolute; left: -30%; top: -30%; width: 160%; height: 160%; will-change: transform; }
.vk-layer .vk-fog i:first-child { background: radial-gradient(38% 24% at 30% 34%, rgba(165,165,165,.4), transparent 70%), radial-gradient(34% 24% at 74% 52%, rgba(175,175,175,.42), transparent 70%),
  radial-gradient(46% 30% at 50% 24%, rgba(100,100,100,.3), transparent 72%), radial-gradient(34% 26% at 22% 70%, rgba(110,110,110,.2), transparent 70%); animation: vk-fog-a 46s ease-in-out infinite alternate; }
.vk-layer .vk-fog i:last-child { background: radial-gradient(26% 18% at 64% 30%, rgba(170,170,170,.2), transparent 70%), radial-gradient(32% 20% at 30% 50%, rgba(160,160,160,.36), transparent 70%),
  radial-gradient(28% 22% at 80% 76%, rgba(100,100,100,.2), transparent 70%); animation: vk-fog-b 63s ease-in-out infinite alternate; }
@keyframes vk-fog-a { from { transform: translate3d(-4%,-2%,0) rotate(-3deg) scale(1); } to { transform: translate3d(5%,3%,0) rotate(4deg) scale(1.08); } }
@keyframes vk-fog-b { from { transform: translate3d(6%,2%,0) rotate(5deg) scale(1.05); } to { transform: translate3d(-5%,-3%,0) rotate(-4deg) scale(.97); } }
.vk-layer .vk-vignette { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(130% 95% at 50% 45%, transparent 60%, rgba(0,0,0,.45) 85%, rgba(0,0,0,.85) 100%); }
.vk-layer[data-vk-gl] :is(.vk-fog, .vk-vignette) { display: none; }
.vk-film { position: fixed; inset: -60px; pointer-events: none; opacity: .4; animation: vk-grain 1s steps(2) infinite;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.95' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 .22 0 0 0 -.07'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E") 0 0 / 180px 180px; }
@keyframes vk-grain { 50% { transform: translate3d(37px, 41px, 0); } }
@media (prefers-reduced-motion: reduce) { .vk-layer .vk-fog i, .vk-film { animation: none !important; } }`;
  function build() {
    if (!document.getElementById("vk-layer-style")) {
      const st = document.createElement("style"); st.id = "vk-layer-style"; st.textContent = LAYER_CSS; document.head.append(st);
    }
    L.fixed = host === document.body || host === document.documentElement;
    if (!L.fixed && getComputedStyle(host).position === "static") { L.hostPos = host.style.position; host.style.position = "relative"; }
    const layer = document.createElement("div");
    layer.className = "vk-layer"; layer.setAttribute("aria-hidden", "true");
    Object.assign(layer.style, { position: L.fixed ? "fixed" : "absolute", inset: "0", zIndex: "0", pointerEvents: "none", overflow: "hidden", background: "#000" });
    const fog = document.createElement("div"); fog.className = "vk-fog"; fog.append(document.createElement("i"), document.createElement("i"));
    const base = fill(document.createElement("canvas")); base.className = "vk-canvas vk-base";
    const vig = document.createElement("div"); vig.className = "vk-vignette";
    layer.append(fog, base, vig);
    host.prepend(layer);
    L.layer = layer; L.base = base;
    if (opt.film) {
      F.film = document.createElement("div"); F.film.className = "vk-film"; F.film.setAttribute("aria-hidden", "true");
      F.film.style.zIndex = "31"; host.append(F.film);
    }
  }
  build();
  ctl.setMode(MODES.includes(opt.mode) ? opt.mode : "full");
  V.mode = MODES.includes(opt.mode) ? opt.mode : "full";
  if (opt.enabled !== false) ctl.enable(true); else L.layer.style.display = "none", F.film && (F.film.style.display = "none");
  return ctl;
}

const api = {
  version: VERSION, roles: ROLES, states: STATES, modes: MODES,
  /** VenomKit.mount(host?, options?) -> controller */
  mount(host, options) {
    if (typeof document === "undefined") throw new Error("VenomKit.mount needs a browser document");
    if (host && !host.nodeType) { options = host; host = null; }
    return createEngine(host || document.body, options);
  },
};
const root = typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this;
if (typeof module === "object" && module && module.exports) module.exports = api;
if (root) root.VenomKit = api;

})();
