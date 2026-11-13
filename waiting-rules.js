// Waiting's rules, with no DOM: the fixed words (English and Arabic), grouping the slips, the Home line, the date
// line, and each slip's own torn edge and tilt (drawn from its id, so a slip keeps its shape between visits).

export const GROUPS = ["you", "running", "coming"];
export const ARABIC = /[؀-ۿݐ-ݿ]/;
// The same language choice as Plans: his saved pick, else the device language.
export const langOf = (saved, navLang = "") => (saved === "ar" || saved === "en" ? saved : String(navLang).toLowerCase().startsWith("ar") ? "ar" : "en");

const WORDS = {
  en: { title: "Waiting", you: "Waiting on you", running: "Running", coming: "Coming",
    "empty.you": "Nothing waits on you", "empty.running": "Nothing is running", "empty.coming": "Nothing is coming",
    undo: "Undo", backup: "This board reaches the backup with the next snapshot", offline: "Your PC didn't answer",
    done: "done", cancelled: "crossed out", launcher: "Launcher",
    help: "Draw a line through a slip when it is done, or a cross when you drop it. Tap a marked slip to lift the ink. Keys: Enter done, Delete cross out, Z lift." },
  ar: { title: "في الانتظار", you: "ينتظرك أنت", running: "يعمل الآن", coming: "قادم",
    "empty.you": "لا شيء ينتظرك", "empty.running": "لا شيء يعمل الآن", "empty.coming": "لا شيء قادم",
    undo: "تراجع", backup: "اللوحة تصل إلى النسخة الاحتياطية مع اللقطة القادمة", offline: "جهازك لم يرد",
    done: "تم", cancelled: "مشطوب", launcher: "المشغّل",
    help: "ارسم خطًا على الورقة حين تنتهي منها، أو علامة × حين تلغيها. المس ورقة معلّمة لترفع الحبر. المفاتيح: Enter تم، Delete شطب، Z رفع." },
};
export const text = (lang) => (key) => (WORDS[lang] || WORDS.en)[key] ?? WORDS.en[key] ?? key;

// The slips in their three groups, in the order they were sent; unknown groups are dropped.
export function grouped(items) {
  const out = { you: [], running: [], coming: [] };
  for (const it of Array.isArray(items) ? items : []) if (out[it?.group] && typeof it.line === "string") out[it.group].push(it);
  return out;
}

// Only open slips wait on him; a struck or crossed one rests on the page.
export const waitCount = (board) => grouped(board?.items).you.filter((it) => !it.state || it.state === "open").length;

// The one quiet count beside the date: "3 done today", "3 done · 1 crossed out today"; empty when nothing is marked.
export function tallyLine({ done = 0, cancelled = 0 } = {}, lang = "en") {
  if (!done && !cancelled) return "";
  if (lang === "ar") return [done ? `${done} تم اليوم` : "", cancelled ? `${cancelled} مشطوب` : ""].filter(Boolean).join(" · ");
  return [done ? `${done} done` : "", cancelled ? `${cancelled} crossed out` : ""].filter(Boolean).join(" · ") + " today";
}

// "2 marks wait for your PC": marks made here that the PC has not taken yet; empty at 0.
export function pendingLine(n, lang = "en") {
  if (!n) return "";
  if (lang === "ar") return n === 1 ? "علامة واحدة تنتظر جهازك" : `${n} علامات تنتظر جهازك`;
  return n === 1 ? "1 mark waits for your PC" : `${n} marks wait for your PC`;
}

// Home's one quiet line; empty when nothing waits on him.
export function homeLine(n, lang = "en") {
  if (!n) return "";
  return lang === "ar" ? `${n} ${n === 1 ? "ينتظرك" : "تنتظرك"}` : `${n} ${n === 1 ? "waits" : "wait"} on you`;
}

// "Thursday 12 November" (Arabic: "الخميس ١٢ نوفمبر").
export function dateLine(d = new Date(), lang = "en") {
  const loc = lang === "ar" ? "ar-EG" : "en-GB";
  const part = (o) => new Intl.DateTimeFormat(loc, o).format(d);
  return `${part({ weekday: "long" })} ${part({ day: "numeric" })} ${part({ month: "long" })}`;
}

// A small steady random number generator seeded from a text, so the same slip always tears the same way.
export function seeded(seed) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// The torn top and bottom edges as a clip-path polygon (straight cut sides).
export function tornEdge(seed) {
  const r = seeded(seed), top = [], bottom = [];
  for (let x = 0; x <= 100; x += 4) top.push(`${x}% ${(r() * 3).toFixed(1)}%`);
  for (let x = 100; x >= 0; x -= 2) bottom.push(`${x}% ${(91 + r() * 9).toFixed(1)}%`);
  return `polygon(${top.join(",")},${bottom.join(",")})`;
}

// How a slip hangs: a slight turn, a small sideways shift and where its pin sits (percent from the left).
export function hang(seed) {
  const r = seeded(seed + "~");
  const sign = r() < 0.5 ? -1 : 1;
  return { rot: +(sign * (0.6 + r() * 1.1)).toFixed(2), dx: Math.round((r() - 0.5) * 18), pin: Math.round(38 + r() * 24) };
}
