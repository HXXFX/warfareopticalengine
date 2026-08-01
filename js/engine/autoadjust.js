/**
 * autoadjust.js — one-click "make it look like the reference".
 *
 * This is not a canned preset. It measures the image and works out how far it
 * has to be pushed to land on the target look, so a flat grey snapshot and an
 * already-punchy frame get different treatment.
 *
 * The target, read off the reference frames:
 *   - the brightest content clips to paper white
 *   - the darkest content sits on pure black
 *   - a wide tonal spread (high standard deviation)
 *   - monochrome, heavy grain, some sensor noise, a definite vignette
 *
 * Structural choices — resolution, pixel shape, dither, lens angle, border —
 * are left alone on purpose. Those are the user's composition decisions and
 * having Auto stomp on them is infuriating.
 */

import { clamp, luma } from './util.js';

/** What Auto is aiming for. Tweak these to re-aim the whole button. */
const TARGET = {
  spread: 0.3, // standard deviation of luminance
  white: 0.97, // where the 99th percentile should land
  black: 0.015, // where the 1st percentile should land
  grain: 50,
  noise: 20,
  vignette: 28,
};

/**
 * Measure an image. Exported separately so the UI can show a histogram later
 * without re-running the whole analysis.
 */
export function analyse(imageData) {
  const d = imageData.data;
  const hist = new Float64Array(256);
  let total = 0;

  // Stride over large images — 1:4 sampling is statistically plenty and keeps
  // Auto instant on a 40 megapixel file.
  const pixels = d.length >> 2;
  const stride = Math.max(1, Math.floor(pixels / 400000));

  for (let i = 0; i < pixels; i += stride) {
    const o = i << 2;
    hist[luma(d[o], d[o + 1], d[o + 2]) | 0]++;
    total++;
  }

  const percentile = (q) => {
    let acc = 0;
    const want = total * q;
    for (let i = 0; i < 256; i++) {
      acc += hist[i];
      if (acc >= want) return i / 255;
    }
    return 1;
  };

  let mean = 0;
  for (let i = 0; i < 256; i++) mean += (i / 255) * hist[i];
  mean /= total;

  let variance = 0;
  for (let i = 0; i < 256; i++) {
    const dv = i / 255 - mean;
    variance += dv * dv * hist[i];
  }
  variance /= total;

  return {
    mean,
    spread: Math.sqrt(variance),
    p01: percentile(0.01),
    p50: percentile(0.5),
    p99: percentile(0.99),
  };
}

/**
 * Returns a partial parameter object to merge over the current settings.
 * Takes the ORIGINAL image data, not the processed preview.
 */
export function autoAdjust(imageData) {
  const stats = analyse(imageData);

  // Contrast: close the gap to the target spread, with a floor so even an
  // already-contrasty image still gets the hard reference look.
  const spreadDeficit = (TARGET.spread - stats.spread) / TARGET.spread;
  const contrast = clamp(Math.round(25 + spreadDeficit * 110), 25, 92);

  // Light areas: how far the highlights are from clipping.
  const highlightGap = TARGET.white - stats.p99;
  let lightAreas = clamp(Math.round(highlightGap * 260), 8, 85);

  // Dark areas: how far the shadows are from black. Negative pulls them down.
  const shadowExcess = stats.p01 - TARGET.black;
  let darkAreas = -clamp(Math.round(shadowExcess * 300), 8, 80);

  // A dark original needs the highlights lifted harder to get any sky at all;
  // a bright one needs the shadows dug out harder.
  if (stats.mean < 0.3) lightAreas = clamp(lightAreas + 18, 8, 90);
  if (stats.mean > 0.65) darkAreas = clamp(darkAreas - 18, -90, -8);

  return {
    saturation: 0,
    contrast,
    lightAreas,
    darkAreas,
    grain: TARGET.grain,
    noise: TARGET.noise,
    vignette: TARGET.vignette,
  };
}
