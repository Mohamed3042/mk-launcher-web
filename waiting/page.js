// waiting/: the Waiting board alone, the page he saves from Safari as its own Home Screen icon. It opens straight on
// the board, also with no network at all (the service worker keeps it; the last board comes from this device).
// Two homes, one page: on the PC's launcher it reads and marks through the PC's API; in the Backup (GitHub Pages)
// it reads the private snapshot with the key the Backup already holds, or asks for it with the Backup's own connect.
import * as source from "../source.js";
import { createWaiting } from "../waiting.js";
import { GLYPHS } from "../glyphs.js";
import { connectHtml, saveKey, cinemaKeyWorks } from "../connect.js";

const BACKUP = source.BACKUP;
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const g = (name) => `<svg class="g" viewBox="0 0 24 24" aria-hidden="true">${GLYPHS[name] || GLYPHS.grid}</svg>`;
function localGet(k, d) { try { const v = localStorage.getItem("mkl." + k); return v == null ? d : JSON.parse(v); } catch { return d; } }
function localSet(k, v) { try { localStorage.setItem("mkl." + k, JSON.stringify(v)); } catch { /* private mode */ } }

const t = localGet("theme", "auto"); // the launcher's theme choice colours the room around the paper on a wide screen
if (t !== "auto") document.documentElement.setAttribute("data-theme", t);
if ("standalone" in navigator && navigator.standalone === true) document.documentElement.classList.add("ios-app");

async function api(path, opts = {}) {
  if (BACKUP) return source.backupApi(path, opts);
  const r = await fetch(path, { ...opts, headers: { "X-MKL": "1", ...(opts.body ? { "Content-Type": "application/json" } : {}) }, cache: "no-store" });
  let data = null;
  try { data = await r.json(); } catch { /* empty */ }
  if (!r.ok) throw new Error((data && data.error) || `${r.status} ${r.statusText}`);
  return data;
}

const C = { on: false, error: "", connecting: false, cinema: false };
const waiting = createWaiting({ $, esc, api, post: (p, b) => api(p, { method: "POST", body: JSON.stringify(b) }), localGet, localSet,
  backup: BACKUP, liveOrigin: () => source.liveOrigin(), asOf: (lang) => (BACKUP ? source.asOf(source.snapshotAt(), Date.now(), lang) : ""),
  redraw: () => { if (!C.on) draw(); } });

function draw() {
  waiting.unmount();
  if (C.on) {
    document.documentElement.classList.add("route-connect");
    $("#view").innerHTML = connectHtml({ error: C.error, cinema: C.cinema, connecting: C.connecting, g, esc, base: "../" });
    return;
  }
  document.documentElement.classList.remove("route-connect");
  $("#view").innerHTML = waiting.render();
  waiting.mount();
  const n = waiting.count();
  document.title = n ? `Waiting (${n})` : "Waiting";
}

let toastTimer = 0;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg; el.classList.add("on");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("on"), 2600);
}

// ---------- the Backup's key, asked the Backup's way ----------
async function connect(value, from) {
  if (C.connecting) return;
  C.connecting = true; C.error = ""; draw();
  const r = await saveKey(value, from);
  C.connecting = false;
  if (!r.ok) { C.error = r.message; draw(); $("#key")?.focus(); return; }
  C.on = false;
  toast(from === "mkc" ? "Connected with your MK Cinema key" : "Connected");
  await refresh(true);
}
document.addEventListener("submit", (e) => {
  if (e.target.id !== "connect-form") return;
  e.preventDefault();
  connect($("#key").value, "own");
});
document.addEventListener("click", (e) => { if (e.target.closest('[data-act="connect-cinema"]')) connect("", "mkc"); });

let busy = false;
async function refresh(first = false) {
  if (busy || !source.token()) return;
  busy = true;
  try {
    const before = source.snapshotAt();
    await source.fetchSnapshot();
    if (first || source.snapshotAt() !== before) await waiting.load();
  } catch (e) {
    if (e.code === "token" || e.code === "access") { C.on = true; C.error = e.message; draw(); }
    else if (first && source.snapshotAt()) toast(`${e.message}. Showing the copy on this device.`);
  } finally { busy = false; }
}

async function boot() {
  if (BACKUP) {
    $("#corner").setAttribute("aria-label", "Back to the launcher backup");
    if (await source.cachedSnapshot()) await waiting.load(); // the last board, at once, offline too
    else draw();
    if (!source.token()) {
      C.on = true; draw();
      cinemaKeyWorks().then((ok) => { C.cinema = !!ok; if (C.on) draw(); });
    } else await refresh(true);
    setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 5 * 60e3);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refresh(); });
  } else {
    draw(); // the board this device saw last, before the PC answers
    await waiting.load();
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("../sw.js").catch(() => {});
}
boot();
