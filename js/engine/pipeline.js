/**
 * pipeline.js — runs the stages in order.
 *
 * ── ORDER MATTERS ───────────────────────────────────────────────────
 * The sequence below mirrors a real camera and darkroom:
 *
 *   lens        glass bends the light          (geometry, before anything)
 *   tone        exposure and development       (per-pixel curve)
 *   resolution  the image is re-sampled        (pixel shapes, dither)
 *   grain       film emulsion structure        (clumpy, tone dependent)
 *   noise       sensor read noise              (flat, per-pixel)
 *   vignette    falloff from the lens barrel   (multiply)
 *   border      mounting the print             (changes canvas size — last)
 *
 * To add a stage: write a module exporting `id`, `params`, `isActive(params)`
 * and `apply(imageData, params, ctx)`, then splice it into STAGES at the point
 * in the chain where it physically belongs. `apply` may either mutate and
 * return the ImageData it was given, or return a brand new one.
 *
 * `params` is the list of parameter ids the stage reads. It MUST be complete —
 * the incremental cache below uses it to decide what can be skipped, so a
 * missing entry shows up as a slider that silently stops working.
 * ────────────────────────────────────────────────────────────────────
 */

import * as lens from './stages/lens.js';
import * as tone from './stages/tone.js';
import * as resolution from './stages/resolution.js';
import * as grain from './stages/grain.js';
import * as noise from './stages/noise.js';
import * as vignette from './stages/vignette.js';
import * as border from './stages/border.js';

import { cloneImage } from './util.js';

export const STAGES = [lens, tone, resolution, grain, noise, vignette, border];

/* ------------------------------------------------------------------ *
 * Incremental rendering
 *
 * There is exactly ONE preview resolution. An earlier version rendered a
 * small draft while a slider was moving and a large one on release, which
 * made per-pixel effects (noise especially) visibly change the moment you
 * let go — the same effect rendered into fewer pixels and scaled up is not
 * the same picture. Dragging and released now share a single render path, so
 * they cannot disagree.
 *
 * What makes that affordable is caching per stage. Dragging one slider only
 * dirties the stages that actually read it, so moving Noise re-runs noise,
 * vignette and border while reusing the cached lens/tone/resolution/grain
 * result underneath.
 * ------------------------------------------------------------------ */

/** Identity of a stage's inputs — changes when anything it reads changes. */
function stageKey(stage, params) {
  let key = '';
  for (const id of stage.params) key += `${params[id]}|`;
  return key;
}

/** Opaque cache handle. One per preview surface; pass it back to render(). */
export function createRenderCache() {
  return { source: null, keys: [], images: [] };
}

/**
 * Synchronous render.
 *
 * The source ImageData is never modified. Pass a cache from
 * createRenderCache() to reuse the unchanged head of the pipeline; omit it for
 * a plain one-shot render.
 */
export function render(source, params, ctx = {}, cache = null) {
  const context = { seed: 1, ...ctx };

  if (!cache) {
    let img = cloneImage(source);
    for (const stage of STAGES) img = stage.apply(img, params, context) || img;
    return img;
  }

  // A different source image invalidates everything.
  if (cache.source !== source) {
    cache.source = source;
    cache.keys = [];
    cache.images = [];
  }

  // Walk forward while the cached stage inputs still match.
  let firstDirty = 0;
  while (
    firstDirty < STAGES.length &&
    cache.images[firstDirty] &&
    cache.keys[firstDirty] === stageKey(STAGES[firstDirty], params)
  ) {
    firstDirty++;
  }

  if (firstDirty === STAGES.length) return cache.images[STAGES.length - 1];

  // Cached images are treated as immutable, so resume from a private copy.
  let snapshot = firstDirty === 0 ? null : cache.images[firstDirty - 1];
  let img = cloneImage(snapshot || source);

  for (let i = firstDirty; i < STAGES.length; i++) {
    const stage = STAGES[i];
    const active = stage.isActive(params, img.width);

    if (active) {
      img = stage.apply(img, params, context) || img;
      snapshot = cloneImage(img);
    } else {
      // The stage is switched off, so the image is unchanged and the previous
      // snapshot is still a valid resume point. Skipping the copy matters:
      // most sessions have several effects at zero.
      snapshot = snapshot || cloneImage(img);
    }

    cache.keys[i] = stageKey(stage, params);
    cache.images[i] = snapshot;
  }

  return img;
}

/**
 * Same pipeline, but yields to the browser between stages so a full-resolution
 * export can report progress instead of freezing the tab.
 */
export async function renderAsync(source, params, ctx = {}, onProgress) {
  const context = { seed: 1, ...ctx };
  let img = cloneImage(source);

  for (let i = 0; i < STAGES.length; i++) {
    const stage = STAGES[i];
    onProgress?.(i / STAGES.length, stage.id);
    await yieldToBrowser();
    img = stage.apply(img, params, context) || img;
  }

  onProgress?.(1, 'done');
  return img;
}

function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Final canvas size for a given input size, without rendering anything.
 *
 * Most stages leave the dimensions alone; the ones that don't (currently only
 * border) export an `outputSize(w, h, params)`. The viewer uses this to reserve
 * the correct amount of screen space while showing a smaller draft preview, so
 * the image does not visibly resize while a slider is being dragged.
 */
export function outputSize(width, height, params) {
  let size = { width, height };
  for (const stage of STAGES) {
    if (stage.outputSize) size = stage.outputSize(size.width, size.height, params);
  }
  return size;
}
