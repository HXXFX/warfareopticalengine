/**
 * main.js — application wiring.
 *
 * Holds the app state, decides *when* to render, and connects the panel, the
 * viewer and the file helpers. All the actual image maths lives under
 * js/engine/ and nothing in this file knows how any effect works.
 *
 * Rendering strategy
 * ------------------
 * There is ONE preview resolution, sized to fit the screen at about 1:1, and
 * it is used both while a slider is moving and after it is released. An
 * earlier version dropped to a small draft during drags, which made per-pixel
 * effects visibly change on release — see the note in pipeline.js.
 *
 * Keeping up at full preview resolution is possible because render() caches
 * each stage: moving one slider only re-runs the stages that read it.
 *
 *   any slider  -> full preview, incrementally (only the dirty stages)
 *   Export      -> native resolution, uncached, stage by stage with progress
 *
 * Every effect is defined in relative units, so the preview and the export
 * produce the same look. What you approve is what lands in the file.
 */

import { render, renderAsync, outputSize, createRenderCache } from './engine/pipeline.js';
import { autoAdjust } from './engine/autoadjust.js';
import { columnsFor } from './engine/stages/resolution.js';
import { defaultParams } from './ui/controls.js';
import { Panel, sanitiseParams } from './ui/panel.js';
import { Viewer, toImageData } from './ui/viewer.js';
import {
  loadImageFile,
  attachFileInput,
  attachDropZone,
  attachPaste,
  imageDataToBlob,
  downloadBlob,
  outputName,
} from './ui/fileio.js';

/* ------------------------------------------------------------------ *
 * Tunables
 * ------------------------------------------------------------------ */

const PREVIEW_MIN = 700; // floor for the preview
const PREVIEW_MAX = 1500; // ceiling for the preview
const EXPORT_MAX = 8000; // guard against enormous files exhausting memory
const STORAGE_KEY = 'warfare-optical-engine/params';

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

const state = {
  sourceImage: null,
  sourceName: '',
  previewSource: null, // untouched ImageData, screen sized
  previewEdge: 0,
  lastResult: null, // last processed ImageData, for the compare toggle
  lastRenderMs: 0,
  params: loadParams(),
  frame: 0,
  exporting: false,
  cache: createRenderCache(),
};

/* ------------------------------------------------------------------ *
 * DOM
 * ------------------------------------------------------------------ */

const dom = {
  stage: document.getElementById('stage'),
  canvas: document.getElementById('canvas'),
  dropZone: document.getElementById('dropzone'),
  fileInput: document.getElementById('file-input'),
  panel: document.getElementById('panel'),
  status: document.getElementById('status'),
  btnAuto: document.getElementById('btn-auto'),
  btnReset: document.getElementById('btn-reset'),
  btnCompare: document.getElementById('btn-compare'),
  btnExport: document.getElementById('btn-export'),
  format: document.getElementById('format'),
  overlay: document.getElementById('overlay'),
  overlayText: document.getElementById('overlay-text'),
  overlayBar: document.getElementById('overlay-bar'),
};

const viewer = new Viewer(dom.canvas, dom.stage);

// Zooming and panning do not re-render, they only change the view — so the
// status line is refreshed directly rather than through the render path.
viewer.onViewChange = () => setStatus(describe());

const panel = new Panel(dom.panel, (id, value) => {
  state.params[id] = value;
  panel.sync(state.params);
  saveParams();
  scheduleRender();
});

panel.sync(state.params);

/* ------------------------------------------------------------------ *
 * Loading
 * ------------------------------------------------------------------ */

attachFileInput(dom.fileInput, handleFile);
attachPaste(handleFile);

// The stage accepts drops too, so you can swap images without clearing first.
attachDropZone(dom.stage, handleFile);
attachDropZone(dom.dropZone, handleFile);
dom.dropZone.addEventListener('click', () => dom.fileInput.click());

async function handleFile(file) {
  try {
    setStatus('Decoding…');
    const { image, name } = await loadImageFile(file);

    state.sourceImage = image;
    state.sourceName = name;
    state.previewEdge = 0; // force the preview to be rebuilt at the new size

    document.body.classList.add('has-image');
    rebuildPreviewSources();
    viewer.resetView(); // a new photo starts fitted, not wherever the last one was
    scheduleRender();
  } catch (err) {
    setStatus(err.message, true);
  }
}

/**
 * Preview size follows the window: we render at roughly the number of device
 * pixels the canvas actually occupies, so a 1-bit dither is shown crisply at
 * 1:1 instead of being smoothed away by the browser's downscaler.
 */
function idealPreviewEdge() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const edge = Math.max(dom.stage.clientWidth, dom.stage.clientHeight) * dpr;
  return Math.round(Math.min(PREVIEW_MAX, Math.max(PREVIEW_MIN, edge)));
}

function rebuildPreviewSources() {
  if (!state.sourceImage) return;
  const edge = idealPreviewEdge();

  // Only redo the downscale if the window changed size meaningfully.
  if (state.previewEdge && Math.abs(edge - state.previewEdge) / state.previewEdge < 0.15) {
    return;
  }

  state.previewEdge = edge;
  state.previewSource = toImageData(state.sourceImage, edge).imageData;
}

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const before = state.previewEdge;
    rebuildPreviewSources();
    if (state.previewEdge !== before) scheduleRender();
  }, 250);
});

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

function scheduleRender() {
  if (!state.previewSource) return;
  // Coalesce bursts of slider events into one render per frame.
  if (state.frame) cancelAnimationFrame(state.frame);
  state.frame = requestAnimationFrame(() => {
    state.frame = 0;
    renderPreview();
  });
}

function renderPreview() {
  const source = state.previewSource;
  if (!source) return;

  const started = performance.now();
  const result = render(source, state.params, { seed: state.params.seed }, state.cache);
  state.lastRenderMs = Math.round(performance.now() - started);

  state.lastResult = result;
  viewer.show(result, { basis: previewBasis() }); // triggers onViewChange -> status
}

/**
 * Final dimensions of the preview, computed without rendering. The viewer lays
 * out against this so toggling a border resizes the frame predictably instead
 * of the canvas jumping around as stages change the canvas size.
 */
function previewBasis() {
  if (!state.previewSource) return null;
  return outputSize(state.previewSource.width, state.previewSource.height, state.params);
}

/** The line under the image: what you are looking at and what you will get. */
function describe() {
  const img = state.sourceImage;
  if (!img) return '';

  const nativeW = img.naturalWidth;
  const nativeH = img.naturalHeight;
  const cols = columnsFor(nativeW, state.params.resolution, state.params.pixelShape);
  const rows = Math.max(1, Math.round((cols * nativeH) / nativeW));

  const parts = [
    `${nativeW} × ${nativeH}`,
    cols < nativeW ? `${cols} × ${rows} cells` : 'native detail',
    `preview ${state.lastRenderMs}ms`,
  ];

  // Only mention zoom when there is some, so the line stays quiet at fit.
  if (viewer.zoom > 1.01) parts.push(`zoom ×${viewer.zoom.toFixed(1)}`);

  return parts.join('  ·  ');
}

/* ------------------------------------------------------------------ *
 * Buttons
 * ------------------------------------------------------------------ */

dom.btnAuto.addEventListener('click', () => {
  if (!state.previewSource) return setStatus('Load an image first.', true);

  // Analysis runs on the untouched source, never on the processed preview.
  Object.assign(state.params, autoAdjust(state.previewSource));
  panel.sync(state.params);
  saveParams();
  scheduleRender();
  setStatus('Auto adjusted from image histogram.');
});

dom.btnReset.addEventListener('click', () => {
  state.params = defaultParams();
  panel.sync(state.params);
  saveParams();
  scheduleRender();
});

// Hold to compare against the original.
let comparing = false;

function showOriginal() {
  if (comparing || !state.previewSource) return;
  comparing = true;
  dom.btnCompare.classList.add('is-active');
  viewer.show(state.previewSource);
}

function showProcessed() {
  if (!comparing) return;
  comparing = false;
  dom.btnCompare.classList.remove('is-active');
  if (state.lastResult) viewer.show(state.lastResult, { basis: previewBasis() });
}

dom.btnCompare.addEventListener('pointerdown', showOriginal);
['pointerup', 'pointerleave', 'pointercancel'].forEach((e) =>
  dom.btnCompare.addEventListener(e, showProcessed)
);

window.addEventListener('keydown', (e) => {
  if (e.repeat || e.target.matches('input, select, textarea')) return;
  if (e.code === 'Space') {
    e.preventDefault();
    showOriginal();
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') showProcessed();
});

/* ------------------------------------------------------------------ *
 * Export
 * ------------------------------------------------------------------ */

dom.btnExport.addEventListener('click', exportImage);

async function exportImage() {
  if (!state.sourceImage) return setStatus('Load an image first.', true);
  if (state.exporting) return;

  state.exporting = true;
  dom.overlay.classList.add('is-visible');

  try {
    const img = state.sourceImage;
    const native = Math.max(img.naturalWidth, img.naturalHeight);
    const cap = Math.min(native, EXPORT_MAX);

    setProgress(0, 'preparing');
    await nextTick();

    const { imageData } = toImageData(img, cap);

    const result = await renderAsync(
      imageData,
      state.params,
      { seed: state.params.seed },
      (t, stageId) => setProgress(t, stageId)
    );

    setProgress(1, 'encoding');
    await nextTick();

    const format = dom.format.value; // 'png' | 'jpeg'
    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const blob = await imageDataToBlob(result, mime, 0.94);

    downloadBlob(blob, outputName(state.sourceName, format === 'jpeg' ? 'jpg' : 'png'));

    const capped = native > EXPORT_MAX ? ` (capped from ${native}px)` : '';
    setStatus(`Exported ${result.width} × ${result.height}${capped}.`);
  } catch (err) {
    setStatus(`Export failed: ${err.message}`, true);
  } finally {
    state.exporting = false;
    dom.overlay.classList.remove('is-visible');
  }
}

function setProgress(t, label) {
  dom.overlayBar.style.width = `${Math.round(t * 100)}%`;
  dom.overlayText.textContent = `Rendering at full resolution — ${label}`;
}

const nextTick = () => new Promise((r) => setTimeout(r, 0));

/* ------------------------------------------------------------------ *
 * Misc
 * ------------------------------------------------------------------ */

function setStatus(text, isError = false) {
  dom.status.textContent = text;
  dom.status.classList.toggle('is-error', isError);
}

function saveParams() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.params));
  } catch {
    /* private mode / quota — not worth interrupting the user over */
  }
}

function loadParams() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return sanitiseParams(JSON.parse(raw));
  } catch {
    /* fall through to defaults */
  }
  return defaultParams();
}
