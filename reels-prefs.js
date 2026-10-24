// Reels choices that belong to one device (voice, read aloud) and the reading-time rule.
// Pure functions over a Storage-like object, so they can be checked on their own (tests/test_reels.py).
const KEY = "mkl.reels.device";
const DEFAULTS = { voice: "", readAloud: false };

export function devicePrefs(storage) {
  const get = () => {
    try {
      const raw = JSON.parse(storage?.getItem(KEY) || "{}");
      return {
        voice: typeof raw.voice === "string" ? raw.voice.slice(0, 200) : DEFAULTS.voice,
        readAloud: typeof raw.readAloud === "boolean" ? raw.readAloud : DEFAULTS.readAloud,
      };
    } catch { return { ...DEFAULTS }; } // private mode, a full disk or a broken value never breaks the page
  };
  const set = (changes) => {
    const next = { ...get() };
    if (typeof changes.voice === "string") next.voice = changes.voice.slice(0, 200);
    if (typeof changes.readAloud === "boolean") next.readAloud = changes.readAloud;
    try { storage.setItem(KEY, JSON.stringify(next)); return true; } catch { return false; }
  };
  return { get, set };
}

// How long a reel stays before it moves on: a beat to look, then the words at a calm reading speed.
export const PACE = { relaxed: 170, normal: 230, fast: 320 }; // words per minute
export function readingMs(reel, pace = "normal") {
  const words = [reel.title, reel.why, ...(reel.gist || [])].join(" ").split(/\s+/).filter(Boolean).length;
  const wpm = PACE[pace] || PACE.normal;
  const look = pace === "fast" ? 1800 : pace === "relaxed" ? 3200 : 2400;
  return Math.round(Math.min(30000, Math.max(4000, look + (words / wpm) * 60000)));
}

// Speech that never fires end or error gives up after about twice the reading time.
export const speechTimeoutMs = (reel, pace = "normal") => 2 * readingMs(reel, pace);

// Where Reels opens. The server's shared seen list decides (so phone and PC agree) until he moves in this
// visit; with "start where I left off" off it is always the top. A spot remembered from the cache never wins.
export function openIndex({ items = [], seen = [], resume = true, activeId = null, moved = false }) {
  if (moved && activeId) {
    const i = items.findIndex((r) => r.id === activeId);
    if (i >= 0) return i;
  }
  if (!resume) return 0;
  const s = new Set(seen);
  const i = items.findIndex((r) => !s.has(r.id));
  return i < 0 ? items.length : i; // everything seen: the caught-up card
}

// A picture URL as a CSS url(): quotes, brackets, backslashes and spaces are percent-encoded, so a URL can
// never close the url() and add CSS of its own.
export const cssUrl = (u) => `url("${String(u || "").replace(/['"()\\\s]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"))}")`;
