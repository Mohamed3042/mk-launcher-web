// The Backup's one-step connect (paste a read-only GitHub key once), shared by the launcher (#/connect) and the
// Waiting page of its own (waiting/), so both homes ask the same way. The key itself is kept by source.js.
import * as source from "./source.js";

// base: where icons/ lives from this page ("" for the launcher, "../" for waiting/).
export function connectHtml({ error = "", cinema = false, connecting = false, g, esc, base = "" }) {
  return `<section class="connect" aria-labelledby="connect-h">
    <div class="connect-card">
      <img class="connect-logo" src="${base}icons/backup.svg" alt="">
      <h1 id="connect-h">Open your launcher backup</h1>
      <p class="connect-lede">When your PC is off, this copy on GitHub shows what was last true: your apps and their status, what changed, and your reels. Paste a read-only GitHub key once.</p>
      ${cinema ? `<button class="btn primary wide" type="button" data-act="connect-cinema">${g("sparkles")}Use my MK Cinema key</button>
        <p class="connect-or"><span>or paste a new key</span></p>` : ""}
      <form id="connect-form" autocomplete="off">
        <label for="key">GitHub key</label>
        <input id="key" type="password" placeholder="github_pat_…" autocapitalize="none" spellcheck="false" required aria-describedby="key-help${error ? " key-error" : ""}"${error ? ' aria-invalid="true"' : ""}>
        <p id="key-help" class="sub">Stored only in this browser. It can only read the snapshot.</p>
        ${error ? `<p class="connect-error" id="key-error" role="alert">${g("alert")}<span>${esc(error)}</span></p>` : ""}
        <button class="btn ${cinema ? "" : "primary "}wide" type="submit"${connecting ? " disabled" : ""}>${connecting ? "Checking…" : error ? "Try again" : "Connect"}</button>
      </form>
      <section class="connect-steps" aria-label="How to make the key"><h2>Make the key</h2><ol>
        <li><span><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">New fine-grained token ${g("external")}</a></span></li>
        <li><span>Repository access: <b>Only select repositories</b>, then pick <b class="nowrap">${esc(source.REPO_NAME)}</b></span></li>
        <li><span>Permissions, Contents: <b>Read-only</b>. Generate it, copy it, paste it above.</span></li></ol></section>
    </div></section>`;
}

// Check the key against the snapshot, then keep it: { ok } or { ok: false, message }.
export async function saveKey(value, from) {
  const r = await source.tryKey(from === "mkc" ? source.cinemaToken() : value);
  if (!r.ok) return { ok: false, message: r.message };
  try { source.saveToken(value, from); } catch (e) { return { ok: false, message: e.message }; }
  if (source.guest() && !source.guest().left) await source.leaveGuest(); // his own key: MK News is his again on this device
  return { ok: true };
}

// Can MK Cinema's key (kept on this device by the MK Cinema app) open the snapshot too? null when there is none.
export async function cinemaKeyWorks() {
  const mkc = source.cinemaToken();
  return mkc ? (await source.tryKey(mkc)).ok : null;
}
