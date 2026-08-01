/**
 * pixelshapes.js — the shapes the image can be rebuilt out of.
 *
 * ── HOW TO ADD A NEW SHAPE ──────────────────────────────────────────
 * Append an entry to PIXEL_SHAPES. That is the only change required —
 * the dropdown in the UI and the renderer both read from this array.
 *
 *   {
 *     id:       unique string, stored in the saved parameters
 *     label:    what the dropdown shows
 *     halftone: false -> the shape is drawn at full size in the cell colour
 *                        over a black background (a stencil / mask look)
 *               true  -> the shape GROWS with darkness and is drawn as black
 *                        ink on white paper (a print / receipt look)
 *     cover(x, y, a, aa) -> 0..1 coverage
 *   }
 *
 * cover() arguments:
 *   x, y  cell-local position in the range -0.5 .. +0.5 (0,0 is the centre)
 *   a     "amount", 0..1. For halftone shapes this is the darkness of the
 *         cell, so area should scale with it. For normal shapes it is 1.
 *   aa    anti-alias width in the same units as x/y (roughly one output
 *         pixel). Feed signed distances through smoothEdge(d, aa).
 * ────────────────────────────────────────────────────────────────────
 */

import { smoothEdge } from './util.js';

/** Shapes look best when their AREA tracks `a`, so radius uses sqrt. */
const size = (a) => Math.sqrt(a);

export const PIXEL_SHAPES = [
  {
    id: 'square',
    label: 'Square — solid block',
    halftone: false,
    cover: () => 1,
  },

  {
    id: 'circle',
    label: 'Circle',
    halftone: false,
    cover: (x, y, a, aa) => {
      const r = 0.5 * size(a);
      return smoothEdge(r - Math.hypot(x, y), aa);
    },
  },

  {
    id: 'ring',
    label: 'Ring',
    halftone: false,
    cover: (x, y, a, aa) => {
      const s = size(a);
      const r = Math.hypot(x, y);
      const d = Math.min(0.5 * s - r, r - 0.28 * s);
      return smoothEdge(d, aa);
    },
  },

  {
    id: 'diamond',
    label: 'Diamond',
    halftone: false,
    cover: (x, y, a, aa) => {
      // A diamond of "radius" r has half the area of the square, so widen it.
      const r = 0.5 * size(a) * Math.SQRT2;
      return smoothEdge(r - (Math.abs(x) + Math.abs(y)), aa);
    },
  },

  {
    id: 'triangle',
    label: 'Triangle',
    halftone: false,
    cover: (x, y, a, aa) => {
      const s = size(a);
      if (s <= 0) return 0;
      const nx = x / s;
      const ny = y / s;
      // Point-up triangle: bounded below by y = 0.5, sides converge at the top.
      const d = Math.min(0.5 - ny, (ny + 0.5) * 0.5 - Math.abs(nx)) * s;
      return smoothEdge(d, aa);
    },
  },

  {
    id: 'hex',
    label: 'Hexagon',
    halftone: false,
    cover: (x, y, a, aa) => {
      const r = 0.5 * size(a);
      const d = Math.max(Math.abs(x) * 0.8660254 + Math.abs(y) * 0.5, Math.abs(y));
      return smoothEdge(r - d, aa);
    },
  },

  {
    id: 'plus',
    label: 'Plus / crosshair',
    halftone: false,
    cover: (x, y, a, aa) => {
      const s = size(a);
      const long = 0.5 * s;
      const thin = 0.16 * s;
      const ax = Math.abs(x);
      const ay = Math.abs(y);
      const bar = Math.min(long - ax, thin - ay); // horizontal arm
      const col = Math.min(thin - ax, long - ay); // vertical arm
      return smoothEdge(Math.max(bar, col), aa);
    },
  },

  {
    id: 'cross',
    label: 'Cross (X)',
    halftone: false,
    cover: (x, y, a, aa) => {
      // Same as `plus`, rotated 45°.
      const rx = (x + y) * 0.7071068;
      const ry = (x - y) * 0.7071068;
      const s = size(a);
      const long = 0.5 * s;
      const thin = 0.15 * s;
      const bar = Math.min(long - Math.abs(rx), thin - Math.abs(ry));
      const col = Math.min(thin - Math.abs(rx), long - Math.abs(ry));
      return smoothEdge(Math.max(bar, col), aa);
    },
  },

  {
    id: 'scanH',
    label: 'Scanline — horizontal',
    halftone: false,
    cover: (x, y, a, aa) => smoothEdge(0.34 * size(a) - Math.abs(y), aa),
  },

  {
    id: 'scanV',
    label: 'Scanline — vertical',
    halftone: false,
    cover: (x, y, a, aa) => smoothEdge(0.34 * size(a) - Math.abs(x), aa),
  },

  /* ── Halftone family: black ink on white paper, dot grows as the cell
        gets darker. This is the "printed on a receipt" end of the app. ── */

  {
    id: 'bar',
    label: 'Bar chart (print)',
    halftone: true,
    cover: (x, y, a, aa) => {
      // A little histogram bar per cell, growing up from the cell floor.
      // Only meaningful as a halftone shape — it needs `a` to vary.
      const top = 0.5 - a;
      return smoothEdge(Math.min(y - top, 0.5 - y), aa);
    },
  },

  {
    id: 'halftoneDot',
    label: 'Halftone dot (print)',
    halftone: true,
    cover: (x, y, a, aa) => {
      const r = 0.62 * size(a); // >0.5 so the darkest cells fully ink over
      return smoothEdge(r - Math.hypot(x, y), aa);
    },
  },

  {
    id: 'halftoneSquare',
    label: 'Halftone square (print)',
    halftone: true,
    cover: (x, y, a, aa) => {
      const r = 0.5 * size(a);
      return smoothEdge(r - Math.max(Math.abs(x), Math.abs(y)), aa);
    },
  },

  {
    id: 'halftoneDiamond',
    label: 'Halftone diamond (print)',
    halftone: true,
    cover: (x, y, a, aa) => {
      const r = 0.5 * size(a) * Math.SQRT2;
      return smoothEdge(r - (Math.abs(x) + Math.abs(y)), aa);
    },
  },

  {
    id: 'halftoneLine',
    label: 'Line screen (thermal print)',
    halftone: true,
    cover: (x, y, a, aa) => smoothEdge(0.5 * a - Math.abs(y), aa),
  },
];

/** Lookup by id, falling back to a plain block if an id is unknown. */
export function getShape(id) {
  return PIXEL_SHAPES.find((s) => s.id === id) || PIXEL_SHAPES[0];
}

/* ------------------------------------------------------------------ *
 * Brightness compensation
 *
 * A stencil shape only inks part of its cell, so a cross covering 29% of the
 * cell would render the picture at roughly a third of its brightness. Without
 * this, changing the pixel shape looks like an exposure change, which makes
 * the control almost unusable.
 *
 * We measure how much of a cell each shape actually covers and hand back a
 * gain that cancels it out. Capped, because a very sparse shape would
 * otherwise demand a gain that just clips everything to white.
 * ------------------------------------------------------------------ */

const MAX_GAIN = 2.6;
const gainCache = new Map();

/** Average coverage of a shape at full amount, measured on a 32x32 grid. */
function averageCoverage(shape, samples = 32) {
  let sum = 0;
  for (let j = 0; j < samples; j++) {
    for (let i = 0; i < samples; i++) {
      const x = (i + 0.5) / samples - 0.5;
      const y = (j + 0.5) / samples - 0.5;
      sum += Math.min(1, Math.max(0, shape.cover(x, y, 1, 0)));
    }
  }
  return sum / (samples * samples);
}

/**
 * Multiplier that keeps a stencil shape at roughly the brightness of a solid
 * block. Halftone shapes are ink-on-paper and already tonally correct, so they
 * get 1. Measured once per shape and cached.
 */
export function brightnessGain(shape) {
  if (shape.halftone) return 1;
  if (gainCache.has(shape.id)) return gainCache.get(shape.id);

  const coverage = averageCoverage(shape);
  const gain = coverage > 0.001 ? Math.min(MAX_GAIN, 1 / coverage) : 1;
  gainCache.set(shape.id, gain);
  return gain;
}

/**
 * Shapes other than a solid block need room to be legible. The resolution
 * stage uses this to stop cells collapsing to 1–2px, where every shape would
 * look identical.
 */
export function minCellFor(id) {
  return id === 'square' ? 1 : 3;
}
