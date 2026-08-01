/**
 * tone.js — saturation, contrast, light areas, dark areas.
 *
 * Runs second in the pipeline (after the lens warp, before pixelation) and
 * mutates the ImageData in place.
 *
 * The curve is built once into a 256-entry lookup table and then applied per
 * channel, so the cost per pixel is a few array reads no matter how expensive
 * the maths in buildToneLUT() gets. If you want to change the look of the
 * engine, buildToneLUT() is the single most useful function in the project.
 */

import { clamp01, lerp, smoothstep, luma } from '../util.js';

export const id = 'tone';
export const params = ['contrast', 'lightAreas', 'darkAreas', 'saturation'];

/**
 * Repeatable S-curve. `strength` is a count, not a percentage:
 * 1.0 applies one full smoothstep, 2.5 applies two and a half.
 * Stacking is what gets you the very hard reference contrast.
 */
function sCurve(v, strength) {
  let out = v;
  let remaining = strength;
  while (remaining >= 1) {
    out = out * out * (3 - 2 * out);
    remaining -= 1;
  }
  if (remaining > 0) {
    const s = out * out * (3 - 2 * out);
    out = lerp(out, s, remaining);
  }
  return out;
}

/** Flattens the image toward mid grey. Used for negative contrast. */
function flatten(v, amount) {
  return lerp(v, 0.5 + (v - 0.5) * 0.3, amount);
}

/**
 * Build the 0..255 -> 0..255 tone curve.
 *
 * Order is deliberate: contrast reshapes the whole range first, then the
 * light/dark controls act on the *result*, so pushing "light areas" to +100
 * reliably blows the sky out no matter what contrast is set to.
 */
export function buildToneLUT(p) {
  const lut = new Uint8ClampedArray(256);

  const contrast = p.contrast / 100; // -1 .. 1
  const light = p.lightAreas / 100; // -1 .. 1
  const dark = p.darkAreas / 100; // -1 .. 1

  for (let i = 0; i < 256; i++) {
    let v = i / 255;

    // 1. Contrast — up to 2.5 stacked S-curves at +100.
    if (contrast > 0) v = sCurve(v, contrast * 2.5);
    else if (contrast < 0) v = flatten(v, -contrast);

    // 2. Light areas. Weight ramps in above mid grey, so shadows never move.
    if (light !== 0) {
      const w = smoothstep(0.45, 1.0, v);
      v = lerp(v, light > 0 ? 1 : 0, w * Math.abs(light) * 0.75);
    }

    // 3. Dark areas. Mirror of the above, weighted below mid grey.
    if (dark !== 0) {
      const w = 1 - smoothstep(0.0, 0.55, v);
      v = lerp(v, dark > 0 ? 1 : 0, w * Math.abs(dark) * 0.75);
    }

    lut[i] = clamp01(v) * 255;
  }

  return lut;
}

export function isActive(p) {
  return p.contrast !== 0 || p.lightAreas !== 0 || p.darkAreas !== 0 || p.saturation < 100;
}

export function apply(img, p) {
  if (!isActive(p)) return img;

  const lut = buildToneLUT(p);
  const sat = p.saturation / 100; // 0 = monochrome, 1 = original colour
  const d = img.data;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];

    // Desaturate first so the tone curve shapes the final values.
    if (sat < 1) {
      const l = luma(r, g, b);
      r = l + (r - l) * sat;
      g = l + (g - l) * sat;
      b = l + (b - l) * sat;
    }

    d[i] = lut[(r + 0.5) | 0];
    d[i + 1] = lut[(g + 0.5) | 0];
    d[i + 2] = lut[(b + 0.5) | 0];
  }

  return img;
}
