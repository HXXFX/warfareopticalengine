/**
 * util.js — small math / pixel helpers shared by every stage.
 *
 * Nothing in here knows about the UI. If you need a helper in more than one
 * stage, it belongs in this file.
 */

/* ------------------------------------------------------------------ *
 * Scalar math
 * ------------------------------------------------------------------ */

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Classic smoothstep. Returns 0 below e0, 1 above e1, eased in between. */
export function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/**
 * Anti-aliased edge test used by the pixel-shape coverage functions.
 * `d` is a signed distance (positive = inside), `aa` is the softness width.
 * Returns coverage 0..1.
 */
export function smoothEdge(d, aa) {
  if (aa <= 0) return d > 0 ? 1 : 0;
  return clamp01(d / aa + 0.5);
}

/* ------------------------------------------------------------------ *
 * Deterministic noise
 *
 * Everything random in this app is derived from these two functions so that
 * the low-res preview and the full-resolution export produce the *same*
 * texture for the same seed. Never use Math.random() inside a stage.
 * ------------------------------------------------------------------ */

/** Integer hash -> float in [0, 1). Stable across preview and export. */
export function hash2i(x, y, seed) {
  let h =
    Math.imul(x | 0, 374761393) +
    Math.imul(y | 0, 668265263) +
    Math.imul(seed | 0, 1442695041);
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/**
 * Smooth 2D value noise in [0, 1).
 * `cell` is the size of one noise cell in pixels — bigger cell = coarser,
 * clumpier structure (which is what makes grain look like film rather than
 * like TV static).
 */
export function valueNoise2D(x, y, cell, seed) {
  const fx = x / cell;
  const fy = y / cell;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);

  const a = hash2i(x0, y0, seed);
  const b = hash2i(x0 + 1, y0, seed);
  const c = hash2i(x0, y0 + 1, seed);
  const d = hash2i(x0 + 1, y0 + 1, seed);

  return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
}

/* ------------------------------------------------------------------ *
 * Colour
 * ------------------------------------------------------------------ */

/** Rec.709 relative luminance from 0..255 channels, returned as 0..255. */
export const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/* ------------------------------------------------------------------ *
 * ImageData
 * ------------------------------------------------------------------ */

export function createImage(w, h) {
  return new ImageData(w, h);
}

export function cloneImage(img) {
  const out = new ImageData(img.width, img.height);
  out.data.set(img.data);
  return out;
}

/**
 * Bilinear sample with edge clamping. Writes r,g,b,a into `out` (length >= 4).
 * Used by the lens stage; kept generic so any future warp can reuse it.
 */
export function sampleBilinear(data, w, h, x, y, out) {
  const cx = clamp(x, 0, w - 1.001);
  const cy = clamp(y, 0, h - 1.001);
  const x0 = cx | 0;
  const y0 = cy | 0;
  const x1 = x0 + 1 < w ? x0 + 1 : x0;
  const y1 = y0 + 1 < h ? y0 + 1 : y0;
  const tx = cx - x0;
  const ty = cy - y0;

  const i00 = (y0 * w + x0) << 2;
  const i10 = (y0 * w + x1) << 2;
  const i01 = (y1 * w + x0) << 2;
  const i11 = (y1 * w + x1) << 2;

  for (let c = 0; c < 4; c++) {
    const top = data[i00 + c] + (data[i10 + c] - data[i00 + c]) * tx;
    const bot = data[i01 + c] + (data[i11 + c] - data[i01 + c]) * tx;
    out[c] = top + (bot - top) * ty;
  }
}

/**
 * A "reference pixel" scale factor.
 *
 * Effects like grain and noise have a *physical* size — on a 4000px export the
 * grain should be proportionally the same size as on the 1200px preview,
 * otherwise the preview lies. Every stage that draws texture multiplies its
 * cell size by this so the look is resolution independent.
 */
export function refScale(width, height) {
  return Math.max(width, height) / 1400;
}
