// The launcher's look: "ink" (black liquid, the default since 1.14.0) or "classic" (Liquid Glass, unchanged).
// Pure rules only, so Node can test them: which look, how much the liquid may cost on each screen, where the
// creature sits. skin-ink.js does the DOM work.

export const SKINS = ["ink", "classic"];
export const KEY = "mkl.skin";
export const DEFAULT = "ink";

export function readSkin(storage) {
  try {
    const v = JSON.parse(storage?.getItem(KEY) ?? "null");
    return SKINS.includes(v) ? v : DEFAULT;
  } catch { return DEFAULT; }
}
export function writeSkin(storage, v) {
  if (!SKINS.includes(v)) throw new TypeError("skin must be ink or classic");
  try { storage?.setItem(KEY, JSON.stringify(v)); } catch { /* private mode: the look still changes for this visit */ }
  return v;
}

// The launcher is open all day: the liquid is alive only while he is looking and moving, and stops by itself.
export const HOME_FULL_MS = 20_000;   // Home: full motion this long after his last touch, mouse or key
export const HOME_CHEAP_MS = 90_000;  // then 12 fps until this, then one still frame
export const DATA_CHEAP_MS = 10_000;  // data screens: 12 fps briefly after a touch, otherwise still
export const HOME = "home";
export const DARK_ROUTES = ["reels"]; // a full-screen picture covers the page: the liquid is switched off

/** The liquid's cost level for this moment: "full" | "cheap" | "still" | "off". */
export function modeFor({ route, idleMs = 0, focused = true, hidden = false, reduced = false, heroVisible = true }) {
  if (hidden || DARK_ROUTES.includes(route)) return "off";
  if (reduced || !focused) return "still";
  if (route === HOME) {
    if (!heroVisible) return idleMs < DATA_CHEAP_MS ? "cheap" : "still";
    if (idleMs < HOME_FULL_MS) return "full";
    return idleMs < HOME_CHEAP_MS ? "cheap" : "still";
  }
  return idleMs < DATA_CHEAP_MS ? "cheap" : "still";
}

/** When the mode will change next on its own (ms from now), so one timer is enough; null = never. */
export function nextChangeIn({ route, idleMs = 0, focused = true, hidden = false, reduced = false, heroVisible = true }) {
  if (hidden || reduced || !focused || DARK_ROUTES.includes(route)) return null;
  const marks = route === HOME && heroVisible ? [HOME_FULL_MS, HOME_CHEAP_MS] : [DATA_CHEAP_MS];
  const next = marks.find((m) => m > idleMs);
  return next == null ? null : next - idleMs;
}

export const MARGIN_MIN = 260; // a data screen's free side margin (px) wide enough for the creature to be seen whole

/** Where the creature sits. Home: large, inside the header box. Data screens: in the free margin beside the
 *  sheet when the window has one, else away (a list is never drawn over it). Coordinates are viewport px of the
 *  top eye pair. `sheet` is the data screen's sheet rectangle. */
export function creatureFor({ route, w, h, phone, hero = null, sheet = null }) {
  if (DARK_ROUTES.includes(route)) return { show: false };
  if (route === HOME && hero && hero.bottom > 0) {
    if (phone) return { show: true, x: w * 0.5, y: hero.top + Math.min(hero.height * 0.3, 110), scale: 0.95 };
    // the words sit on the left of the header box; the creature fills its right side
    return { show: true, x: hero.left + hero.width * 0.74, y: hero.top + hero.height * 0.24, scale: Math.min(1.25, Math.max(0.8, hero.height / 330)) };
  }
  const free = sheet ? w - sheet.right : 0;
  if (phone || free < MARGIN_MIN) return { show: false };
  return { show: true, x: sheet.right + free / 2, y: Math.min(220, h * 0.16), scale: Math.min(0.9, Math.max(0.55, free / 620)) };
}
