/**
 * grain.js — film grain.
 *
 * The difference between grain and digital noise (noise.js) is structure:
 * grain clumps. Silver halide crystals sit in clusters, so the texture has a
 * size to it and it interpolates smoothly rather than flickering per pixel.
 * Two octaves of value noise gets convincingly close.
 *
 * Grain is also tone dependent — it is most visible through the midtones and
 * thin shadows, and almost invisible in blown highlights where the film is
 * fully exposed. grainResponse() below models that.
 *
 * PERFORMANCE: the noise field depends only on the image size and the seed,
 * never on the grain *amount*. It is generated once and cached, so dragging
 * the Grain slider is a cheap multiply-and-add per pixel instead of eight
 * hash lookups. That is what lets the full-resolution preview keep up with
 * the slider.
 */

import { valueNoise2D, refScale } from '../util.js';

export const id = 'grain';
export const params = ['grain', 'seed'];

/** Size of one grain clump, in "reference pixels" (see util.refScale). */
const BASE_CELL = 1.7;

export function isActive(p) {
  return p.grain > 0;
}

/**
 * How strongly grain shows at a given luminance (0..1 in, 0..1 out).
 * Peaks slightly below mid grey, falls off toward pure white.
 */
function grainResponse(l) {
  return 0.3 + 0.7 * (4 * l * (1 - l)) * (1 - 0.45 * l);
}

/* Only the most recent field is kept — the size and seed rarely change, and
   holding more would cost megabytes for no benefit. */
let cached = null;

/**
 * Signed grain field in the range -1..1, one value per pixel.
 *
 * Cell sizes are derived from refScale, so the field is a function of
 * NORMALISED position: the same seed produces the same pattern whether this
 * is a 1400px preview or a 6000px export.
 */
function grainField(W, H, seed) {
  if (cached && cached.W === W && cached.H === H && cached.seed === seed) {
    return cached.field;
  }

  const scale = refScale(W, H);
  const coarse = BASE_CELL * 2.6 * scale;
  const fine = BASE_CELL * scale;

  const field = new Float32Array(W * H);
  for (let y = 0, i = 0; y < H; y++) {
    for (let x = 0; x < W; x++, i++) {
      // Two octaves: big soft clumps plus finer speckle riding on top.
      const a = valueNoise2D(x, y, coarse, seed);
      const b = valueNoise2D(x, y, fine, seed + 9871);
      field[i] = (a * 0.55 + b * 0.45) * 2 - 1;
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

  const field = grainField(W, H, ctx.seed);
  const strength = (p.grain / 100) * 90; // max ± swing in 0..255 units

  // `d` is a Uint8ClampedArray: assignment already rounds and clamps to 0..255,
  // so no explicit clamping is needed in this loop.
  for (let i = 0, o = 0; i < field.length; i++, o += 4) {
    const l = (d[o] * 0.2126 + d[o + 1] * 0.7152 + d[o + 2] * 0.0722) / 255;
    const delta = field[i] * strength * grainResponse(l);

    d[o] += delta;
    d[o + 1] += delta;
    d[o + 2] += delta;
  }

  return img;
}
