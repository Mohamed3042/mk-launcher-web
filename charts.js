// Small SVG charts drawn at the container's real width, with hover tooltips.
// Marks follow the dataviz spec: thin bars with 4px rounded data ends, 2px lines,
// 10% area wash, hairline grid, text in ink tokens (never the series color).

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let tipEl;
function tooltip() {
  if (!tipEl) {
    tipEl = document.createElement("div");
    tipEl.className = "tooltip";
    tipEl.setAttribute("role", "tooltip");
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

function showTip(html, x, y) {
  const t = tooltip();
  t.innerHTML = html;
  const w = t.offsetWidth || 160;
  const h = t.offsetHeight || 60;
  let left = x + 14;
  let top = y - h - 12;
  if (left + w > window.innerWidth - 8) left = x - w - 14;
  if (top < 8) top = y + 16;
  t.style.left = `${Math.max(8, left)}px`;
  t.style.top = `${top}px`;
  t.classList.add("on");
}
export function hideTip() {
  tipEl?.classList.remove("on");
}
// The tooltip lives on <body>, outside every chart, and a touch rarely ends with pointerleave: it turns into a
// scroll (pointercancel), or the chart is redrawn or left for another tab. So anything that moves the page, leaves
// it or touches somewhere else hides it; a tapped mark keeps its tooltip until then.
for (const type of ["scroll", "resize", "hashchange", "blur"]) addEventListener(type, hideTip, { capture: true, passive: true });
document.addEventListener("visibilitychange", hideTip);
document.addEventListener("pointerdown", (e) => { if (!e.target.closest?.("[data-tip], svg[data-line]")) hideTip(); }, { capture: true, passive: true });

// tip text: first line bold title, later lines "label|value|color"
function tipHtml(text) {
  const [title, ...rows] = String(text).split("\n");
  return `<b>${esc(title)}</b>` + rows.map((r) => {
    const [l, v, c] = r.split("|");
    return `<div class="tr"><span>${c ? `<i style="background:${esc(c)}"></i> ` : ""}${esc(l)}</span><span>${esc(v ?? "")}</span></div>`;
  }).join("");
}

function bindTips(el) {
  if (el._tipsBound) return;
  el._tipsBound = true;
  el.addEventListener("pointermove", (e) => {
    const hit = e.target.closest("[data-tip]");
    if (hit) showTip(tipHtml(hit.getAttribute("data-tip")), e.clientX, e.clientY);
    else if (!e.target.closest("[data-line]")) hideTip();
  });
  el.addEventListener("pointerleave", hideTip);
  el.addEventListener("pointercancel", hideTip);
}

const ro = new ResizeObserver((entries) => {
  for (const e of entries) {
    const el = e.target;
    const w = Math.round(e.contentRect.width);
    if (w && w !== el._w) {
      el._w = w;
      el._draw?.(w);
    }
  }
});

function mount(el, draw) {
  el._draw = (w) => {
    el.innerHTML = draw(w);
    bindTips(el);
    el._after?.(w);
  };
  ro.observe(el);
  const w = Math.round(el.getBoundingClientRect().width);
  if (w) { el._w = w; el._draw(w); }
}

export function compact(n) {
  if (n == null || Number.isNaN(n)) return "–";
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`;
  return `${Math.round(n * 10) / 10}`;
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

// Column path: square at the baseline, 4px rounded data end.
function colPath(x, y, w, h, up = true) {
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  if (up) return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  return `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`;
}
function barPath(x, y, w, h) { // horizontal: square at the left baseline, rounded right end
  if (w <= 0) return "";
  const r = Math.min(4, h / 2, w);
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
}

function tickCount(max) {
  for (const n of [4, 5, 2, 3]) {
    const step = max / n;
    const p = 10 ** Math.floor(Math.log10(step));
    if ([1, 2, 2.5, 5, 10].some((m) => Math.abs(step - m * p) < 1e-9 * max)) return n;
  }
  return 4;
}

function yAxis(max, top, bottom, left, width, ticks = 0, fmt = compact) {
  ticks = ticks || tickCount(max);
  let out = '<g class="grid">';
  let lbl = '<g class="axis">';
  for (let i = 0; i <= ticks; i++) {
    const v = (max / ticks) * i;
    const y = bottom - ((bottom - top) / ticks) * i;
    out += `<line x1="${left}" x2="${width}" y1="${y}" y2="${y}"/>`;
    lbl += `<text x="${left - 6}" y="${y + 3}" text-anchor="end">${esc(fmt(v))}</text>`;
  }
  return out + "</g>" + lbl + "</g>";
}

/** Single-series columns. data: [{label, value, tip?, color?}] */
export function columns(el, { data, height = 150, color = "var(--s1)", fmt = compact, every = 0 }) {
  mount(el, (W) => {
    const left = 30, top = 8, bottom = height - 20;
    const max = niceMax(Math.max(1, ...data.map((d) => d.value)));
    const band = (W - left) / Math.max(1, data.length);
    const bw = Math.min(24, Math.max(2, band - 2));
    const step = every || Math.ceil(data.length / Math.max(2, Math.floor((W - left) / 56)));
    let s = `<svg class="chart" viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" role="img">`;
    s += yAxis(max, top, bottom, left, W, 0, fmt);
    data.forEach((d, i) => {
      const h = ((bottom - top) * d.value) / max;
      const x = left + i * band + (band - bw) / 2;
      s += `<path d="${colPath(x, bottom - h, bw, h)}" fill="${d.color || color}"/>`;
      s += `<rect class="hit" x="${left + i * band}" y="${top}" width="${band}" height="${bottom - top}" data-tip="${esc(d.tip || `${d.label}\nValue|${fmt(d.value)}`)}"/>`;
      if (i % step === 0) s += `<g class="axis"><text x="${left + i * band + band / 2}" y="${height - 4}" text-anchor="middle">${esc(d.label)}</text></g>`;
    });
    return s + "</svg>";
  });
}

/** Stacked columns. cats: labels; series: [{name, color, values[]}] */
export function stacked(el, { cats, series, height = 170, fmt = compact, tipTitle = (c) => c }) {
  mount(el, (W) => {
    const left = 30, top = 8, bottom = height - 20;
    const totals = cats.map((_, i) => series.reduce((a, s) => a + (s.values[i] || 0), 0));
    const max = niceMax(Math.max(1, ...totals));
    const band = (W - left) / Math.max(1, cats.length);
    const bw = Math.min(24, Math.max(2, band - 2));
    const step = Math.ceil(cats.length / Math.max(2, Math.floor((W - left) / 56)));
    let s = `<svg class="chart" viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" role="img">`;
    s += yAxis(max, top, bottom, left, W, 0, fmt);
    cats.forEach((c, i) => {
      const x = left + i * band + (band - bw) / 2;
      let y = bottom;
      const parts = series.map((sr) => ({ sr, v: sr.values[i] || 0 })).filter((p) => p.v > 0);
      parts.forEach((p, j) => {
        const h = ((bottom - top) * p.v) / max;
        const gap = j > 0 ? 2 : 0;
        const isTop = j === parts.length - 1;
        const hh = Math.max(0, h - gap);
        s += isTop ? `<path d="${colPath(x, y - h, bw, hh)}" fill="${p.sr.color}"/>`
          : `<rect x="${x}" y="${y - h}" width="${bw}" height="${hh}" fill="${p.sr.color}"/>`;
        y -= h;
      });
      const tip = [tipTitle(c), ...series.filter((sr) => sr.values[i]).map((sr) => `${sr.name}|${fmt(sr.values[i])}|${sr.color}`), `Total|${fmt(totals[i])}`].join("\n");
      s += `<rect class="hit" x="${left + i * band}" y="${top}" width="${band}" height="${bottom - top}" data-tip="${esc(tip)}"/>`;
      if (i % step === 0) s += `<g class="axis"><text x="${left + i * band + band / 2}" y="${height - 4}" text-anchor="middle">${esc(c)}</text></g>`;
    });
    return s + "</svg>";
  });
}

/** Horizontal bars with the label on the left and the value at the tip. */
export function hbars(el, { data, fmt = compact, color = "var(--s1)", row = 26, labelW = 0 }) {
  mount(el, (W) => {
    const lw = labelW || Math.min(170, Math.max(90, W * 0.36));
    const max = Math.max(1, ...data.map((d) => d.value));
    const h = data.length * row + 4;
    let s = `<svg class="chart" viewBox="0 0 ${W} ${h}" width="${W}" height="${h}" role="img">`;
    data.forEach((d, i) => {
      const y = i * row + 4;
      const bw = ((W - lw - 46) * d.value) / max;
      const label = d.label.length > 24 ? d.label.slice(0, 23) + "…" : d.label;
      s += `<text class="lbl" x="${lw - 8}" y="${y + row / 2 + 1}" text-anchor="end" dominant-baseline="middle">${esc(label)}</text>`;
      s += `<path d="${barPath(lw, y + 4, Math.max(2, bw), row - 10)}" fill="${d.color || color}"/>`;
      s += `<text class="val" x="${lw + Math.max(2, bw) + 6}" y="${y + row / 2 + 1}" dominant-baseline="middle">${esc(fmt(d.value))}</text>`;
      s += `<rect class="hit" x="0" y="${y}" width="${W}" height="${row}" data-tip="${esc(d.tip || `${d.label}\nValue|${fmt(d.value)}`)}"/>`;
    });
    return s + "</svg>";
  });
}

/** Line with a 10% area wash and a crosshair tooltip. points: [{t (ms), v}] */
export function area(el, { points, height = 150, color = "var(--s1)", fmt = compact, tFmt, label = "Value" }) {
  const pts = points.filter((p) => p.v != null);
  mount(el, (W) => {
    const left = 34, top = 10, bottom = height - 20, right = W - 6;
    if (pts.length < 2) return `<p class="sub">Not enough data yet. It fills in as the launcher keeps checking.</p>`;
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
    const max = niceMax(Math.max(1, ...pts.map((p) => p.v)));
    const X = (t) => left + ((right - left) * (t - t0)) / Math.max(1, t1 - t0);
    const Y = (v) => bottom - ((bottom - top) * v) / max;
    let line = "";
    let prevT = null;
    const gapMs = (t1 - t0) / Math.max(8, pts.length) * 4;
    pts.forEach((p) => {
      line += `${prevT == null || p.t - prevT > gapMs ? "M" : "L"}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`;
      prevT = p.t;
    });
    const areaPath = `M${X(pts[0].t)},${bottom}` + pts.map((p) => `L${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join("") + `L${X(t1)},${bottom}Z`;
    let s = `<svg class="chart" viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" role="img" data-line="1">`;
    s += yAxis(max, top, bottom, left, right, 0, fmt);
    s += `<path d="${areaPath}" fill="${color}" opacity="0.10"/>`;
    s += `<path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    const lastP = pts[pts.length - 1];
    s += `<circle cx="${X(lastP.t)}" cy="${Y(lastP.v)}" r="4" fill="${color}" stroke="var(--panel)" stroke-width="2"/>`;
    const ticks = 4;
    s += '<g class="axis">';
    for (let i = 0; i <= ticks; i++) {
      const t = t0 + ((t1 - t0) * i) / ticks;
      s += `<text x="${X(t)}" y="${height - 4}" text-anchor="${i === 0 ? "start" : i === ticks ? "end" : "middle"}">${esc(tFmt ? tFmt(t) : "")}</text>`;
    }
    s += "</g>";
    s += `<line class="cross" x1="0" x2="0" y1="${top}" y2="${bottom}" opacity="0"/><circle class="dot" r="4" fill="${color}" stroke="var(--panel)" stroke-width="2" opacity="0"/>`;
    s += `<rect class="hit" x="${left}" y="${top}" width="${right - left}" height="${bottom - top}"/>`;
    return s + "</svg>";
  });
  el._after = (W) => {
    const svg = el.querySelector("svg[data-line]");
    if (!svg) return;
    const left = 34, right = W - 6, top = 10, bottom = height - 20;
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
    const max = niceMax(Math.max(1, ...pts.map((p) => p.v)));
    const cross = svg.querySelector(".cross"), dot = svg.querySelector(".dot");
    svg.addEventListener("pointermove", (e) => {
      const r = svg.getBoundingClientRect();
      const x = e.clientX - r.left;
      const t = t0 + ((t1 - t0) * (x - left)) / Math.max(1, right - left);
      let best = pts[0];
      for (const p of pts) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
      const bx = left + ((right - left) * (best.t - t0)) / Math.max(1, t1 - t0);
      const by = bottom - ((bottom - top) * best.v) / max;
      cross.setAttribute("x1", bx); cross.setAttribute("x2", bx); cross.setAttribute("opacity", "1");
      dot.setAttribute("cx", bx); dot.setAttribute("cy", by); dot.setAttribute("opacity", "1");
      showTip(tipHtml(`${tFmt ? tFmt(best.t, true) : ""}\n${label}|${fmt(best.v)}`), e.clientX, e.clientY);
    });
    const off = () => { cross.setAttribute("opacity", "0"); dot.setAttribute("opacity", "0"); hideTip(); };
    svg.addEventListener("pointerleave", off);
    svg.addEventListener("pointercancel", off);
  };
}

/** Uptime strip: one cell per slot. cells: [{t, up: 0..1 | null, tip}] */
export function strip(el, { cells, height = 26 }) {
  mount(el, (W) => {
    const n = Math.max(1, cells.length);
    const cw = W / n;
    let s = `<svg class="chart" viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" role="img">`;
    cells.forEach((c, i) => {
      const color = c.up == null ? "var(--raised)" : c.up >= 0.99 ? "var(--up)" : c.up > 0 ? "var(--starting)" : "var(--down)";
      const w = Math.max(1, cw - (cw > 4 ? 2 : 1));
      s += `<rect x="${i * cw}" y="0" width="${w}" height="${height}" rx="${Math.min(3, w / 2)}" fill="${color}" ${c.up != null && c.up < 0.99 ? "" : 'opacity="0.9"'}/>`;
      s += `<rect class="hit" x="${i * cw}" y="0" width="${cw}" height="${height}" data-tip="${esc(c.tip || "")}"/>`;
    });
    return s + "</svg>";
  });
}

/** Contribution calendar: 7 rows x weeks, sequential blue ramp. */
export function heatmap(el, { days, weeksMax = 53 }) {
  mount(el, (W) => {
    const labelW = 22;
    const weeksFit = Math.max(8, Math.min(weeksMax, Math.floor((W - labelW) / 13)));
    const recent = days.slice(-weeksFit * 7);
    const firstDow = new Date(recent[0]?.date + "T00:00:00").getDay();
    const cells = Array(firstDow).fill(null).concat(recent);
    const weeks = Math.ceil(cells.length / 7);
    const size = Math.min(14, (W - labelW) / weeks - 2);
    const step = size + 2;
    const counts = recent.map((d) => d.count).filter((c) => c > 0).sort((a, b) => a - b);
    const q = (p) => counts[Math.floor((counts.length - 1) * p)] || 1;
    const cuts = [q(0.25), q(0.5), q(0.75)];
    const level = (c) => (c <= 0 ? 0 : c <= cuts[0] ? 1 : c <= cuts[1] ? 2 : c <= cuts[2] ? 3 : 4);
    const h = step * 7 + 18;
    let s = `<svg class="chart" viewBox="0 0 ${W} ${h}" width="${W}" height="${h}" role="img">`;
    s += `<g class="axis"><text x="0" y="${step * 1 + size - 2}">Mon</text><text x="0" y="${step * 3 + size - 2}">Wed</text><text x="0" y="${step * 5 + size - 2}">Fri</text></g>`;
    let lastMonth = -1, lastLabelCol = -9;
    cells.forEach((d, i) => {
      const col = Math.floor(i / 7), row = i % 7;
      if (!d) return;
      const x = labelW + col * step, y = row * step;
      const dt = new Date(d.date + "T00:00:00");
      if (row === 0 && dt.getMonth() !== lastMonth && col < weeks - 1) {
        lastMonth = dt.getMonth();
        if (col - lastLabelCol >= 3) {
          lastLabelCol = col;
          s += `<g class="axis"><text x="${x}" y="${h - 3}">${dt.toLocaleString(undefined, { month: "short" })}</text></g>`;
        }
      }
      s += `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="3" fill="var(--heat-${level(d.count)})" data-tip="${esc(`${dt.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}\nContributions|${d.count}`)}"/>`;
    });
    return s + "</svg>";
  });
}

/** Weekly lines added (up) and removed (down) around a zero line. */
export function diverging(el, { weeks, height = 160 }) {
  mount(el, (W) => {
    const left = 34, top = 8, bottom = height - 20, mid = (top + bottom) / 2;
    const sizes = weeks.map((w) => Math.max(w.add, w.del)).sort((a, b) => b - a);
    const capped = sizes.length > 2 && sizes[0] > 4 * Math.max(1, sizes[1]);
    const max = niceMax(Math.max(1, capped ? sizes[1] * 1.3 : sizes[0]));
    const band = (W - left) / Math.max(1, weeks.length);
    const bw = Math.min(24, Math.max(2, band - 3));
    const half = mid - top;
    const clip = (v) => Math.min(v, max);
    let s = `<svg class="chart" viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" role="img">`;
    s += `<g class="grid"><line x1="${left}" x2="${W}" y1="${top}" y2="${top}"/><line x1="${left}" x2="${W}" y1="${mid}" y2="${mid}" style="stroke:var(--line-strong)"/><line x1="${left}" x2="${W}" y1="${bottom}" y2="${bottom}"/></g>`;
    s += `<g class="axis"><text x="${left - 6}" y="${top + 3}" text-anchor="end">+${compact(max)}</text><text x="${left - 6}" y="${mid + 3}" text-anchor="end">0</text><text x="${left - 6}" y="${bottom + 3}" text-anchor="end">−${compact(max)}</text></g>`;
    const step = Math.ceil(weeks.length / Math.max(2, Math.floor((W - left) / 60)));
    weeks.forEach((w, i) => {
      const x = left + i * band + (band - bw) / 2;
      const ha = (half * clip(w.add)) / max, hd = (half * clip(w.del)) / max;
      s += `<path d="${colPath(x, mid - ha - 1, bw, ha)}" fill="var(--add)"/>`;
      s += `<path d="${colPath(x, mid + 1, bw, hd, false)}" fill="var(--del)"/>`;
      if (w.add > max) s += `<text class="val" x="${x + bw / 2}" y="${top - 2}" text-anchor="middle">+${compact(w.add)} ↑</text>`;
      if (w.del > max) s += `<text class="val" x="${x + bw / 2}" y="${bottom + 11}" text-anchor="middle">−${compact(w.del)} ↓</text>`;
      const d = new Date(w.t * 1000);
      const label = d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
      s += `<rect class="hit" x="${left + i * band}" y="${top}" width="${band}" height="${bottom - top}" data-tip="${esc(`Week of ${label}\nAdded|+${compact(w.add)}|var(--add)\nRemoved|−${compact(w.del)}|var(--del)`)}"/>`;
      if (i % step === 0) s += `<g class="axis"><text x="${left + i * band + band / 2}" y="${height - 4}" text-anchor="middle">${esc(label)}</text></g>`;
    });
    return s + "</svg>";
  });
}

export function table(headers, rows) {
  return `<details><summary>Show as table</summary><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></details>`;
}

/** Grouped horizontal bars (same unit), e.g. input and output price per model. */
export function hbarsGrouped(el, { data, series, fmt = compact, row = 34 }) {
  mount(el, (W) => {
    const lw = Math.min(170, Math.max(96, W * 0.34));
    const max = Math.max(1e-9, ...data.flatMap((d) => d.values));
    const h = data.length * row + 4;
    const barH = Math.max(5, (row - 12 - 2) / series.length);
    let s = `<svg class="chart" viewBox="0 0 ${W} ${h}" width="${W}" height="${h}" role="img">`;
    data.forEach((d, i) => {
      const y = i * row + 4;
      const label = d.label.length > 24 ? d.label.slice(0, 23) + "…" : d.label;
      s += `<text class="lbl" x="${lw - 8}" y="${y + row / 2}" text-anchor="end" dominant-baseline="middle">${esc(label)}</text>`;
      d.values.forEach((v, j) => {
        const by = y + 5 + j * (barH + 2);
        const bw = Math.max(2, ((W - lw - 52) * v) / max);
        s += `<path d="${barPath(lw, by, bw, barH)}" fill="${series[j].color}"/>`;
        s += `<text class="val" x="${lw + bw + 6}" y="${by + barH / 2 + 1}" dominant-baseline="middle">${esc(fmt(v))}</text>`;
      });
      const tip = [d.label, ...series.map((sr, j) => `${sr.name}|${fmt(d.values[j])}|${sr.color}`), ...(d.extra || [])].join("\n");
      s += `<rect class="hit" x="0" y="${y}" width="${W}" height="${row}" data-tip="${esc(tip)}"/>`;
    });
    return s + "</svg>";
  });
}
