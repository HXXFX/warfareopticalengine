/**
 * vignette.js — corner falloff.
 *
 * Radius is normalised to the half-diagonal, so r = 1 exactly at the corners
 * regardless of aspect ratio. A square crop and a panorama therefore get the
 * same visual amount of vignette.
 *
 * Applied as a multiply rather than a subtract: that keeps the falloff sitting
 * *behind* the grain instead of flattening it, and it can never push a pixel
 * below black.
 */

import { smoothstep } from '../util.js';

export const id = 'vignette';
export const params = ['vignette'];

/** Where the darkening starts, as a fraction of the half-diagonal. */
const INNER = 0.35;

/** Darkness of the corners at slider 100 (0 = untouched, 1 = pure black). */
const MAX_DARKEN = 0.92;

export function isActive(p) {
  return p.vignette > 0;
}

export function apply(img, p) {
  if (!isActive(p)) return img;

  const W = img.width;
  const H = img.height;
  const d = img.data;

  const amount = (p.vignette / 100) * MAX_DARKEN;
  const cx = (W - 1) / 2;
  const cy = (H - 1) / 2;
  const R = Math.hypot(cx, cy);

  for (let y = 0; y < H; y++) {
    const dy = (y - cy) / R;
    let o = (y * W) << 2;
    for (let x = 0; x < W; x++, o += 4) {
      const dx = (x - cx) / R;
      const r = Math.sqrt(dx * dx + dy * dy);

      const falloff = smoothstep(INNER, 1.0, r);
      const mul = 1 - amount * falloff;

      d[o] *= mul;
      d[o + 1] *= mul;
      d[o + 2] *= mul;
    }
  }

  return img;
}
