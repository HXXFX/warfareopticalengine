/**
 * controls.js — the single source of truth for every parameter.
 *
 * The control panel builds itself from this file and the default parameter set
 * is derived from it. To add a new control you only touch two files: this one
 * (declare it) and the stage that consumes `params.<id>`.
 *
 * ── PANEL ORDER IS NOT PIPELINE ORDER ───────────────────────────────
 * The groups below are ordered by HOW THE IMAGE IS EDITED, top to bottom:
 *
 *   01 Tone       get the exposure and contrast right first, on a clean image
 *   02 Structure  then commit to the big stylistic decision (how it's rebuilt)
 *   03 Texture    then lay grain and noise over the result
 *   04 Lens       then shape the light and the edges of the frame
 *   05 Print      finally, mount it
 *
 * The ENGINE runs its stages in a different order — the physical one, where
 * the lens bends light before the sensor ever sees it (see pipeline.js). Those
 * two orders are deliberately independent. Do not "fix" one to match the
 * other: reordering this file changes only the panel layout, and reordering
 * STAGES in pipeline.js changes the actual image.
 * ────────────────────────────────────────────────────────────────────
 *
 * Control types:
 *   range   { min, max, step, default, unit }
 *   select  { options: [{ value, label }], default }
 *   toggle  { default }
 *
 * Optional on any control:
 *   hint      one line of help shown under the control
 *   showIf    (params) => boolean — hides the control when it does nothing
 */

import { PIXEL_SHAPES } from '../engine/pixelshapes.js';
import { DITHER_MODES } from '../engine/stages/resolution.js';

export const CONTROL_GROUPS = [
  {
    id: 'tone',
    label: 'Tone',
    controls: [
      {
        id: 'contrast',
        label: 'Contrast',
        type: 'range',
        min: -100,
        max: 100,
        step: 1,
        default: 0,
      },
      {
        id: 'lightAreas',
        label: 'Light Areas',
        type: 'range',
        min: -100,
        max: 100,
        step: 1,
        default: 0,
        hint: 'Only moves tones above mid grey. Push up to blow the sky out.',
      },
      {
        id: 'darkAreas',
        label: 'Dark Areas',
        type: 'range',
        min: -100,
        max: 100,
        step: 1,
        default: 0,
        hint: 'Only moves tones below mid grey. Pull down to crush the blacks.',
      },
      {
        id: 'saturation',
        label: 'Saturation',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        default: 0,
        hint: '0 is fully monochrome. Raise it to let the original colour back in.',
      },
    ],
  },

  {
    id: 'structure',
    label: 'Structure',
    controls: [
      {
        id: 'resolution',
        label: 'Resolution',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        default: 0,
        hint: 'Coarseness of the rebuild. 0 keeps native detail, 100 is ~18 cells wide.',
      },
      {
        id: 'pixelShape',
        label: 'Pixel Shape',
        type: 'select',
        options: PIXEL_SHAPES.map((s) => ({ value: s.id, label: s.label })),
        default: 'square',
        hint: 'Needs some Resolution to be visible — cells are forced to at least 3px.',
      },
      {
        id: 'dither',
        label: 'Dither',
        type: 'select',
        options: DITHER_MODES.map((d) => ({ value: d.id, label: d.label })),
        default: 'none',
        hint: 'Crushes the cells to pure black and white — the thermal receipt look.',
      },
    ],
  },

  {
    id: 'texture',
    label: 'Texture',
    controls: [
      {
        id: 'grain',
        label: 'Grain',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        default: 0,
        hint: 'Clumped film grain. Strongest through the midtones.',
      },
      {
        id: 'noise',
        label: 'Noise',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        default: 0,
        hint: 'Flat per-pixel digital speckle, always neutral grey.',
      },
      {
        id: 'seed',
        label: 'Texture Seed',
        type: 'range',
        min: 1,
        max: 999,
        step: 1,
        default: 137,
        hint: 'Changes the grain and noise pattern without changing the amount.',
        showIf: (p) => p.grain > 0 || p.noise > 0,
      },
    ],
  },

  {
    id: 'lens',
    label: 'Lens',
    controls: [
      {
        id: 'lensAngle',
        label: 'Lens Angle',
        type: 'range',
        min: -100,
        max: 100,
        step: 1,
        default: 0,
        hint: 'Negative bends toward a long lens, positive toward a wide-angle bulge.',
      },
      {
        id: 'vignette',
        label: 'Vignette',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        default: 0,
        hint: 'Darkens the corners, pulling the eye toward the centre.',
      },
    ],
  },

  {
    id: 'print',
    label: 'Print',
    controls: [
      {
        id: 'border',
        label: 'White Border',
        type: 'toggle',
        default: false,
      },
      {
        id: 'borderWidth',
        label: 'Border Width',
        type: 'range',
        min: 1,
        max: 100,
        step: 1,
        default: 30,
        showIf: (p) => p.border,
      },
      {
        id: 'borderKeyline',
        label: 'Inner Keyline',
        type: 'toggle',
        default: true,
        hint: 'The thin dark rule between the photo and the paper.',
        showIf: (p) => p.border,
      },
    ],
  },
];

/** Flat list of every control, in panel order. */
export const ALL_CONTROLS = CONTROL_GROUPS.flatMap((g) => g.controls);

/** Default parameter object, derived straight from the declarations above. */
export function defaultParams() {
  const p = {};
  for (const c of ALL_CONTROLS) p[c.id] = c.default;
  return p;
}
