// Sideways rows. Every row is a native scroller (momentum and snap on a phone, the trackpad on a Mac); on a
// desktop the paddles page it by one view. The row's classes (can-prev, can-next) show or hide the paddles.
const reduced = matchMedia("(prefers-reduced-motion: reduce)");

export function mountRows(root) {
  for (const row of root.querySelectorAll("[data-row]")) {
    const track = row.querySelector(".track");
    if (!track || track.dataset.mounted) continue;
    track.dataset.mounted = "1";
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = track.scrollWidth - track.clientWidth - 2;
      const atStart = track.scrollLeft <= 2;
      const atEnd = max <= 0 || track.scrollLeft >= max;
      row.classList.toggle("can-prev", !atStart);
      row.classList.toggle("can-next", !atEnd);
      row.classList.toggle("overflows", max > 0);
      for (const b of row.querySelectorAll('[data-act="page"]')) b.disabled = Number(b.dataset.dir) < 0 ? atStart : atEnd;
    };
    track.addEventListener("scroll", () => { if (!frame) frame = requestAnimationFrame(update); }, { passive: true });
    new ResizeObserver(update).observe(track);
    update();
  }
}

export function page(row, dir) {
  const track = row?.querySelector(".track");
  if (!track) return;
  const style = getComputedStyle(track);
  const pad = parseFloat(style.scrollPaddingLeft) || parseFloat(style.paddingLeft) || 0;
  const step = Math.max(160, track.clientWidth - pad * 2);
  track.scrollBy({ left: dir * step, behavior: reduced.matches ? "auto" : "smooth" });
}

// The white pill under the open tab (or the pressed button of a segmented control) slides to it.
export function syncInk(group) {
  if (!group) return;
  const ink = group.querySelector(":scope > .ink");
  const on = group.querySelector(':scope > [aria-current="page"], :scope > [aria-pressed="true"]');
  if (!ink) return;
  if (!on || !on.offsetWidth) { ink.style.opacity = "0"; return; }
  ink.style.opacity = "1";
  ink.style.setProperty("--x", `${on.offsetLeft}px`);
  ink.style.setProperty("--w", `${on.offsetWidth}px`);
  if (!group.classList.contains("ready")) requestAnimationFrame(() => group.classList.add("ready"));
}
