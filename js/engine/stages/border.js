/**
 * border.js — the white photographic border.
 *
 * Runs LAST, and it is the only stage that changes the canvas size: the border
 * is added *around* the frame rather than eaten out of it, so turning it on
 * never crops the picture.
 *
 * Width is a percentage of the SHORT edge, which keeps the band visually equal
 * on all four sides whatever the aspect ratio.
 *
 * The optional keyline is the thin dark rule sitting just inside the white in
 * the reference frames — it stops the highlights bleeding into the paper and
 * is most of what makes a border read as a darkroom print.
 */

export const id = 'border';
export const params = ['border', 'borderWidth', 'borderKeyline'];

/** Border width at slider 100, as a fraction of the short edge. */
const MAX_WIDTH = 0.14;

export function isActive(p) {
  return p.border && p.borderWidth > 0;
}

/** Band width in pixels for a given frame size. */
function bandWidth(w, h, p) {
  return Math.max(1, Math.round(Math.min(w, h) * MAX_WIDTH * (p.borderWidth / 100)));
}

/**
 * How this stage changes the canvas size.
 *
 * The pipeline uses this to work out the final dimensions WITHOUT rendering,
 * so the viewer can reserve the right amount of screen space for a cheap draft
 * preview. Any future stage that resizes the canvas should export one of these.
 */
export function outputSize(w, h, p) {
  if (!isActive(p)) return { width: w, height: h };
  const b = bandWidth(w, h, p);
  return { width: w + b * 2, height: h + b * 2 };
}

export function apply(img, p) {
  if (!isActive(p)) return img;

  const W = img.width;
  const H = img.height;

  const b = bandWidth(W, H, p);
  const outW = W + b * 2;
  const outH = H + b * 2;

  const out = new ImageData(outW, outH);
  const dst = out.data;
  const src = img.data;

  // Paper.
  dst.fill(255);

  // Photo.
  for (let y = 0; y < H; y++) {
    let s = (y * W) << 2;
    let o = ((y + b) * outW + b) << 2;
    for (let x = 0; x < W; x++, s += 4, o += 4) {
      dst[o] = src[s];
      dst[o + 1] = src[s + 1];
      dst[o + 2] = src[s + 2];
      dst[o + 3] = 255;
    }
  }

  if (p.borderKeyline) {
    const thickness = Math.max(1, Math.round(b * 0.06));
    const gap = Math.max(1, Math.round(b * 0.2));
    strokeRect(dst, outW, outH, b - gap - thickness, thickness, 26);
  }

  return out;
}

/**
 * Draw a rectangular outline `inset` pixels in from the canvas edge.
 * `thickness` in pixels, `tone` is the grey level 0..255.
 */
function strokeRect(data, W, H, inset, thickness, tone) {
  const x0 = inset;
  const y0 = inset;
  const x1 = W - inset - 1;
  const y1 = H - inset - 1;
  if (x1 <= x0 || y1 <= y0) return;

  const put = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) << 2;
    data[o] = tone;
    data[o + 1] = tone;
    data[o + 2] = tone;
    data[o + 3] = 255;
  };

  for (let t = 0; t < thickness; t++) {
    for (let x = x0 + t; x <= x1 - t; x++) {
      put(x, y0 + t);
      put(x, y1 - t);
    }
    for (let y = y0 + t; y <= y1 - t; y++) {
      put(x0 + t, y);
      put(x1 - t, y);
    }
  }
}
