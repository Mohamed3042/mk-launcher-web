// Plans' rules, with no DOM: the words for each state (English and Arabic), the sync line, the progress ring, the cost
// bars, a part's own steps, a layer's summary, plan search and the links the page makes. The plan data and its English
// words come from the server (core/plans.py); the defaults below only cover a copy cached before the words were sent.
// Tested with node --test (tests/web/plans.test.mjs).

export const WORDS = {
  status: { live: "Live", built: "Built, waiting", "not-built": "Not built", "needs-you": "Needs you", conflict: "Conflict" },
  status_order: ["needs-you", "built", "not-built", "conflict", "live"],
  stop: { done: "Done", now: "Doing now", you: "Waits on you", later: "Later" },
  who: { you: "You", me: "Me", both: "You + me" },
  decision: { settled: "Settled", open: "Open" },
};
const WORDS_AR = {
  status: { live: "يعمل", built: "جاهز، ينتظر", "not-built": "لم يُبنَ", "needs-you": "يحتاجك", conflict: "تعارض" },
  status_order: WORDS.status_order,
  stop: { done: "تم", now: "قيد التنفيذ", you: "بانتظارك", later: "لاحقاً" },
  who: { you: "أنت", me: "أنا", both: "أنت + أنا" },
  decision: { settled: "محسوم", open: "مفتوح" },
};
export const words = (data, lang = "en") => (lang === "ar" ? WORDS_AR : { ...WORDS, ...(data?.words || {}) });
// "12 need you", "1 needs you", "2 conflicts": the totals beside the progress ring.
export function countWord(status, n, lang = "en") {
  if (lang === "ar") return { "needs-you": "تحتاجك", built: "جاهزة تنتظر", "not-built": "لم تُبنَ", conflict: "تعارض", live: "تعمل" }[status] || status;
  const one = n === 1;
  return { "needs-you": one ? "needs you" : "need you", built: "built, waiting", "not-built": "not built",
    conflict: one ? "conflict" : "conflicts", live: "live" }[status] || status;
}

// ---------- the page's own words ----------
const EN = {
  plans: "Plans", allPlans: "All plans", lang: "عربي", langLabel: "Show Plans in Arabic",
  tab_overview: "Overview", tab_decisions: "Decisions", tab_money: "Money", tab_map: "System map", tab_evidence: "Evidence", tab_where: "Where it lives",
  tabsLabel: "Parts of this plan", viewMap: "Map", viewDetails: "List", viewLabel: "How to see the plan", back: "Back", wholePlan: "Whole plan",
  tapMap: "Tap any part of the map", mapNeeds: "{n} need you", mapStopsOf: "{a} of {b} stops done", stationsAria: "{title}: {state}", ownMap: "Opens its own map",
  openDetails: "Open details", noStop: "Any time", stopShort: "Stop {n}", tapArea: "Tap any area to explore", tapBlock: "Tap any block to go deeper",
  tapStep: "{n} steps, in order", zoomIn: "Zoom in", zoomOut: "Zoom out", recenter: "Back to the middle", fullscreen: "Full screen", arrowsNote: "Arrows follow the launch line.",
  st_done: "Done", st_now: "Working on it", st_todo: "Not started", stillMissing: "Still missing", alreadyDone: "Already done", updated: "Updated {date}", stopsDone: "stops done", of: "{a} of {b}",
  nextAction: "Next action", doingNow: "Doing now", nextForYou: "Next for you", needYouShort: "{n} need you", needsYouShort: "{n} needs you",
  launchLine: "Launch line", whatNeedsYou: "What needs you", showAll: "Show all {n}", toSettle1: "1 decision to settle", toSettle: "{n} decisions to settle",
  nothingWaits: "Nothing waits on you right now.", things: "{n} things, in launch order", thing1: "1 thing, in launch order",
  layers: "The plan in layers", partsN: "{n} parts", part1: "1 part", everything: "Everything", showParts: "Expand all", foldParts: "Fold all",
  liveOf: "{a} / {b} live", allOfLayer: "All of {name}", byStatus: "Show parts by status", partsByStatus: "Parts by status",
  noStops: "No stops yet. A launch line is the plan's shortest path, one stop after another.",
  noLayers: "No layers yet. Group the plan's parts into layers, like “Front door” or “Runs on”.", noParts: "No parts yet.",
  lineLabel: "Launch line", keyLabel: "What the stops mean", stopAria: "Stop {n}, {title}: {state}. {who}.",
  eye_decisions: "Decisions", settleFirst: "Settle these first", openSettled: "{o} open · {s} settled", settledN: "{s} settled",
  recentlySettled: "Recently settled", stillOpen: "Still open", before: "Before", now: "Now", pick: "Pick", decisionN: "Decision {n} of {total}",
  eye_money: "Money", whatItCosts: "What it costs", perMonth: "{cur} a month", byStage: "By stage", onEachSale: "On each sale", appByApp: "App by app",
  everyMonth: "Every month", yearlyOrOnce: "Yearly or once", perSale: "On each sale", costTable: "Monthly cost by stage", stage: "Stage", total: "Total", madeOf: "Made of",
  aMonth: "a month", plus: "plus",
  eye_map: "System map", partsInLayers: "{p} parts in {l} layers",
  eye_evidence: "Evidence", checked: "Checked", latest: "Latest, {date}", warning: "(a warning)",
  eye_where: "Where it lives", whereItLives: "Where it lives", seeOnGithub: "See it on GitHub", planFile: "The plan file",
  progress: "Progress", whatsDone: "What's done", whatsMissing: "What's missing", notedIn: "Noted in", openInPlan: "Open in plan", addNote: "Add note",
  addNoteHint: "Opens the plan file on GitHub at this part", partOf: "{layer} · part {at} of {n}", stopOf: "Stop {n} of {total} · {plan}",
  itsParts: "Its parts", noPartsTied: "No parts are tied to this stop.", close: "Close", stepsDoneOf: "{a} of {b} done",
  changedSub: "{n} changes · you last looked {ago}", changedSub1: "1 change · you last looked {ago}", changed: "Changed since your last look", changedN: "{n} changes since your last look", changed1: "1 change since your last look", gotIt: "Got it",
  ch_stop: "Stop {n}", ch_part: "Part · {layer}", ch_decision: "Decision", ch_next: "Next action", isNew: "New", isGone: "Removed", changedTag: "Changed",
  syncNow: "Sync now", syncNowLong: "Sync from GitHub now", readAgain: "Read the folder again",
  offlineHead: "GitHub can't be reached.", errorHead: "The last sync didn't work.", copyFrom: "This is the copy synced {when}. It updates by itself when GitHub answers.",
  nothingSynced: "Nothing has synced yet.", tryAgain: "Try again",
  problemHead: "The newest change to this plan has a problem,", problemRest: "so this is the last good version.", andMore: "(and {n} more)", openFile: "Open the file",
  noPlanCalled: "There is no plan called “{id}” any more.",
  libTitle: "Plans", libSub: "Living business plans that update from GitHub.", openPlan: "Open plan", newPlan: "New plan", fromTemplate: "From the template",
  libStops: "{a} of {b} stops", noStopsYet: "no stops yet", nothingNeedsYou: "Nothing needs you", updatedShort: "updated {date}", hasProblem: "Has a problem: {line}",
  newPlanHead: "New plan", newPlanName: "Name", newPlanFile: "File", newPlanHelp: "GitHub opens with the new plan ready. Tap Commit changes, and it shows here within 5 minutes.",
  newPlanGo: "Open GitHub", newPlanNoName: "Give it a name first.", newPlanTaken: "A plan with this name already exists.", newPlanPlaceholder: "Shop launch",
  emptyHead: "Start with a clear map.", emptyBody: "A plan holds its launch line, decisions, costs and parts. Add them to the plan file, and they show here within 5 minutes.",
  emptyEdit: "Edit the plan on GitHub",
  loading: "Loading plans", didntLoad: "Plans didn't load", noPlans: "No plans yet", syncOff: "Plans sync is off here", fetching: "Getting your plans from GitHub",
  syncOffText: "This launcher doesn't sync plans{why}. The PC's launcher does.", fetchingText: "The PC is fetching them now. They show here in a moment.",
  noPlansText: "A plan is one file in {where}. Ask Claude to add one, or start one from the template.", whereLocal: "the plans folder on this Mac ({folder})",
  whereRepo: "your private plans repo on GitHub", openRepo: "Open the plans repo",
  privateHead: "Plans stay private", privateText: "They open in the live launcher on your PC, and on GitHub. The backup never carries them.", tryLive: "Try the live launcher",
  brokenHead: "This plan has a problem", brokenText: "{file} can't show until it's fixed{n}:", brokenN: " ({n} problems)", openOnGithub: "Open the file on GitHub",
  sync_local_bad: "This Mac's plans folder can't be read", sync_local: "From this Mac's copy · changed {ago}", sync_off: "Plans sync is off on the PC",
  sync_offline_at: "GitHub can't be reached · synced {ago}", sync_offline: "GitHub can't be reached yet", sync_error_at: "Sync failed · showing the copy from {ago}",
  sync_error: "Plans couldn't sync from GitHub", sync_wait: "Syncing from GitHub…", sync_ok: "Synced from GitHub · {ago}", sync_last: "Last synced at {clock}.",
  sync_head: "GitHub {head} · checked {ago}", sync_folder: "Folder: {folder}", sync_short_ok: "Synced {ago}", sync_short_local: "This Mac · {ago}",
  justNow: "just now", minAgo: "{n} min ago", hAgo: "{n} h ago", dAgo: "{n} d ago", never: "never", syncingToast: "Syncing from GitHub…", readingToast: "Reading this Mac's plans folder",
};
const AR = {
  plans: "الخطط", allPlans: "كل الخطط", lang: "English", langLabel: "اعرض الخطط بالإنجليزية",
  tab_overview: "نظرة عامة", tab_decisions: "القرارات", tab_money: "المال", tab_map: "خريطة النظام", tab_evidence: "الأدلة", tab_where: "أين توجد",
  tabsLabel: "أقسام هذه الخطة", viewMap: "الخريطة", viewDetails: "القائمة", viewLabel: "طريقة عرض الخطة", back: "رجوع", wholePlan: "الخطة كاملة",
  tapMap: "اضغط أي جزء من الخريطة", mapNeeds: "{n} تحتاجك", mapStopsOf: "{a} من {b} محطات منجزة", stationsAria: "{title}: {state}", ownMap: "تفتح خريطتها الخاصة",
  openDetails: "افتح التفاصيل", noStop: "في أي وقت", stopShort: "المحطة {n}", tapArea: "اضغط أي منطقة لتستكشفها", tapBlock: "اضغط أي جزء لتتعمّق",
  tapStep: "الخطوات: {n}، بالترتيب", zoomIn: "تكبير", zoomOut: "تصغير", recenter: "العودة إلى الوسط", fullscreen: "ملء الشاشة", arrowsNote: "الأسهم تتبع مسار الإطلاق.",
  st_done: "تم", st_now: "قيد العمل", st_todo: "لم يبدأ", stillMissing: "ما زال ينقص", alreadyDone: "تم بالفعل", updated: "حُدّثت {date}", stopsDone: "محطات منجزة", of: "{a} من {b}",
  nextAction: "الخطوة التالية", doingNow: "قيد التنفيذ الآن", nextForYou: "التالي لك", needYouShort: "{n} تحتاجك", needsYouShort: "{n} تحتاجك",
  launchLine: "مسار الإطلاق", whatNeedsYou: "ما يحتاجك", showAll: "عرض الكل ({n})", toSettle1: "قرار واحد للحسم", toSettle: "قرارات للحسم: {n}",
  nothingWaits: "لا شيء ينتظرك الآن.", things: "العدد: {n}، بترتيب الإطلاق", thing1: "أمر واحد، بترتيب الإطلاق",
  layers: "الخطة في طبقات", partsN: "الأجزاء: {n}", part1: "جزء واحد", everything: "الكل", showParts: "توسيع الكل", foldParts: "طيّ الكل",
  liveOf: "{a} / {b} تعمل", allOfLayer: "كل {name}", byStatus: "اعرض الأجزاء حسب الحالة", partsByStatus: "الأجزاء حسب الحالة",
  noStops: "لا محطات بعد. مسار الإطلاق هو أقصر طريق للخطة، محطة بعد محطة.",
  noLayers: "لا طبقات بعد. جمّع أجزاء الخطة في طبقات، مثل «الواجهة» أو «ما تعمل عليه».", noParts: "لا أجزاء بعد.",
  lineLabel: "مسار الإطلاق", keyLabel: "معنى المحطات", stopAria: "المحطة {n}، {title}: {state}. {who}.",
  eye_decisions: "القرارات", settleFirst: "احسم هذه أولاً", openSettled: "مفتوحة: {o} · محسومة: {s}", settledN: "محسومة: {s}",
  recentlySettled: "حُسم مؤخراً", stillOpen: "ما زال مفتوحاً", before: "قبل", now: "الآن", pick: "الاختيار", decisionN: "القرار {n} من {total}",
  eye_money: "المال", whatItCosts: "التكلفة", perMonth: "{cur} شهرياً", byStage: "حسب المرحلة", onEachSale: "على كل عملية بيع", appByApp: "تطبيقاً بتطبيق",
  everyMonth: "كل شهر", yearlyOrOnce: "سنوياً أو مرة واحدة", perSale: "على كل عملية بيع", costTable: "التكلفة الشهرية حسب المرحلة", stage: "المرحلة", total: "المجموع", madeOf: "تتكوّن من",
  aMonth: "شهرياً", plus: "زائد",
  eye_map: "خريطة النظام", partsInLayers: "الأجزاء: {p} · الطبقات: {l}",
  eye_evidence: "الأدلة", checked: "ما تم فحصه", latest: "آخر الأخبار، {date}", warning: "(تنبيه)",
  eye_where: "أين توجد", whereItLives: "أين توجد", seeOnGithub: "اعرضها على GitHub", planFile: "ملف الخطة",
  progress: "التقدّم", whatsDone: "ما تم", whatsMissing: "ما ينقص", notedIn: "مذكورة في", openInPlan: "افتحها في الخطة", addNote: "أضف ملاحظة",
  addNoteHint: "يفتح ملف الخطة على GitHub عند هذا الجزء", partOf: "{layer} · الجزء {at} من {n}", stopOf: "المحطة {n} من {total} · {plan}",
  itsParts: "أجزاؤها", noPartsTied: "لا أجزاء مرتبطة بهذه المحطة.", close: "إغلاق", stepsDoneOf: "تم {a} من {b}",
  changedSub: "التغييرات: {n} · آخر نظرة {ago}", changedSub1: "تغيير واحد · آخر نظرة {ago}", changed: "تغيّر منذ آخر نظرة", changedN: "تغييرات منذ آخر نظرة: {n}", changed1: "تغيير واحد منذ آخر نظرة", gotIt: "تمام",
  ch_stop: "المحطة {n}", ch_part: "جزء · {layer}", ch_decision: "قرار", ch_next: "الخطوة التالية", isNew: "جديد", isGone: "حُذف", changedTag: "تغيّر",
  syncNow: "زامن الآن", syncNowLong: "زامن مع GitHub الآن", readAgain: "اقرأ المجلد مجدداً",
  offlineHead: "تعذّر الوصول إلى GitHub.", errorHead: "لم ينجح آخر تزامن.", copyFrom: "هذه النسخة من آخر تزامن {when}. تتحدّث تلقائياً عندما يستجيب GitHub.",
  nothingSynced: "لم يتم أي تزامن بعد.", tryAgain: "حاول مجدداً",
  problemHead: "آخر تعديل على هذه الخطة فيه مشكلة،", problemRest: "لذا هذه آخر نسخة سليمة.", andMore: "(ومشاكل أخرى: {n})", openFile: "افتح الملف",
  noPlanCalled: "لم تعد هناك خطة باسم «{id}».",
  libTitle: "الخطط", libSub: "خطط عمل حيّة تتحدّث من GitHub.", openPlan: "افتح الخطة", newPlan: "خطة جديدة", fromTemplate: "من القالب",
  libStops: "{a} من {b} محطات", noStopsYet: "لا محطات بعد", nothingNeedsYou: "لا شيء يحتاجك", updatedShort: "حُدّثت {date}", hasProblem: "فيها مشكلة: {line}",
  newPlanHead: "خطة جديدة", newPlanName: "الاسم", newPlanFile: "الملف", newPlanHelp: "يفتح GitHub والخطة الجديدة جاهزة. اضغط Commit changes وستظهر هنا خلال 5 دقائق.",
  newPlanGo: "افتح GitHub", newPlanNoName: "اكتب اسماً أولاً.", newPlanTaken: "توجد خطة بهذا الاسم.", newPlanPlaceholder: "إطلاق المتجر",
  emptyHead: "ابدأ بخريطة واضحة.", emptyBody: "تضم الخطة مسار الإطلاق والقرارات والتكاليف والأجزاء. أضفها إلى ملف الخطة وستظهر هنا خلال 5 دقائق.",
  emptyEdit: "عدّل الخطة على GitHub",
  loading: "جارٍ تحميل الخطط", didntLoad: "لم تُحمّل الخطط", noPlans: "لا خطط بعد", syncOff: "تزامن الخطط متوقف هنا", fetching: "جارٍ جلب خططك من GitHub",
  syncOffText: "هذا المشغّل لا يزامن الخطط{why}. مشغّل الحاسوب يفعل.", fetchingText: "الحاسوب يجلبها الآن. ستظهر هنا بعد لحظات.",
  noPlansText: "الخطة ملف واحد في {where}. اطلب من Claude إضافة خطة، أو ابدأ واحدة من القالب.", whereLocal: "مجلد الخطط على هذا الماك ({folder})",
  whereRepo: "مستودع الخطط الخاص بك على GitHub", openRepo: "افتح مستودع الخطط",
  privateHead: "الخطط تبقى خاصة", privateText: "تُفتح في المشغّل على حاسوبك وعلى GitHub. النسخة الاحتياطية لا تحملها أبداً.", tryLive: "جرّب المشغّل المباشر",
  brokenHead: "في هذه الخطة مشكلة", brokenText: "لا يمكن عرض {file} حتى تُصلح{n}:", brokenN: " (المشاكل: {n})", openOnGithub: "افتح الملف على GitHub",
  sync_local_bad: "تعذّرت قراءة مجلد الخطط على هذا الماك", sync_local: "من نسخة هذا الماك · تغيّرت {ago}", sync_off: "تزامن الخطط متوقف على الحاسوب",
  sync_offline_at: "تعذّر الوصول إلى GitHub · آخر تزامن {ago}", sync_offline: "تعذّر الوصول إلى GitHub بعد", sync_error_at: "فشل التزامن · النسخة المعروضة من {ago}",
  sync_error: "تعذّر تزامن الخطط مع GitHub", sync_wait: "جارٍ التزامن مع GitHub…", sync_ok: "متزامنة مع GitHub · {ago}", sync_last: "آخر تزامن الساعة {clock}.",
  sync_head: "GitHub {head} · فُحصت {ago}", sync_folder: "المجلد: {folder}", sync_short_ok: "متزامنة {ago}", sync_short_local: "هذا الماك · {ago}",
  justNow: "الآن", minAgo: "قبل {n}", hAgo: "قبل {n}", dAgo: "قبل {n}", never: "أبداً", syncingToast: "جارٍ التزامن مع GitHub…", readingToast: "جارٍ قراءة مجلد الخطط على هذا الماك",
};
export const TEXT = { en: EN, ar: AR };
// t("of", {a: 2, b: 8}) -> "2 of 8". A missing Arabic line falls back to the English one, never to the key.
export function text(lang = "en") {
  const table = TEXT[lang] || EN;
  return (key, vars = {}) => String(table[key] ?? EN[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}
export const langOf = (saved, navLang = "") => (saved === "ar" || saved === "en" ? saved : String(navLang).toLowerCase().startsWith("ar") ? "ar" : "en");

// ---------- dates and times ----------
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const month = (i, lang) => (lang === "ar" ? MONTHS_AR : MONTHS)[i];
export function longDate(iso, lang = "en") {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[3])} ${month(Number(m[2]) - 1, lang)} ${m[1]}` : String(iso || "");
}
export function shortDate(iso, lang = "en") {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[3])} ${month(Number(m[2]) - 1, lang)}` : String(iso || "");
}
// Arabic counts: one, two, three to ten, then eleven and up ("دقيقة", "دقيقتين", "5 دقائق", "15 دقيقة").
const AR_UNIT = { min: ["دقيقة", "دقيقتين", "دقائق"], h: ["ساعة", "ساعتين", "ساعات"], d: ["يوم", "يومين", "أيام"] };
const arCount = (n, [one, two, few]) => (n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${one}`);

// "just now", "4 min ago", "3 h ago", "2 d ago", then the date. Times are seconds or milliseconds.
export function since(t, now = Date.now(), lang = "en") {
  const ar = lang === "ar";
  if (!t) return ar ? AR.never : EN.never;
  const ms = t < 2e10 ? t * 1000 : t;
  const s = Math.max(0, (now - ms) / 1000);
  if (s < 60) return ar ? AR.justNow : EN.justNow;
  const unit = s < 3600 ? ["min", Math.floor(s / 60)] : s < 86400 ? ["h", Math.floor(s / 3600)] : s < 86400 * 7 ? ["d", Math.floor(s / 86400)] : null;
  if (unit) return ar ? `قبل ${arCount(unit[1], AR_UNIT[unit[0]])}` : `${unit[1]} ${unit[0] === "min" ? "min" : unit[0]} ago`;
  const d = new Date(ms);
  return `${d.getDate()} ${month(d.getMonth(), lang)}`;
}
export function clock(t) {
  const d = new Date(t < 2e10 ? t * 1000 : t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
// "at 10:24" today, else "on 27 Oct, 10:24": when the cached copy was synced.
export function stamp(t, now = Date.now(), lang = "en") {
  const d = new Date(t < 2e10 ? t * 1000 : t), today = new Date(now);
  const same = d.toDateString() === today.toDateString();
  if (lang === "ar") return same ? `الساعة ${clock(t)}` : `${d.getDate()} ${month(d.getMonth(), lang)}، ${clock(t)}`;
  return same ? `at ${clock(t)}` : `on ${d.getDate()} ${month(d.getMonth(), lang)}, ${clock(t)}`;
}

// Where the plan came from and how fresh it is: {text, tone, title}. tone: ok, local, wait, warn, bad, off.
export function syncLine(sync, entry, now = Date.now(), lang = "en") {
  const t = text(lang), ago = (x) => since(x, now, lang);
  const s = sync || {};
  if (s.source === "local") {
    if (s.state === "error") return { text: t("sync_local_bad"), tone: "bad", title: s.detail || "" };
    return { text: t("sync_local", { ago: ago(entry?.changed_at) }), tone: "local", title: s.folder ? t("sync_folder", { folder: s.folder }) : "" };
  }
  if (s.source === "off" || s.state === "off") return { text: t("sync_off"), tone: "off", title: s.detail || "" };
  const at = s.synced_at;
  if (s.state === "offline") {
    return at ? { text: t("sync_offline_at", { ago: ago(at) }), tone: "warn", title: `${t("sync_last", { clock: clock(at) })} ${s.detail || ""}`.trim() }
      : { text: t("sync_offline"), tone: "warn", title: s.detail || "" };
  }
  if (s.state === "error") {
    return at ? { text: t("sync_error_at", { ago: ago(at) }), tone: "bad", title: s.detail || "" }
      : { text: t("sync_error"), tone: "bad", title: s.detail || "" };
  }
  if (!at) return { text: t("sync_wait"), tone: "wait", title: "" };
  // a sync that stopped answering for over three rounds is not "synced" any more: say how old it is, calmly
  const late = s.every && (now - at * 1000) > s.every * 1000 * 3 + 60e3;
  return { text: t("sync_ok", { ago: ago(at) }), tone: late ? "warn" : "ok", title: s.head ? t("sync_head", { head: s.head, ago: ago(s.checked_at || at) }) : "" };
}
// The same in a few words, for the plan's bar on a phone: "Synced 2 min ago", "This Mac · 15 min ago".
export function syncShort(sync, entry, now = Date.now(), lang = "en") {
  const line = syncLine(sync, entry, now, lang), t = text(lang), s = sync || {};
  if (s.source === "local" && line.tone === "local") return { ...line, text: t("sync_short_local", { ago: since(entry?.changed_at, now, lang) }) };
  if (line.tone === "ok") return { ...line, text: t("sync_short_ok", { ago: since(s.synced_at, now, lang) }) };
  return line;
}

// The progress ring: a circle of radius r, one arc for the stops done, a dimmer one for the stops being done now.
export function ring(done, now, total, r = 52) {
  const c = 2 * Math.PI * r;
  if (!total) return { c, done: 0, now: 0, nowOffset: 0 };
  const d = (Math.min(done, total) / total) * c;
  const n = (Math.min(now, total - Math.min(done, total)) / total) * c;
  return { c, done: d, now: n, nowOffset: -d };
}

// Cost bars: each stage stacks its segments at their middle value; the same label keeps one colour everywhere.
export function costBars(costs, palette = 8) {
  const stages = costs?.stages || [];
  const colour = new Map();
  for (const st of stages) for (const g of st.segments || []) if (!g.extra && !colour.has(g.label)) colour.set(g.label, colour.size % palette);
  const mid = (g) => (Number(g.low) + Number(g.high)) / 2;
  const sums = stages.map((st) => (st.segments || []).reduce((a, g) => a + mid(g), 0));
  const max = Math.max(1, ...sums);
  const rows = stages.map((st, i) => {
    let at = 0;
    const segs = (st.segments || []).map((g) => {
      const v = mid(g);
      const seg = { label: g.label, low: g.low, high: g.high, note: g.note || "", extra: !!g.extra, value: v,
        colour: g.extra ? -1 : colour.get(g.label), from: (at / max) * 100, pct: (v / max) * 100 };
      at += v;
      return seg;
    });
    return { id: st.id, label: st.label, total: st.total, sum: sums[i], segs, tiny: sums[i] / max < 0.03 };
  });
  const legend = [...colour.entries()].map(([label, i]) => ({ label, colour: i }));
  if (stages.some((st) => (st.segments || []).some((g) => g.extra))) legend.push({ label: stages.flatMap((st) => st.segments || []).find((g) => g.extra).label, colour: -1 });
  return { max, rows, legend };
}
export function money(low, high, currency = "USD") {
  const f = (v) => (Number.isInteger(Number(v)) ? String(v) : Number(v).toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
  const sign = currency === "USD" ? "$" : "";
  const tail = sign ? "" : ` ${currency}`;
  return low === high ? `${sign}${f(low)}${tail}` : `${sign}${f(low)}–${f(high)}${tail}`;
}
// "about $55–65 a month" -> the figure itself, "$55–65", for the big number over a cost column; the words go under it.
export function costFigure(total) {
  const m = String(total || "").match(/(?:[$€£]\s?)?\d[\d.,]*(?:\s?[–-]\s?\d[\d.,]*)?(?:\s?(?:USD|EGP|KWD|%))?/);
  return m ? m[0].replace(/\s?-\s?/, "–") : String(total || "");
}

// ---------- where the page goes ----------
export const LIBRARY = "_all"; // never a plan id: ids are lowercase words joined by hyphens
export const TABS = ["overview", "decisions", "money", "map", "evidence", "where"];
export const VIEW = "view"; // the map view: one big map you tap into
// The tab in the address, else his last choice (the map or the details).
export const tabOf = (seg, fallback = "overview") => (TABS.includes(seg) || seg === VIEW ? seg : fallback);
export const href = (id, tab = "") => `#/plans/${encodeURIComponent(id)}${tab ? `/${tab}` : ""}`;

// Which plan the page shows: the one in the address, else the only one, else none (the list of plans).
export function pick(plans, id) {
  const list = plans || [];
  if (id === LIBRARY) return null;
  if (id) return list.find((p) => p.id === id) || null;
  return list.length === 1 ? list[0] : null;
}

// Every part of every plan, for the launcher's search.
export function searchParts(plans, q) {
  q = String(q || "").trim().toLowerCase();
  if (!q) return [];
  const score = (text) => {
    text = String(text || "").toLowerCase();
    if (!text) return 0;
    if (text.startsWith(q)) return 3;
    if (text.split(/[\s\-·/,]+/).some((w) => w.startsWith(q))) return 2;
    return text.includes(q) ? 1 : 0;
  };
  const out = [];
  for (const entry of plans || []) {
    const plan = entry.plan;
    if (!plan) continue;
    for (const layer of plan.layers || []) {
      for (const part of layer.parts || []) {
        const s = Math.max(score(part.title) * 2, score(part.summary) * 0.6, score(part.purpose) * 0.6, score(layer.name) * 0.5,
          ...(part.missing || []).map((m) => score(m) * 0.4));
        if (s) out.push({ kind: "part", s: s + (part.status === "needs-you" ? 0.5 : 0), plan: entry.id, planTitle: plan.title, layer: layer.name, part });
      }
    }
  }
  return out.sort((a, b) => b.s - a.s).slice(0, 12);
}

// The parts of one stop, in plan order, and the stop each part sits on.
export function partsOfStop(plan, n) {
  return (plan?.layers || []).flatMap((l) => (l.parts || []).filter((p) => p.stop === n).map((p) => ({ part: p, layer: l })));
}
export function findPart(plan, id) {
  for (const layer of plan?.layers || []) for (const part of layer.parts || []) if (part.id === id) return { part, layer };
  return null;
}

// ---------- what the page derives ----------
// A part's own steps: how many are done, and which one is being worked on (the first not done).
export function steps(part) {
  const list = Array.isArray(part?.steps) ? part.steps : [];
  const current = list.findIndex((s) => !s.done);
  return { list, done: list.filter((s) => s.done).length, total: list.length, current };
}
// One layer at a glance: its counts in status order, and how many of its parts are live.
export function layerSummary(layer, order = WORDS.status_order) {
  const counts = {};
  for (const p of layer?.parts || []) counts[p.status] = (counts[p.status] || 0) + 1;
  return { counts, kinds: order.filter((k) => counts[k]), live: counts.live || 0, total: (layer?.parts || []).length };
}
// The plan's one next action: the server's (core/plans.py derive), else the first part that needs him.
export function nextOf(entry) {
  const d = entry?.derived;
  if (d && "next" in d) return d.next || null;
  const n = d?.needs_you?.[0];
  return n ? { text: n.title, note: n.ask, part: n.part, from: "needs" } : null;
}
// "Spec, PR #12 · Launch notes, 3 Mar" -> one row each, linked when the plan says where it lives.
export function notedIn(source, sources = []) {
  const norm = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}#]+/gu, " ").trim();
  const prs = (s) => String(s || "").match(/PR #\d+/gi)?.map((x) => x.toUpperCase()) || [];
  return String(source || "").split(/\s+·\s+/).map((s) => s.trim()).filter(Boolean).map((line) => {
    const head = norm(line.split(",")[0]);
    const mine = prs(line);
    const hit = sources.find((src) => {
      const label = norm(src.label);
      return (head.length > 3 && (label.startsWith(head) || head.startsWith(label)))
        || (mine.length && prs(`${src.label} ${src.where}`).some((p) => mine.includes(p)));
    });
    return { text: line, url: hit?.url || "", source: hit || null };
  });
}
// The plan file on GitHub at one part's line (the server finds the line), for "Add note".
export function partFileUrl(entry, partId) {
  if (!entry?.file_url) return "";
  const line = entry.lines?.[partId];
  return line ? `${entry.file_url}#L${line}` : entry.file_url;
}
export const editUrl = (fileUrl) => String(fileUrl || "").replace("/blob/", "/edit/");

// What changed since his last look, as the page says it: the words before and after, by kind.
export function changeWords(c, w) {
  const table = { stop: w.stop, part: w.status, decision: w.decision }[c.kind];
  const say = (v) => (v == null ? null : table ? table[v] || v : v);
  return { before: say(c.before), after: say(c.after) };
}
// Which stops and parts changed, so the overview can mark them.
export function changedIds(changes) {
  const out = { stops: new Set(), parts: new Set(), decisions: new Set() };
  for (const c of changes || []) {
    if (c.kind === "stop") out.stops.add(String(c.id));
    else if (c.kind === "part") out.parts.add(c.id);
    else if (c.kind === "decision") out.decisions.add(c.id);
  }
  return out;
}

// ---------- the map view: the whole plan, then a layer, a stop or a part, each one a lit line to tap into ----------
// "l.front-door" a layer, "s.4" a stop, "p.domain" a part; anything else is the whole plan.
export function mapNode(node) {
  const m = String(node || "").match(/^([lsp])\.(.+)$/);
  return m ? { kind: { l: "layer", s: "stop", p: "part" }[m[1]], id: m[2] } : { kind: "plan", id: "" };
}
export const mapHref = (id, kind = "", key = "") => `${href(id, VIEW)}${kind ? `/${kind[0]}.${encodeURIComponent(key)}` : ""}`;
// One level up: a part goes to its layer, a layer or a stop to the whole plan, the whole plan to nowhere.
export function mapUp(plan, node) {
  const n = mapNode(node);
  if (n.kind === "part") {
    const hit = findPart(plan, n.id);
    return hit ? `l.${hit.layer.id}` : "";
  }
  return n.kind === "plan" ? null : "";
}
// Parts in launch order: by their stop, then as the plan lists them; parts on no stop come last.
export function byStop(parts) {
  return (parts || []).map((p, i) => ({ p, i })).sort((a, b) => (a.p.stop ?? 999) - (b.p.stop ?? 999) || a.i - b.i).map((x) => x.p);
}
// A part's own map: its steps when it has them, else what exists (done) and then what is still missing.
export function partStations(part) {
  const st = steps(part);
  if (st.total) return st.list.map((s, i) => ({ text: s.text, state: s.done ? "done" : i === st.current ? "now" : "todo" }));
  return [...(part?.exists || []).map((x) => ({ text: x, state: "done" })), ...(part?.missing || []).map((x) => ({ text: x, state: "todo" }))];
}

// The map's areas in launch order: each layer by the first stop any of its parts is on (then as the plan lists
// them; layers on no stop last), numbered 1, 2, 3. The arrows between areas follow this order, the launch line's.
export function areaOrder(plan) {
  const first = (l) => Math.min(...(l.parts || []).map((p) => (p.stop == null ? Infinity : p.stop)));
  return (plan?.layers || []).map((l, i) => ({ layer: l, i, at: first(l) })).sort((a, b) => a.at - b.at || a.i - b.i)
    .map((x, k) => ({ layer: x.layer, n: k + 1, onLine: Number.isFinite(x.at) }));
}
// Where the map draws node i in a grid of `cols` columns: rows run like a snake, left to right, then right to left.
export function snakeAt(i, cols) {
  const r = Math.floor(i / cols), k = i % cols;
  return { r: r + 1, c: (r % 2 ? cols - 1 - k : k) + 1 };
}
// The area the map lights: the one holding the next action's part, else the first with something that needs him.
export function focusLayer(plan, next) {
  const hit = next?.part && findPart(plan, next.part);
  if (hit) return hit.layer.id;
  return (plan?.layers || []).find((l) => (l.parts || []).some((p) => p.status === "needs-you"))?.id || "";
}

// ---------- a new plan, made on GitHub ----------
export function slugify(title) {
  return String(title || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
}
// GitHub's "new file" page with the plan typed in from the template: {id, url, problem}. One tap on Commit makes it.
export function newPlan(repoUrl, template, title, today, taken = []) {
  const name = String(title || "").trim();
  if (!name) return { id: "", url: "", problem: "newPlanNoName" };
  // a name with no Latin letters (an Arabic one) gets the date and a short mark of the name, so two never clash
  const mark = [...name].reduce((h, ch) => ((h * 31) + ch.codePointAt(0)) >>> 0, 7).toString(36).slice(-4);
  const id = slugify(name) || `plan-${today}-${mark}`;
  if (taken.includes(id)) return { id, url: "", problem: "newPlanTaken" };
  const plan = { ...(template || { schema: 1 }), id, title: name.slice(0, 80), updated: today };
  const json = `${JSON.stringify(plan, null, 2)}\n`;
  const base = String(repoUrl || "").replace(/\/+$/, "");
  return { id, json, url: `${base}/new/main?filename=${encodeURIComponent(`plans/${id}.json`)}&value=${encodeURIComponent(json)}`, problem: "" };
}
