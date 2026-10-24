// MK News icons. Outline icons are Lucide (ISC licence, see /vendor/LUCIDE-LICENSE.txt); the filled sparkle,
// house, bookmark and reel are drawn here so the one action that matters (Ask Claude) and the open tab read as solid.
const OUTLINE = {
  search: '<circle cx="11" cy="11" r="7.5"/><path d="m20.5 20.5-4.2-4.2"/>',
  home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  topics: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 9h2"/><path d="M8 13h8"/><path d="M8 17h8"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
  "chevron-left": '<path d="m15 18-6-6 6-6"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  lightbulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  external: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  grid: '<rect width="7" height="7" x="3" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="14" rx="1.5"/><rect width="7" height="7" x="3" y="14" rx="1.5"/>',
  github: '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  reels: '<rect width="16" height="20" x="4" y="2" rx="3"/><path d="m10 8.5 5 3.5-5 3.5Z"/>',
  settings: '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  "settings-fill": '<path d="M20 7h-9" stroke-width="2.4"/><path d="M14 17H5" stroke-width="2.4"/><circle cx="17" cy="17" r="3" fill="currentColor"/><circle cx="7" cy="7" r="3" fill="currentColor"/>',
  offline: '<path d="M12 20h.01"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/><path d="M5 12.86a10 10 0 0 1 5.17-2.69"/><path d="M19 12.86a10 10 0 0 0-2-1.43"/><path d="M2 8.82a15 15 0 0 1 4.18-2.65"/><path d="M22 8.82a15 15 0 0 0-11.29-3.76"/><path d="m2 2 20 20"/>',
};
const FILLED = {
  sparkle: '<path d="M12 1.8c.55 5.2 2.95 8.65 10.2 10.2-7.25 1.55-9.65 5-10.2 10.2-.55-5.2-2.95-8.65-10.2-10.2C9.05 10.45 11.45 7 12 1.8Z"/>',
  "home-fill": '<path d="M2.6 10.1 11.06 2.8a1.45 1.45 0 0 1 1.88 0l8.46 7.3c.38.33.6.8.6 1.3V20a2 2 0 0 1-2 2h-4.6v-6.2a1.3 1.3 0 0 0-1.3-1.3h-4.2a1.3 1.3 0 0 0-1.3 1.3V22H4a2 2 0 0 1-2-2v-8.6c0-.5.22-.97.6-1.3Z"/>',
  "bookmark-fill": '<path d="M7 2.5h10A2.5 2.5 0 0 1 19.5 5v16.2a.8.8 0 0 1-1.2.7L12 18.3l-6.3 3.6a.8.8 0 0 1-1.2-.7V5A2.5 2.5 0 0 1 7 2.5Z"/>',
  "topics-fill": '<path d="M6 1.5h8.6c.53 0 1.04.21 1.41.59l4.4 4.4c.38.37.59.88.59 1.41V20A2.5 2.5 0 0 1 18.5 22.5h-12.5A2.5 2.5 0 0 1 3.5 20V4A2.5 2.5 0 0 1 6 1.5Zm2 7.75a.75.75 0 0 0 0 1.5h2a.75.75 0 0 0 0-1.5Zm0 4a.75.75 0 0 0 0 1.5h8a.75.75 0 0 0 0-1.5Zm0 4a.75.75 0 0 0 0 1.5h8a.75.75 0 0 0 0-1.5Z"/>',
  star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
  up: '<path d="M12 4.5 20.5 18h-17Z"/>',
  "reels-fill": '<path fill-rule="evenodd" d="M7 1.5h10A3.5 3.5 0 0 1 20.5 5v14a3.5 3.5 0 0 1-3.5 3.5H7A3.5 3.5 0 0 1 3.5 19V5A3.5 3.5 0 0 1 7 1.5Zm2.6 7.3v6.4a.7.7 0 0 0 1.1.57l4.6-3.2a.7.7 0 0 0 0-1.14l-4.6-3.2a.7.7 0 0 0-1.1.57Z"/>',
  dot: '<circle cx="12" cy="12" r="6"/>',
};

export function icon(name, cls = "") {
  if (FILLED[name]) return `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">${FILLED[name]}</svg>`;
  return `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${OUTLINE[name] || ""}</svg>`;
}
