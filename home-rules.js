// Home's rules without a DOM: Recent activity, newest first, from the apps' checks and the times one went down or
// came back (the PC's history), the apps he opened and the plans that changed. Every status is a shape and a word.
const ms = (t) => (t < 2e10 ? t * 1000 : t);

export function activity({ byId = {}, checked = 0, counts = null, changes = [], recents = [], plans = [], backup = false } = {}, now = Date.now(), max = 3) {
  const rows = [];
  if (checked && counts?.total) {
    const how = counts.down ? `${counts.down} stopped` : "all running";
    rows.push({ kind: "check", t: ms(checked), shape: counts.down ? "down" : "up", name: `${counts.total} apps`,
      word: `${backup ? "last checked" : "checked"} · ${how}`, href: "#/pc" });
  }
  for (const c of changes || []) {
    const app = byId[c.app];
    if (!app || !["up", "down"].includes(c.state)) continue;
    const site = app.type === "site";
    const word = c.state === "up" ? (site ? "back online" : "running again") : (site ? "unreachable" : "stopped");
    rows.push({ kind: "change", t: ms(c.t), shape: c.state, name: app.name, word, app: app.id });
  }
  let opened = 0;
  for (const r of recents || []) {
    const app = byId[r.id];
    if (!app || opened >= 5) continue;
    opened++;
    rows.push({ kind: "opened", t: ms(r.at), shape: "neutral", name: app.name, word: "opened", app: app.id });
  }
  for (const p of plans || []) {
    if (!p?.changed_at || !p.title) continue;
    rows.push({ kind: "plan", t: ms(p.changed_at), shape: "plan", name: p.title, word: "updated", href: `#/plans/${encodeURIComponent(p.id)}`, color: p.accent });
  }
  return rows.filter((r) => r.t && r.t <= now + 60e3).sort((a, b) => b.t - a.t).slice(0, max);
}
