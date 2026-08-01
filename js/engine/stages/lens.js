/**
 * lens.js — barrel / pincushion distortion ("lens angle").
 *
 * Runs FIRST, on the clean image, because in a real camera the glass bends the
 * light before the sensor ever sees it. Warping after pixelation would smear
 * the blocks instead of the picture.
 *
 * Model: inverse mapping with the standard radial polynomial
 *
 *     r_source = r_output * (1 + k * r_output²)
 *
 * where r is normalised so that r = 1 at the image corners.
 *
 *   k > 0  magnifies the centre and squeezes the edges -> BARREL (wide angle)
 *   k < 0  the opposite -> PINCUSHION (long lens)
 *
 * `zoom` rescales the sample so the frame stays completely filled: for barrel
 * we pull the sampling in so the output corner lands exactly on the source
 * corner, leaving no empty margin.
 */

import { createImage } from '../util.js';

export const id = 'lens';
export const params = ['lensAngle'];

/** Max curvature at slider ±100. Raise for a fisheye-ier engine. */
const MAX_K = 0.6;

export function isActive(p) {
  return p.lensAngle !== 0;
}

export function apply(img, p) {
  if (!isActive(p)) return img;

  const W = img.width;
  const H = img.height;
  const k = (p.lensAngle / 100) * MAX_K;

  const out = createImage(W, H);
  const src = img.data;
  const dst = out.data;

  const cx = (W - 1) / 2;
  const cy = (H - 1) / 2;
  const R = Math.hypot(cx, cy); // half-diagonal => r == 1 at the corners
  const zoom = k > 0 ? 1 / (1 + k) : 1;

  const maxX = W - 1.001;
  const maxY = H - 1.001;

  // Bilinear sampling is inlined and limited to RGB. util.sampleBilinear() is
  // the readable reference version; this is the same maths unrolled, because
  // this loop runs several million times per frame and is the single most
  // expensive thing the engine does.
  for (let y = 0, o = 0; y < H; y++) {
    const ny = (y - cy) / R;
    for (let x = 0; x < W; x++, o += 4) {
      const nx = (x - cx) / R;
      const f = (1 + k * (nx * nx + ny * ny)) * zoom;

      let sx = cx + nx * f * R;
      let sy = cy + ny * f * R;
      sx = sx < 0 ? 0 : sx > maxX ? maxX : sx;
      sy = sy < 0 ? 0 : sy > maxY ? maxY : sy;

      const x0 = sx | 0;
      const y0 = sy | 0;
      const tx = sx - x0;
      const ty = sy - y0;

      const i00 = (y0 * W + x0) << 2;
      const i10 = i00 + 4;
      const i01 = i00 + (W << 2);
      const i11 = i01 + 4;

      for (let c = 0; c < 3; c++) {
        const top = src[i00 + c] + (src[i10 + c] - src[i00 + c]) * tx;
        const bot = src[i01 + c] + (src[i11 + c] - src[i01 + c]) * tx;
        dst[o + c] = top + (bot - top) * ty;
      }
      dst[o + 3] = 255;
    }
  }

  return out;
}
