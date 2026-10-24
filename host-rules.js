// Opening apps inside the launcher: the pure rules (no DOM), so node can test them.
// An app opens "inside" (a full-screen layer with a Back to Launcher pill) only when the registry marks it
// framable (`open: "inside"`) and the launcher runs live on the PC; everything else keeps the browser sheet.

export const CORNERS = ["tl", "tr", "bl", "br"];
export const DEFAULT_CORNER = "tr"; // most of our apps keep their own tabs at the bottom and menus top-left
const PREF = "mkl.openInside";
const PILL = "mkl.hostPill";

// "inside" | "sheet". `phone` is a touch-first screen; on a computer it is an opt-in (`pref` true).
export function openMode(app, { backup = false, phone = false, pref = null } = {}) {
  if (!app || backup || app.open !== "inside") return "sheet";
  const on = typeof pref === "boolean" ? pref : phone;
  return on ? "inside" : "sheet";
}

// The per-device switch: null = the default (on for phones, off for computers).
export function readPref(storage) {
  try {
    const v = storage?.getItem(PREF);
    return v === "true" ? true : v === "false" ? false : null;
  } catch { return null; }
}
export function writePref(storage, on) {
  try { storage.setItem(PREF, on ? "true" : "false"); return true; } catch { return false; }
}

export function cleanCorner(v) { return CORNERS.includes(v) ? v : DEFAULT_CORNER; }
export function readCorner(storage) {
  try { return cleanCorner(storage?.getItem(PILL)); } catch { return DEFAULT_CORNER; }
}
export function writeCorner(storage, corner) {
  try { storage.setItem(PILL, cleanCorner(corner)); return true; } catch { return false; }
}

// Where a dragged pill lands: the corner nearest its centre.
export function nearestCorner(x, y, width, height) {
  return `${y < height / 2 ? "t" : "b"}${x < width / 2 ? "l" : "r"}`;
}

// A press on the pill: a tap goes back, a hold opens the menu, a move drags it.
export const HOLD_MS = 480;
export const DRAG_PX = 8;
export function pressKind({ dx = 0, dy = 0, ms = 0 }) {
  if (Math.hypot(dx, dy) > DRAG_PX) return "drag";
  return ms >= HOLD_MS ? "hold" : "tap";
}

// "Open in Safari" from a home-screen app: iOS 17+ hands x-safari-https:// links to Safari itself.
export function safariUrl(url, { ios = false } = {}) {
  if (!ios || !/^https?:\/\//i.test(url)) return url;
  return `x-safari-${url}`;
}

// One app layer at a time; the last app stays loaded (warm) after Back, so going back to it is instant.
export function createLayer() {
  const s = { open: false, id: null, url: null };
  return {
    get state() { return { ...s }; },
    // what the page must do to show `app`: load a fresh frame, or just show the warm one
    open(app) {
      const warm = s.id === app.id && s.url === app.url;
      s.open = true; s.id = app.id; s.url = app.url;
      return { load: !warm, url: app.url, id: app.id };
    },
    // Back: hide the layer, keep the app warm
    close() {
      const was = s.open;
      s.open = false;
      return { hide: was };
    },
    // Close app: hide and unload it (stops its audio, frees memory)
    drop() {
      const had = s.id;
      s.open = false; s.id = null; s.url = null;
      return { unload: !!had };
    },
  };
}
