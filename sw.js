// Offline shell: the launcher still opens (with the last known state) when the PC is asleep.
// Paths are relative to this file, so the same worker runs on the PC (/) and on GitHub Pages (/mk-launcher-web/).
// It caches only the public shell: never the API, never GitHub, never a request that carries a key.
const SHELL = "mkl-shell-v9";
const SHOTS = "mkl-shots-v1";
const OURS = ["mkl-shell-", "mkl-shots-"]; // other apps on the same origin (MK Cinema on Pages) keep their caches
const FILES = [
  "./", "./index.html", "./app.css", "./app.js", "./charts.js", "./glyphs.js", "./manifest.webmanifest",
  "./reels.js", "./reels.css", "./reels-prefs.js", "./cinema.js", "./cinema.css", "./cinema-rules.js", "./settings.js", "./source.js", "./backup-rules.js", "./host.js", "./host-rules.js",
  "./fonts/dm-sans-latin-400-normal.woff2", "./fonts/dm-sans-latin-600-normal.woff2",
  "./fonts/cormorant-garamond-latin-500-normal.woff2", "./icons/icon.svg", "./icons/backup.svg",
  "./news/", "./news/index.html", "./news/news.js", "./news/news.css", "./news/story.js", "./news/rows.js",
  "./news/ambient.js", "./news/icons.js", "./news/invite.js", "./news/guests.js",
  // the artwork: every reel and card without a picture of its own shows one, offline too
  ...["agents", "claude-code", "claude", "default", "models", "open", "outage", "papers", "prices", "releases", "repos",
    "status", "video", "voice"].map((a) => `./news/art/${a}.jpg`),
];
const ROOT = new URL("./", self.location).pathname;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL)
    .then((c) => Promise.allSettled(FILES.map((f) => c.add(new Request(f, { cache: "reload" })))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => OURS.some((p) => k.startsWith(p)) && ![SHELL, SHOTS].includes(k)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || e.request.headers.has("Authorization")) return;
  if (!url.pathname.startsWith(ROOT)) return;
  const rel = url.pathname.slice(ROOT.length);
  if (rel.startsWith("api/")) return; // live data is never served stale from here
  if (rel.startsWith("shots/")) {
    e.respondWith(caches.open(SHOTS).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  // shell: network first so updates land at once, cache when the PC (or GitHub) is unreachable
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(SHELL).then((c) => c.put(e.request, copy));
    }
    return res;
  }).catch(() => caches.match(e.request).then((hit) => {
    if (hit) return hit;
    // only a page load falls back to the app page; a picture or a script that cannot load fails as itself
    // (the app page answering a picture request left reels black when the PC was briefly unreachable)
    if (e.request.mode === "navigate") return caches.match(new URL("./index.html", self.location).href);
    return Response.error();
  })));
});
