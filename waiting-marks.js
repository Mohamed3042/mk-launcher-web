// The owner's marks on the Waiting board, with no DOM: what state each slip shows (the PC's word, or a mark made on
// this device that the PC has not taken yet), which slips have rested long enough to go, the quiet counts, and the
// queue of marks waiting for the PC. A mark holds a slip id and a state, never the slip's text.
// Tested with node --test (tests/web/waiting-marks.test.mjs).

export const STATES = ["open", "done", "cancelled"];
const ms = (t) => (!t ? 0 : t < 2e10 ? t * 1000 : t); // the PC speaks in seconds, this device in milliseconds
export function dayStart(now = Date.now()) { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); }

// A new mark replaces any older one for the same slip: the last thing he did is what he meant.
export function addMark(marks, id, state, now = Date.now()) {
  if (!id || !STATES.includes(state)) return marks;
  return [...(marks || []).filter((m) => m.id !== id), { id, state, at: now }];
}

// The slips as the page draws them: each with its state and when it was marked; a slip marked before today has
// rested long enough and goes.
export function effective(items, marks, now = Date.now()) {
  const byId = new Map((marks || []).map((m) => [m.id, m]));
  const cut = dayStart(now);
  const out = [];
  for (const it of Array.isArray(items) ? items : []) {
    const m = byId.get(it?.id);
    const state = m ? m.state : STATES.includes(it?.state) ? it.state : "open";
    const at = m ? m.at : ms(it?.marked_at);
    if (state !== "open" && at && at < cut) continue;
    out.push({ ...it, state, ...(state !== "open" ? { marked_at: at } : {}) });
  }
  return out;
}

// "3 done today", "1 dropped": what the page counts.
export function tally(items) {
  const n = { done: 0, cancelled: 0, open: 0 };
  for (const it of items || []) n[it.state] = (n[it.state] || 0) + 1;
  return n;
}

// Marks this device still has to deliver.
export const pending = (marks) => (marks || []).filter((m) => !m.sent).length;

// Where a mark goes: done and cancel have their own routes; lifting a mark is either route with undo.
export function route(m) {
  if (m.state === "open") return { path: "/api/waiting/done", body: { id: m.id, undo: true } };
  return { path: m.state === "done" ? "/api/waiting/done" : "/api/waiting/cancel", body: { id: m.id } };
}

// After the board is read again: a mark the PC's board already shows is done with; a slip the board no longer has
// takes its mark with it; a mark delivered from the Backup waits until a snapshot newer than its delivery.
export function prune(marks, board) {
  const items = new Map((Array.isArray(board?.items) ? board.items : []).map((it) => [it.id, it]));
  const boardAt = ms(board?.updated);
  return (marks || []).filter((m) => {
    const it = items.get(m.id);
    if (!it) return false;
    if ((STATES.includes(it.state) ? it.state : "open") === m.state && (!m.sent || boardAt >= m.sentAt)) return false;
    if (m.sent && boardAt >= m.sentAt + 1000) return false; // the PC has spoken since: its word stands
    return true;
  });
}

// What one delivery answer means for the queue: "keep" (try again later), "drop" (the PC no longer has that slip,
// or already took it), "sent" (the Backup delivered it; keep showing it until a newer snapshot).
export function outcome(status) {
  if (status >= 200 && status < 300) return "sent";
  if (status === 404 || status === 400) return "drop";
  return "keep";
}

// Keep the queue small and well-formed whatever the device had stored.
export function clean(stored) {
  return (Array.isArray(stored) ? stored : [])
    .filter((m) => m && typeof m.id === "string" && m.id.length < 40 && STATES.includes(m.state) && Number.isFinite(m.at))
    .map((m) => ({ id: m.id, state: m.state, at: m.at, ...(m.sent ? { sent: true, sentAt: Number(m.sentAt) || m.at } : {}) }))
    .slice(-60);
}
