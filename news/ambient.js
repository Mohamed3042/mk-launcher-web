// The page is lit by the picture on show, the way MK Cinema lights its home: the billboard's picture is drawn
// 48 x 27 on a canvas that news.css stretches, blurs and lays under the top of the page as a soft wash of its
// colours. A tiny canvas costs nothing to scale or blur, even on a phone, and a picture from another site can
// still be drawn (the canvas is only shown, never read).
const W = 48, H = 27;

export function createAmbient(host) {
  const canvas = host.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  let current = "", token = 0;
  function draw(img) {
    const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight); // cover, like the picture itself
    const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  }
  return {
    light(url) {
      if (!url || url === current) return;
      current = url;
      const mine = ++token;
      const img = new Image();
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.onload = () => {
        if (mine !== token) return;
        draw(img);
        host.classList.add("lit");
      };
      img.onerror = () => { if (mine === token) current = ""; };
      img.src = url;
    },
    dim(on) { host.classList.toggle("dim", on); },
  };
}
