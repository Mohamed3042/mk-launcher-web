// What a story says, without the page: display titles, incident state, pictures, art, prompts and this
// week's numbers. Pure functions over the /api/news data (no DOM), so they can be checked on their own.
// Who he is and what he builds comes from the PC (/api/news/status, /api/reels), never from this file:
// the same file is published on GitHub Pages, which must not describe his apps or his business.
export let MY_WORK = "My work: I build my own apps with Claude Code and Codex.";
export function setMyWork(text) {
  if (typeof text === "string" && text.trim()) MY_WORK = text.trim().slice(0, 1500);
}

export const TOPICS = [
  { id: "claude", label: "Claude", test: (i) => i.tags.includes("claude-code") || i.tags.includes("anthropic") },
  { id: "models", label: "Models", test: (i) => i.kind === "model" || i.tags.includes("models") },
  { id: "prices", label: "Prices", test: (i) => i.kind === "price" || i.tags.includes("prices") },
  { id: "status", label: "Outages", test: (i) => i.kind === "status" },
  { id: "releases", label: "Releases", test: (i) => i.kind === "release" },
  { id: "voice", label: "Voice", test: (i) => i.tags.includes("voice") },
  { id: "video", label: "Video", test: (i) => i.tags.includes("video") },
  { id: "agents", label: "Agents", test: (i) => i.tags.includes("agents") },
  { id: "papers", label: "Papers", test: (i) => i.kind === "paper" },
  { id: "free", label: "Free & open", test: (i) => i.tags.includes("free-apis") },
];

export const TOPIC = Object.fromEntries(TOPICS.map((t) => [t.id, t]));

export const KIND_LABEL = { article: "Article", release: "Release", model: "New model", paper: "Paper", status: "Outage", price: "Price change", repo: "Repo", digest: "This week" };

export const PROVIDER = { anthropic: "Claude", openai: "OpenAI", google: "Google", "x-ai": "xAI", deepseek: "DeepSeek", qwen: "Qwen", "meta-llama": "Meta", mistralai: "Mistral", moonshotai: "Moonshot", "z-ai": "Z.ai" };

// Hosts whose story pictures are designed title cards (white or brand-colour text cards, paper first pages,
// wordmarks), like GitHub's: in this dark room they read as holes, so the topic artwork stands in for them.
// Checked against the real feed: Hugging Face blog and paper thumbnails, Google's blog CDNs, Anthropic and
// claude.com share images are almost all cards. Other pictures (photos, screenshots) are shown, warmly graded.
export const CARD_HOSTS = /(^|\.)(opengraph\.githubassets\.com|repository-images\.githubusercontent\.com|huggingface\.co|storage\.googleapis\.com|googleusercontent\.com|www-cdn\.anthropic\.com|claude\.com)$/i;

export const toMs = (t) => (typeof t === "number" ? (t < 2e10 ? t * 1000 : t) : Date.parse(t));
export function ago(t) {
  const ms = toMs(t);
  if (!ms) return "";
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
export const hoursAgo = (it) => (Date.now() - toMs(it.published)) / 3.6e6;
export const byNewest = (a, b) => toMs(b.published) - toMs(a.published);
export function compact(n) {
  if (n == null || Number.isNaN(n)) return "–";
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, "")}k`;
  return `${Math.round(n)}`;
}
export const money = (v) => (v == null ? "–" : v >= 10 ? `$${v.toFixed(0)}` : v >= 1 ? `$${v.toFixed(2).replace(/\.00$/, "")}` : `$${v.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}`);
export const cleanModel = (name) => String(name || "").replace(/^[^:]+:\s*/, "");
export const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
export const lowerFirst = (s) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
export function minutes(m) {
  const v = Math.round(m || 0);
  if (v < 60) return `${v} min`;
  const h = Math.floor(v / 60), r = v % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

// ---------- what a story says ----------
export function prettyRepo(sourceName) {
  const repo = String(sourceName || "").split("/").pop();
  return { "claude-code": "Claude Code", codex: "Codex", godot: "Godot" }[repo] || repo.split(/[-_]/).map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}
export function releaseChanges(summary) {
  const s = String(summary || "").replace(/^\s*what'?s\s+changed\s*:?\s*/i, "").trim();
  return s.split(/\s+(?=(?:Added|Fixed|Improved|Changed|Removed|Updated|Reduced|Made|Renamed|Deprecated|Moved|Increased|Enabled|Disabled|Restored)\s)/)
    .map((p) => p.trim()).filter(Boolean);
}
// "Added the Monitor tool and plugin monitors on Bedrock, ..." -> "Monitor tool and plugin monitors"
export function releaseHighlight(it) {
  const m = /^(?:Added|Introduced|New:)\s+(?:the\s+|a\s+|an\s+)?(.+)$/i.exec(releaseChanges(it.summary)[0] || "");
  if (!m) return "";
  const h = m[1].split(/\s+(?:on|for|in|to|when|with|via|so|that|and when)\s+|[,;:(]/)[0].trim().replace(/\.$/, "");
  const words = h.split(/\s+/).length;
  return words >= 2 && words <= 7 ? h : "";
}
export function releaseTitle(it) {
  const repo = String(it.source_name || "").split("/").pop().toLowerCase();
  let version = String(it.title || "").trim();
  if (repo && version.toLowerCase().startsWith(repo + " ")) version = version.slice(repo.length + 1);
  version = version.replace(/^v(?=\d)/i, "");
  const high = releaseHighlight(it);
  return `${prettyRepo(it.source_name)} ${version}${it.metrics?.prerelease ? " (preview)" : " released"}${high ? `: ${high}` : ""}`;
}
export function incidentOpen(it) {
  const m = it.metrics || {};
  if (typeof m.resolved === "boolean") return !m.resolved;
  // Older entries carry no flag: the newest update comes first in the summary.
  if (/\bresolved\b/i.test(String(it.summary || "").slice(0, 260))) return false;
  if (!m.minutes) return false; // created already resolved (a back-filled incident)
  return hoursAgo(it) < 36;
}
export function firstSentence(s, max = 170) {
  const t = String(s || "").trim();
  const m = /^(.{20,}?[.!?])\s/.exec(t);
  const out = m ? m[1] : t;
  return out.length > max ? out.slice(0, max - 1).trimEnd() + "…" : out;
}
export function cleanSummary(it) {
  let s = String(it.summary || "").trim();
  const t = String(it.title || "").trim();
  if (t && s.toLowerCase().startsWith(t.toLowerCase())) s = s.slice(t.length).replace(/^[\s:.\-–—]+/, "");
  return s;
}
export function sourceLabel(it) {
  if (it.kind === "release" && String(it.source_name).includes("/")) return prettyRepo(it.source_name);
  if (it.kind === "repo") return "GitHub trending";
  return it.source_name || "";
}
export function artName(it, rowArt) {
  if (it.kind === "status") return incidentOpen(it) ? "outage" : "status";
  if (it.kind === "paper") return "papers";
  if (it.kind === "repo") return "repos";
  if (it.kind === "model" || it.kind === "digest") return "models";
  if (it.kind === "price") return "prices";
  const tags = it.tags || [];
  if (it.source === "claude-code" || tags.includes("claude-code")) return "claude-code";
  if (it.source === "anthropic" || tags.includes("anthropic") || /claude|anthropic/i.test(it.source_name || "")) return "claude";
  if (rowArt) return rowArt;
  if (it.kind === "release") return "releases";
  for (const [tag, art] of [["video", "video"], ["voice", "voice"], ["agents", "agents"], ["free-apis", "open"], ["prices", "prices"], ["models", "models"]]) {
    if (tags.includes(tag)) return art;
  }
  return "default";
}
export const artUrl = (name) => new URL(`./art/${name}.jpg`, import.meta.url).href; // works at / and on GitHub Pages
export const artCss = (name) => `url(${artUrl(name)}), var(--warm)`;
export function pictureOf(it) {
  const u = String(it.image || "");
  if (!u.startsWith("https://")) return "";
  try { return CARD_HOSTS.test(new URL(u).hostname) ? "" : u; } catch { return ""; }
}
export function view(it) {
  if (it._v) return it._v;
  const m = it.metrics || {};
  let title = it.title || "", line = "", state = null;
  if (it.kind === "release") {
    title = releaseTitle(it);
    line = releaseChanges(it.summary)[0] || "";
  } else if (it.kind === "status") {
    const open = incidentOpen(it);
    const impact = m.impact && m.impact !== "none" ? ` · ${m.impact} impact` : "";
    state = open ? { cls: "bad", text: `Ongoing${impact}` } : { cls: "ok", text: "Resolved" };
    // "Claude Fable 5 and Claude Fable 5.1" -> "Claude Fable 5 and 5.1"
    title = title.replace(/(Claude (?:Fable|Opus|Sonnet|Haiku|Mythos)) ([\d.]+) and \1 ([\d.]+)/g, "$1 $2 and $3");
    if (!open) title = `Resolved: ${lowerFirst(title)}`;
    line = firstSentence(it.summary);
  } else if (it.kind === "model") {
    title = `New model: ${cleanModel(title.replace(/^New model:\s*/i, ""))}`;
    line = m.prompt != null ? `${money(m.prompt)} in · ${money(m.completion)} out per million tokens${m.context ? ` · ${compact(m.context)} context` : ""}` : cleanSummary(it);
  } else {
    line = cleanSummary(it);
  }
  const v = { title, line, why: String(it.why || "").trim(), state, pic: pictureOf(it) };
  Object.defineProperty(it, "_v", { value: v, enumerable: false }); // never sent or stored
  return v;
}
export function metaExtra(it) {
  const m = it.metrics || {};
  if (it.kind === "status" && m.minutes) return minutes(m.minutes);
  if (it.kind === "paper" && m.upvotes) return `▲ ${m.upvotes}`;
  if (m.points) return `${m.points} points`;
  if (it.kind === "model" && m.provider) return PROVIDER[m.provider] || m.provider;
  return "";
}


// ---------- prompts (unchanged from v1) ----------
export function promptFor(item, mode, idea) {
  const head = mode === "idea"
    ? "I read this and had an idea. Tell me honestly whether it's worth doing."
    : "I read this and want your honest take on whether it helps me.";
  const block = [`Title: ${item.title}`, `Source: ${item.source_name}${item.published ? `, ${new Date(item.published).toDateString()}` : ""}`, `Link: ${item.url}`, item.summary ? `Summary: ${item.summary}` : ""].filter(Boolean).join("\n");
  const ask = mode === "idea"
    ? `My idea: ${idea || "(I'll explain in the chat)"}\n\nGive me your verdict first (worth it / not worth it / maybe), then why in plain words, then the first concrete step if it's worth it.`
    : "Read the link first. Does this help any of my projects or the way I work? If it doesn't, say so plainly. If it does: what exactly would I do with it, which project, and is it worth the time right now?";
  return `${head}\n\n${block}\n\n${MY_WORK}\n\n${ask}`;
}
export const claudeUrl = (prompt) => `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;


export function priceDrops(c, days = 7) {
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const names = Object.fromEntries((c.prices || []).map((p) => [p.model, p.name]));
  const out = [];
  for (const [model, hist] of Object.entries(c.price_history || {})) {
    if (!hist || hist.length < 2) continue;
    const last = hist[hist.length - 1];
    if (last.day < since) continue;
    let ref = null;
    for (const h of hist.slice(0, -1)) if (h.day <= since) ref = h;
    ref = ref || hist[0];
    if (last.prompt < ref.prompt - 1e-9 || last.completion < ref.completion - 1e-9) {
      out.push({ model, name: cleanModel(names[model] || model), from: ref.completion, to: last.completion });
    }
  }
  return out;
}

export function flagshipPrices(prices) {
  // Current Claude lineup (newest of each family) against every other provider's flagship.
  const clean = prices.filter((p) => !/:batch|:free|:beta|:extended/i.test(p.model) && !/guard|embed|moderation|whisper|tts/i.test(p.name || p.model));
  const best = new Map();
  for (const p of clean) {
    let key = p.provider, version = 0;
    if (p.provider === "anthropic") {
      const m = /(opus|sonnet|haiku|fable|mythos)[^\d]*([\d.]+)/i.exec(p.name || p.model);
      if (!m) continue;
      key = "anthropic:" + m[1].toLowerCase();
      version = parseFloat(m[2]) || 0;
    }
    const prev = best.get(key);
    if (!prev || version > prev.version) best.set(key, { ...p, version });
  }
  return [...best.values()].sort((a, b) => b.completion - a.completion).slice(0, 16);
}

