// Plans' rules, with no DOM: the words for each state, the sync line, the progress ring, the cost bars and
// plan search. The plan data and its words come from the server (core/plans.py); the defaults below only
// cover a copy cached before the words were sent. Tested with node --test (tests/web/plans.test.mjs).

export const WORDS = {
  status: { live: "Live", built: "Built, waiting", "not-built": "Not built", "needs-you": "Needs you", conflict: "Conflict" },
  status_order: ["needs-you", "built", "not-built", "conflict", "live"],
  stop: { done: "Done", now: "Doing now", you: "Waits on you", later: "Later" },
  who: { you: "You", me: "Me", both: "You + me" },
  decision: { settled: "Settled", open: "Open" },
};
export const words = (data) => ({ ...WORDS, ...(data?.words || {}) });
// "12 need you", "1 needs you", "2 conflicts": the totals beside the progress ring.
export function countWord(status, n) {
  const one = n === 1;
  return { "needs-you": one ? "needs you" : "need you", built: "built, waiting", "not-built": "not built",
    conflict: one ? "conflict" : "conflicts", live: "live" }[status] || status;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function longDate(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(iso || "");
}
export function shortDate(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : String(iso || "");
}

// "just now", "4 min ago", "3 h ago", "2 d ago", then the date. Times are seconds or milliseconds.
export function since(t, now = Date.now()) {
  if (!t) return "never";
  const ms = t < 2e10 ? t * 1000 : t;
  const s = Math.max(0, (now - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export function clock(t) {
  const d = new Date(t < 2e10 ? t * 1000 : t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Where the plan came from and how fresh it is: {text, tone, title}. tone: ok, local, wait, warn, bad, off.
export function syncLine(sync, entry, now = Date.now()) {
  const s = sync || {};
  if (s.source === "local") {
    if (s.state === "error") return { text: "This Mac's plans folder can't be read", tone: "bad", title: s.detail || "" };
    return { text: `From this Mac's copy · changed ${since(entry?.changed_at, now)}`, tone: "local", title: s.folder ? `Folder: ${s.folder}` : "" };
  }
  if (s.source === "off" || s.state === "off") return { text: "Plans sync is off on the PC", tone: "off", title: s.detail || "" };
  const at = s.synced_at;
  if (s.state === "offline") {
    return at ? { text: `GitHub can't be reached · synced ${since(at, now)}`, tone: "warn", title: `Last synced at ${clock(at)}. ${s.detail || ""}`.trim() }
      : { text: "GitHub can't be reached yet", tone: "warn", title: s.detail || "" };
  }
  if (s.state === "error") {
    return at ? { text: `Sync failed · showing the copy from ${since(at, now)}`, tone: "bad", title: s.detail || "" }
      : { text: "Plans couldn't sync from GitHub", tone: "bad", title: s.detail || "" };
  }
  if (!at) return { text: "Syncing from GitHub…", tone: "wait", title: "" };
  // a sync that stopped answering for over three rounds is not "synced" any more: say how old it is, calmly
  const late = s.every && (now - at * 1000) > s.every * 1000 * 3 + 60e3;
  return { text: `Synced from GitHub · ${since(at, now)}`, tone: late ? "warn" : "ok", title: s.head ? `GitHub ${s.head} · checked ${since(s.checked_at || at, now)}` : "" };
}

// The progress ring: a circle of radius r, one arc for the stops done, a dimmer one for the stops being done now.
export function ring(done, now, total, r = 52) {
  const c = 2 * Math.PI * r;
  if (!total) return { c, done: 0, now: 0, nowOffset: 0 };
  const d = (Math.min(done, total) / total) * c;
  const n = (Math.min(now, total - Math.min(done, total)) / total) * c;
  return { c, done: d, now: n, nowOffset: -d };
}

// Cost bars: each stage stacks its segments at their middle value; the same label keeps one colour everywhere.
export function costBars(costs, palette = 8) {
  const stages = costs?.stages || [];
  const colour = new Map();
  for (const st of stages) for (const g of st.segments || []) if (!g.extra && !colour.has(g.label)) colour.set(g.label, colour.size % palette);
  const mid = (g) => (Number(g.low) + Number(g.high)) / 2;
  const sums = stages.map((st) => (st.segments || []).reduce((a, g) => a + mid(g), 0));
  const max = Math.max(1, ...sums);
  const rows = stages.map((st, i) => {
    let at = 0;
    const segs = (st.segments || []).map((g) => {
      const v = mid(g);
      const seg = { label: g.label, low: g.low, high: g.high, note: g.note || "", extra: !!g.extra, value: v,
        colour: g.extra ? -1 : colour.get(g.label), from: (at / max) * 100, pct: (v / max) * 100 };
      at += v;
      return seg;
    });
    return { id: st.id, label: st.label, total: st.total, sum: sums[i], segs, tiny: sums[i] / max < 0.03 };
  });
  const legend = [...colour.entries()].map(([label, i]) => ({ label, colour: i }));
  if (stages.some((st) => (st.segments || []).some((g) => g.extra))) legend.push({ label: stages.flatMap((st) => st.segments || []).find((g) => g.extra).label, colour: -1 });
  return { max, rows, legend };
}
export function money(low, high, currency = "USD") {
  const f = (v) => (Number.isInteger(Number(v)) ? String(v) : Number(v).toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
  const sign = currency === "USD" ? "$" : "";
  const tail = sign ? "" : ` ${currency}`;
  return low === high ? `${sign}${f(low)}${tail}` : `${sign}${f(low)}–${f(high)}${tail}`;
}

// Which plan the page shows: the one in the address, else the only one, else none (the list of plans).
export function pick(plans, id) {
  const list = plans || [];
  if (id) return list.find((p) => p.id === id) || null;
  return list.length === 1 ? list[0] : null;
}

// Every part of every plan, for the launcher's search.
export function searchParts(plans, q) {
  q = String(q || "").trim().toLowerCase();
  if (!q) return [];
  const score = (text) => {
    text = String(text || "").toLowerCase();
    if (!text) return 0;
    if (text.startsWith(q)) return 3;
    if (text.split(/[\s\-·/,]+/).some((w) => w.startsWith(q))) return 2;
    return text.includes(q) ? 1 : 0;
  };
  const out = [];
  for (const entry of plans || []) {
    const plan = entry.plan;
    if (!plan) continue;
    for (const layer of plan.layers || []) {
      for (const part of layer.parts || []) {
        const s = Math.max(score(part.title) * 2, score(part.summary) * 0.6, score(layer.name) * 0.5,
          ...(part.missing || []).map((m) => score(m) * 0.4));
        if (s) out.push({ kind: "part", s: s + (part.status === "needs-you" ? 0.5 : 0), plan: entry.id, planTitle: plan.title, layer: layer.name, part });
      }
    }
  }
  return out.sort((a, b) => b.s - a.s).slice(0, 12);
}

// The parts of one stop, in plan order, and the stop each part sits on.
export function partsOfStop(plan, n) {
  return (plan?.layers || []).flatMap((l) => (l.parts || []).filter((p) => p.stop === n).map((p) => ({ part: p, layer: l })));
}
export function findPart(plan, id) {
  for (const layer of plan?.layers || []) for (const part of layer.parts || []) if (part.id === id) return { part, layer };
  return null;
}
