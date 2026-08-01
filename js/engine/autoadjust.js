/**
 * autoadjust.js — the house look, and the variation around it.
 *
 * BASE_PRESET is the signature setting: it is what the bundled sample image
 * loads with, and it is the anchor every Auto Adjust result is built from.
 * If you want to re-aim the whole app, change the numbers here.
 *
 * Auto Adjust never returns the preset verbatim. It drifts each continuous
 * control around the preset and re-rolls the texture seed, so pressing the
 * button repeatedly explores the look rather than snapping back to one fixed
 * result. Which controls drift, and by how much, is DRIFT below.
 *
 * Deliberately NOT varied: pixel shape, dither, saturation and the border
 * toggles. Those are the identity of the look — changing them would produce a
 * different style rather than a variation of this one.
 */

/**
 * The look. Every value is a parameter id from ui/controls.js.
 */
export const BASE_PRESET = {
  // Tone
  contrast: 15,
  lightAreas: 30,
  darkAreas: -30,
  saturation: 0, // the look is monochrome; Reset returns to 100

  // Structure
  resolution: 76, // 100 is native detail, so this rebuilds at ~310 cells wide
  pixelShape: 'hex',
  dither: 'none',

  // Texture
  grain: 74,
  noise: 72,
  seed: 178,

  // Lens
  lensAngle: -17,
  vignette: 76,

  // Print
  border: true,
  borderWidth: 3,
  borderKeyline: false,
};

/**
 * How far each control may drift from the preset, plus or minus.
 *
 * Anything not listed here is held at its preset value. Keep these modest:
 * the point is a recognisable family of results, not a random look each time.
 */
const DRIFT = {
  contrast: 8,
  lightAreas: 10,
  darkAreas: 10,
  resolution: 6,
  grain: 14,
  noise: 16,
  lensAngle: 10,
  vignette: 14,
  borderWidth: 2,
};

/**
 * Triangular distribution over -1..1.
 *
 * Two uniforms summed favours small drifts while still reaching the extremes
 * occasionally, so most results sit close to the preset and the odd one is
 * more adventurous. A flat uniform makes every control feel equally random.
 */
function jitter() {
  return Math.random() + Math.random() - 1;
}

/**
 * Build one variation of the preset.
 *
 * Math.random() is fine here: this runs once per button press to choose
 * PARAMETERS. The parameters are then fixed, and rendering stays fully
 * deterministic — never call Math.random() inside a pipeline stage, or the
 * preview would stop matching the export.
 *
 * @param {object} [previous]  the current parameters, used only to guarantee
 *                             the new result differs from what is on screen.
 * @returns {object} a partial parameter object to merge over the current ones.
 */
export function autoAdjust(previous = null) {
  const patch = { ...BASE_PRESET };

  for (const [id, range] of Object.entries(DRIFT)) {
    patch[id] = Math.round(BASE_PRESET[id] + jitter() * range);
  }

  // A fresh texture seed on every press. This alone guarantees the grain and
  // noise pattern is visibly different even if the numbers land close, so the
  // button never appears to do nothing.
  patch.seed = 1 + Math.floor(Math.random() * 999);
  if (previous && patch.seed === previous.seed) {
    patch.seed = (patch.seed % 999) + 1;
  }

  return patch;
}
