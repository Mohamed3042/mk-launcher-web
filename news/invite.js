// Guest invites for MK News: one read-only GitHub key per person, carried in the link's fragment (#invite=…), which
// browsers never send to a server. MK Cinema's pattern (mk-cinema-app/invite.js) for the news-only repo: a guest's
// key opens mk-news-snapshot and nothing else of his. The owner's invite list lives on the PC and keeps only each
// key's last four characters. No DOM here: tested with node --test (tests/web/invite.test.mjs).
import { validateNews } from "../backup-rules.js";

export const OWNER = "Mohamed";
export const REPO_OWNER = "Mohamed3042";
export const REPO = "mk-news-snapshot";
// Guests open the GitHub Pages copy, so a link made on the PC's own copy still points there.
export const NEWS_URL = "https://mohamed3042.github.io/mk-launcher-web/news/";
export const INVITE_DAYS = 90;
export const NAME_MAX = 28; // "MK News – " + name stays within GitHub's 40-character key name
export const GUEST_KEY = "mkn.guest";
export const TOKEN_KEY = "mkn.guestToken";
export const TOKENS_PAGE = "https://github.com/settings/personal-access-tokens";
// What a guest's key must NOT open: the launcher's backup and the cinema library ([repo, file, in plain words]).
const OTHERS = [["mk-launcher-snapshot", "snapshot.json", "launcher"], ["mk-cinema-library", "cinema.json", "cinema"]];
// A fine-grained key: github_pat_ then letters, digits and underscores. Classic keys (ghp_…) cannot be limited to
// one repository, so they never go into a link.
const FINE_GRAINED = /^github_pat_[A-Za-z0-9_]{20,255}$/u;

export const isFineGrained = (token) => typeof token === "string" && FINE_GRAINED.test(token);
export function cleanName(value) {
  const name = String(value ?? "").replace(/[\u0000-\u001f\u007f<>]/gu, "").replace(/\s+/gu, " ").trim();
  return [...name].slice(0, NAME_MAX).join("").trim();
}
export const keyName = (person) => `MK News – ${cleanName(person)}`;

const toBase64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
function fromBase64url(text) {
  if (typeof text !== "string" || !/^[A-Za-z0-9_-]{1,2000}$/u.test(text)) return null;
  try { return Uint8Array.from(atob(text.replace(/-/gu, "+").replace(/_/gu, "/")), (c) => c.charCodeAt(0)); } catch { return null; }
}
export function encodeInvite({ name, token }) {
  const n = cleanName(name);
  if (!n || !isFineGrained(token)) throw new Error("invite needs a name and a fine-grained key");
  return toBase64url(new TextEncoder().encode(JSON.stringify({ v: 1, n, t: token })));
}
// Returns { name, token } or null for anything that is not exactly a version-1 invite.
export function decodeInvite(value) {
  const bytes = fromBase64url(value);
  if (!bytes) return null;
  let data;
  try { data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return null; }
  if (!data || typeof data !== "object" || Array.isArray(data) || data.v !== 1 || !isFineGrained(data.t)) return null;
  const name = cleanName(data.n);
  if (!name || name !== data.n) return null;
  return { name, token: data.t };
}
export const inviteLink = (invite) => `${NEWS_URL}#invite=${encodeInvite(invite)}`;

// Reads an invite from the address and removes it at once, before anything else can see or store the address.
// Returns null (no invite), { bad: true } or { name, token }.
export function takeInvite(loc = globalThis.location, hist = globalThis.history) {
  const hash = loc?.hash || "";
  if (!hash.startsWith("#invite=")) return null;
  try { hist.replaceState(hist.state, "", `${loc.pathname}${loc.search}`); } catch { /* the address keeps it; nothing is sent */ }
  return decodeInvite(hash.slice("#invite=".length)) || { bad: true };
}
// A pasted invite: the whole link (inside a message, even) or just its invite part. null when nothing was pasted.
export function parseInvite(text) {
  const s = String(text ?? "").trim();
  if (!s) return null;
  const m = /#invite=([A-Za-z0-9_-]+)/u.exec(s) || /^([A-Za-z0-9_-]{40,2000})$/u.exec(s);
  return (m && decodeInvite(m[1])) || { bad: true };
}

// GitHub's new fine-grained key page, pre-filled (name, description, resource owner, 90 days, Contents: Read-only).
// Repository selection has no URL parameter: the owner picks mk-news-snapshot by hand.
export function tokenPageURL(person) {
  const name = cleanName(person);
  const url = new URL(`${TOKENS_PAGE}/new`);
  url.searchParams.set("name", keyName(name));
  url.searchParams.set("description", `Read-only key for ${name} to read MK News. Repository access: Only select repositories → ${REPO}.`);
  url.searchParams.set("target_name", REPO_OWNER);
  url.searchParams.set("expires_in", String(INVITE_DAYS));
  url.searchParams.set("contents", "read");
  return url.href;
}

// Who this device belongs to when it opened an invite: { name, left }. The key itself is kept apart (TOKEN_KEY).
export function readGuest(storage) {
  try {
    const data = JSON.parse(storage.getItem(GUEST_KEY));
    const name = cleanName(data?.name);
    return name ? { name, left: data.left === true } : null;
  } catch { return null; }
}
export function writeGuest(storage, guest) {
  try { if (guest) storage.setItem(GUEST_KEY, JSON.stringify({ name: cleanName(guest.name), left: guest.left === true })); else storage.removeItem(GUEST_KEY); } catch { /* blocked */ }
}

// ---------- checking a key made for an invite ----------
export class InviteError extends Error {
  constructor(code, what = "") { super(code); this.name = "InviteError"; this.code = code; this.what = what; }
}
// Only classic keys report scopes (X-OAuth-Scopes); GitHub has no way to read a fine-grained key's own permissions.
// So the key is asked to make an unused blob in the news repo: a read-only key is stopped at GitHub's permission
// check (403); a key that may write gets the blob (201), an object no file, branch or commit ever points at.
const WRITE_SCOPE = /(?:^|,)\s*(?:repo|public_repo|delete_repo|workflow|(?:write|admin):[a-z_:]+)\s*(?=,|$)/u;
// GitHub-Authentication-Token-Expiration looks like "2027-01-22 10:00:00 UTC" (or "… +0000").
function expiry(value) {
  if (!value) return null;
  const time = [value, value.replace(" ", "T").replace(/\s*UTC$/u, "Z").replace(/\s+([+-]\d{2}):?(\d{2})$/u, "$1:$2")].map(Date.parse).find(Number.isFinite);
  return time === undefined ? null : new Date(time).toISOString();
}
const failure = (res) => (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0" ? "rate-limit"
  : res.status === 401 || res.status === 403 ? "token" : res.status === 404 ? "access" : "github-unreachable");
async function call(f, path, token, signal, init = {}) {
  try {
    return await f(`https://api.github.com/repos/${REPO_OWNER}/${path}`, {
      ...init, headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.raw", "X-GitHub-Api-Version": "2022-11-28", ...init.headers },
      cache: "no-store", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", signal,
    });
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    throw new InviteError(globalThis.navigator?.onLine === false ? "offline" : "github-unreachable");
  }
}
const read = (f, repo, file, token, signal) => call(f, `${repo}/contents/${file}`, token, signal);
async function canWrite(f, token, signal) {
  const res = await call(f, `${REPO}/git/blobs`, token, signal, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/vnd.github+json" },
    body: JSON.stringify({ content: "MK News key check", encoding: "utf-8" }) });
  if (res.ok) return true;
  if (failure(res) === "rate-limit") throw new InviteError("rate-limit");
  if (res.status === 403 || res.status === 404) return false;
  throw new InviteError(failure(res)); // GitHub could not say: never guess "read-only"
}
// The key must be a fine-grained one that is not this device's own, read mk-news-snapshot/news.json, open nothing
// else of his (GitHub answers 404 for a repository a key was not given, so both other repos must say 404), and be
// read-only. Returns { expires } (an ISO date, or null when GitHub doesn't say); throws InviteError with a code.
export async function checkKey(token, { fetch: f = globalThis.fetch, own = [], signal } = {}) {
  const key = String(token ?? "").trim();
  if (!key) throw new InviteError("empty");
  if (own.filter(Boolean).includes(key)) throw new InviteError("own");
  if (!isFineGrained(key)) throw new InviteError(/^gh[a-z]_/u.test(key) ? "classic" : "not-a-key");
  const res = await read(f, REPO, "news.json", key, signal);
  if (!res.ok) throw new InviteError(failure(res));
  const scopes = res.headers.get("x-oauth-scopes");
  if (scopes != null && WRITE_SCOPE.test(scopes)) throw new InviteError("write");
  try { validateNews(await res.json()); } catch (e) { if (e?.name === "AbortError") throw e; throw new InviteError("invalid"); }
  for (const [repo, file, what] of OTHERS) {
    const other = await read(f, repo, file, key, signal);
    if (other.status === 404) continue;
    if (other.status === 401 || other.status >= 500 || failure(other) === "rate-limit") throw new InviteError(failure(other));
    throw new InviteError("too-wide", what); // it read the file, or it can see the repo: either way, more than the news
  }
  if (await canWrite(f, key, signal)) throw new InviteError("write");
  return { expires: expiry(res.headers.get("github-authentication-token-expiration")) };
}
