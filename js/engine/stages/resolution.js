/**
 * resolution.js — pixelation, pixel shapes and 1-bit dithering.
 *
 * This is the stage that takes the picture apart and rebuilds it out of cells.
 *
 * Resolution is measured in COLUMNS ACROSS THE IMAGE, not in pixels. That is
 * the whole trick behind the preview being honest: a 1200px preview and a
 * 4000px export both get, say, 140 columns, so they look identical instead of
 * the export coming out 3x finer than what the user approved.
 *
 * Three steps:
 *   1. average the source down into a cols x rows grid
 *   2. optionally dither that grid to pure black/white (the receipt look)
 *   3. draw every cell back at full size using the chosen pixel shape
 */

import { clamp, clamp01, lerp, luma } from '../util.js';
import { PIXEL_SHAPES, getShape, minCellFor, brightnessGain } from '../pixelshapes.js';

export const id = 'resolution';
export const params = ['resolution', 'pixelShape', 'dither'];

/** Coarsest the slider can go. At resolution 0 the image is ~18 cells wide. */
const MIN_COLS = 18;

/**
 * Finest the slider maps to, just below resolution = 100.
 *
 * This is a FIXED number, deliberately not the image width: the slider means
 * "give me N cells across", so a preview and a 4000px export land on the same
 * N and therefore look the same. Deriving it from the width instead would make
 * every image respond differently to the same slider value.
 */
const REF_COLS = 2000;

/** Bends the slider so the useful range is not crammed into the top third. */
const CURVE = 0.65;

/* ------------------------------------------------------------------ *
 * Dither matrices
 * ------------------------------------------------------------------ */

// Normalised ordered-dither thresholds. Values are (index + 0.5) / n².
const BAYER4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
].map((v) => (v + 0.5) / 16);

const BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37,
  63, 31, 55, 23, 61, 29, 53, 21,
].map((v) => (v + 0.5) / 64);

export const DITHER_MODES = [
  { id: 'none', label: 'None — keep grey levels' },
  { id: 'threshold', label: 'Hard threshold (1-bit)' },
  { id: 'bayer4', label: 'Ordered 4×4 (receipt)' },
  { id: 'bayer8', label: 'Ordered 8×8 (fine receipt)' },
  { id: 'floyd', label: 'Floyd–Steinberg (error diffusion)' },
];

/**
 * How many cells across for a given slider value.
 *
 * The slider reads as RESOLUTION, so it runs the same way round as the word:
 * 100 is full detail and 0 is coarsest. Internally the maths wants the
 * opposite — `t` is how far the image has been degraded — hence the inversion
 * on the first line.
 *
 * Interpolated geometrically, so each slider step is a constant *ratio* change
 * rather than a constant pixel change, which is how the eye reads coarseness.
 *
 * Resolution 100 is a true bypass: the cell grid becomes the native pixel grid.
 */
export function columnsFor(width, resolution, shapeId) {
  const t = clamp01(1 - resolution / 100);

  const cols =
    t === 0
      ? width
      : Math.round(Math.exp(lerp(Math.log(REF_COLS), Math.log(MIN_COLS), Math.pow(t, CURVE))));

  // Shapes need room to be recognisable; a 1px triangle is just a pixel.
  // This is also what stops the grid ever being finer than the image itself.
  const maxCols = Math.floor(width / minCellFor(shapeId));
  return clamp(cols, MIN_COLS, Math.max(MIN_COLS, maxCols));
}

export function isActive(p, width) {
  const cols = columnsFor(width, p.resolution, p.pixelShape);
  return cols < width || p.pixelShape !== 'square' || p.dither !== 'none';
}

/* ------------------------------------------------------------------ *
 * Coverage masks
 *
 * Drawing a shape used to call shape.cover() once per output pixel — millions
 * of indirect calls per frame, which is why selecting a pixel shape made every
 * other slider feel sluggish.
 *
 * Every cell of a given size shares the same mask, so we rasterise it once and
 * reuse it. Stencil shapes need exactly one mask; halftone shapes need one per
 * dot size, so their amount is bucketed.
 * ------------------------------------------------------------------ */

const MASK_BUCKETS = 64;
const MASK_CACHE_LIMIT = 800;
const maskCache = new Map();

/**
 * Cache key. Numeric rather than a template string: this is called once per
 * cell, and building tens of thousands of strings per frame was showing up as
 * real time in the profile.
 */
function maskKey(shapeIndex, cw, ch, bucket) {
  return ((shapeIndex * 4096 + cw) * 4096 + ch) * (MASK_BUCKETS + 2) + bucket + 1;
}

function getMask(shape, shapeIndex, cw, ch, amount) {
  const bucket = shape.halftone ? Math.round(amount * MASK_BUCKETS) : -1;
  const key = maskKey(shapeIndex, cw, ch, bucket);

  const hit = maskCache.get(key);
  if (hit) return hit;

  // One output pixel in cell-local units, capped so tiny cells do not
  // dissolve into a soft blur.
  const aa = Math.min(0.5, 1 / Math.min(cw, ch));
  const a = shape.halftone ? bucket / MASK_BUCKETS : 1;

  const mask = new Float32Array(cw * ch);
  for (let y = 0, i = 0; y < ch; y++) {
    const ly = (y + 0.5) / ch - 0.5;
    for (let x = 0; x < cw; x++, i++) {
      const lx = (x + 0.5) / cw - 0.5;
      mask[i] = clamp01(shape.cover(lx, ly, a, aa));
    }
  }

  if (maskCache.size > MASK_CACHE_LIMIT) maskCache.clear();
  maskCache.set(key, mask);
  return mask;
}

export function apply(img, p) {
  const W = img.width;
  const H = img.height;
  if (!isActive(p, W)) return img;

  const shape = getShape(p.pixelShape);
  const shapeIndex = PIXEL_SHAPES.indexOf(shape);
  const cols = columnsFor(W, p.resolution, p.pixelShape);
  const rows = Math.max(1, Math.round((cols * H) / W));

  /* --- 1. average into the cell grid ---------------------------------- */

  const cellR = new Float32Array(cols * rows);
  const cellG = new Float32Array(cols * rows);
  const cellB = new Float32Array(cols * rows);
  const cellV = new Float32Array(cols * rows); // luminance, 0..1

  // Precompute cell boundaries once instead of per pixel.
  const xEdge = new Int32Array(cols + 1);
  const yEdge = new Int32Array(rows + 1);
  for (let i = 0; i <= cols; i++) xEdge[i] = Math.round((i * W) / cols);
  for (let j = 0; j <= rows; j++) yEdge[j] = Math.round((j * H) / rows);

  const src = img.data;

  for (let j = 0; j < rows; j++) {
    const y0 = yEdge[j];
    const y1 = Math.max(y0 + 1, yEdge[j + 1]);
    for (let i = 0; i < cols; i++) {
      const x0 = xEdge[i];
      const x1 = Math.max(x0 + 1, xEdge[i + 1]);

      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let y = y0; y < y1 && y < H; y++) {
        let o = (y * W + x0) << 2;
        for (let x = x0; x < x1 && x < W; x++, o += 4) {
          r += src[o];
          g += src[o + 1];
          b += src[o + 2];
          n++;
        }
      }
      if (n === 0) n = 1;

      const c = j * cols + i;
      cellR[c] = r / n;
      cellG[c] = g / n;
      cellB[c] = b / n;
      cellV[c] = luma(cellR[c], cellG[c], cellB[c]) / 255;
    }
  }

  /* --- 2. dither the grid --------------------------------------------- */

  if (p.dither !== 'none') {
    applyDither(cellR, cellG, cellB, cellV, cols, rows, p.dither);
  }

  /* --- 3. paint the cells back at full size --------------------------- */

  const out = new ImageData(W, H);
  const dst = out.data;
  const gain = brightnessGain(shape);

  for (let j = 0; j < rows; j++) {
    const y0 = yEdge[j];
    const y1 = Math.min(H, Math.max(y0 + 1, yEdge[j + 1]));
    const ch = y1 - y0;

    for (let i = 0; i < cols; i++) {
      const x0 = xEdge[i];
      const x1 = Math.min(W, Math.max(x0 + 1, xEdge[i + 1]));
      const cw = x1 - x0;
      const c = j * cols + i;

      // Halftone shapes are ink-on-paper: the dot grows as the cell darkens.
      // Everything else is a stencil: the cell's own colour over black,
      // scaled up so a sparse shape does not read as an exposure drop.
      const amount = shape.halftone ? 1 - cellV[c] : 1;
      const fr = shape.halftone ? 0 : Math.min(255, cellR[c] * gain);
      const fg = shape.halftone ? 0 : Math.min(255, cellG[c] * gain);
      const fb = shape.halftone ? 0 : Math.min(255, cellB[c] * gain);
      const bg = shape.halftone ? 255 : 0;

      const mask = getMask(shape, shapeIndex, cw, ch, amount);

      for (let y = y0; y < y1; y++) {
        let m = (y - y0) * cw;
        let o = (y * W + x0) << 2;
        for (let x = x0; x < x1; x++, o += 4, m++) {
          const cov = mask[m];

          dst[o] = bg + (fr - bg) * cov;
          dst[o + 1] = bg + (fg - bg) * cov;
          dst[o + 2] = bg + (fb - bg) * cov;
          dst[o + 3] = 255;
        }
      }
    }
  }

  return out;
}

/**
 * Reduce the cell grid to pure black and white.
 * Mutates all four cell arrays in place.
 */
function applyDither(cellR, cellG, cellB, cellV, cols, rows, mode) {
  const write = (c, on) => {
    const v = on ? 255 : 0;
    cellR[c] = v;
    cellG[c] = v;
    cellB[c] = v;
    cellV[c] = on ? 1 : 0;
  };

  if (mode === 'floyd') {
    // Error diffusion needs a working copy it can push error into.
    const buf = Float32Array.from(cellV);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const c = j * cols + i;
        const old = buf[c];
        const on = old >= 0.5;
        const err = old - (on ? 1 : 0);
        write(c, on);

        // Standard 7/16, 3/16, 5/16, 1/16 distribution.
        if (i + 1 < cols) buf[c + 1] += err * (7 / 16);
        if (j + 1 < rows) {
          if (i > 0) buf[c + cols - 1] += err * (3 / 16);
          buf[c + cols] += err * (5 / 16);
          if (i + 1 < cols) buf[c + cols + 1] += err * (1 / 16);
        }
      }
    }
    return;
  }

  const matrix = mode === 'bayer8' ? BAYER8 : mode === 'bayer4' ? BAYER4 : null;
  const n = mode === 'bayer8' ? 8 : 4;

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const c = j * cols + i;
      const threshold = matrix ? matrix[(j % n) * n + (i % n)] : 0.5;
      write(c, cellV[c] >= threshold);
    }
  }
}
