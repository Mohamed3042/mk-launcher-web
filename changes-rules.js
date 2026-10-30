// The Changes timeline's rules, kept apart from the page so they can be tested.
import { NEWS_REPO, SNAPSHOT_REPO } from "./backup-rules.js";

// Agent memory and the launcher's own backups (the snapshot and news commit every few minutes, the shell copy
// follows each launcher update) are never a change to one of his apps.
const MACHINE_REPOS = new Set([SNAPSHOT_REPO, NEWS_REPO, "mk-launcher-web"]);
export function isWork(repoName = "") {
  return !/brain$/i.test(repoName) && !MACHINE_REPOS.has(repoName);
}

// One day of the timeline: pictures and each app's updates in one list, newest first, cut into runs of one kind
// (a picture grid, an updates list, ...). Pictures used to sit above every update of the day, however old.
export function dayRuns(pictures = [], groups = []) {
  const entries = [
    ...pictures.map((c) => ({ kind: "pictures", t: c.t * 1000 || 0, item: c })),
    ...groups.map((list) => ({ kind: "updates", t: Math.max(0, ...list.map((c) => Date.parse(c.date) || 0)), item: list })),
  ].sort((a, b) => b.t - a.t);
  const runs = [];
  for (const e of entries) {
    const last = runs[runs.length - 1];
    if (last && last.kind === e.kind) last.items.push(e.item);
    else runs.push({ kind: e.kind, items: [e.item] });
  }
  return runs;
}
