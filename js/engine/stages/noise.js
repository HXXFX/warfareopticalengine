/**
 * noise.js — black and white digital sensor noise.
 *
 * Deliberately the opposite of grain.js: no clumping, no smoothing, flat
 * response across the tonal range. This is the harsh speckle you get from a
 * small sensor pushed to a high ISO, and it is what makes the reference frames
 * read as "captured", not "filtered".
 *
 * The same delta is added to R, G and B so the speckle is always neutral grey
 * even when the saturation slider has left colour in the image.
 *
 * ── WHY THE CELL IS NOT ONE PIXEL ───────────────────────────────────
 * A truly per-pixel effect cannot look the same at two different resolutions:
 * render it into half as many pixels and scale the result up and it is twice
 * as coarse. That made noise visibly jump between the preview and the export.
 *
 * So the noise cell is sized in *reference* pixels via refScale(), exactly
 * like grain. Working through it, the grid index becomes
 *
 *     gx = floor(x / (refScale * CELL)) = floor(u * 1400 / CELL)
 *
 * where u is the normalised x position — the image size cancels out entirely.
 * The pattern is therefore a function of position within the frame, identical
 * at any resolution. CELL is kept slightly above 1 so a cell is always at
 * least a pixel or two wide and survives being resampled.
 * ────────────────────────────────────────────────────────────────────
 */

import { hash2i, refScale } from '../util.js';

export const id = 'noise';
export const params = ['noise', 'seed'];

/** Noise cell size in reference pixels. Below ~1.2 it starts to alias. */
const CELL = 1.5;

/** Fraction of pixels that clip to pure black or white at amount 100. */
const HOT_PIXEL_RATE = 0.035;

export function isActive(p) {
  return p.noise > 0;
}

/* As in grain.js, the raw field depends only on size and seed, so dragging
   the Noise slider does not have to re-hash every pixel. */
let cached = null;

/** Raw 0..1 noise value per pixel. */
function noiseField(W, H, seed) {
  if (cached && cached.W === W && cached.H === H && cached.seed === seed) {
    return cached.field;
  }

  const cell = refScale(W, H) * CELL;
  const field = new Float32Array(W * H);

  for (let y = 0, i = 0; y < H; y++) {
    const gy = (y / cell) | 0;
    for (let x = 0; x < W; x++, i++) {
      field[i] = hash2i((x / cell) | 0, gy, seed);
    }
  }

  cached = { W, H, seed, field };
  return field;
}

export function apply(img, p, ctx) {
  if (!isActive(p)) return img;

  const W = img.width;
  const H = img.height;
  const d = img.data;

  const field = noiseField(W, H, ctx.seed + 4242);
  const amount = p.noise / 100;
  const strength = amount * 110;
  const hotRate = amount * HOT_PIXEL_RATE;

  for (let i = 0, o = 0; i < field.length; i++, o += 4) {
    const r = field[i];

    if (r < hotRate) {
      // Hot / dead pixel: clip hard, ignore whatever was underneath.
      const v = r < hotRate * 0.5 ? 0 : 255;
      d[o] = v;
      d[o + 1] = v;
      d[o + 2] = v;
      continue;
    }

    // Uint8ClampedArray clamps on assignment, so no explicit clamp needed.
    const delta = (r - 0.5) * 2 * strength;
    d[o] += delta;
    d[o + 1] += delta;
    d[o + 2] += delta;
  }

  return img;
}
