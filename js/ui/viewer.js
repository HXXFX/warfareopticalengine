/**
 * viewer.js — displays a processed ImageData, fits it to the stage, and lets
 * the user pan and zoom around it.
 *
 * ── HOW THE VIEW IS COMPOSED ────────────────────────────────────────
 * Two independent transforms are stacked:
 *
 *   fitScale   chosen automatically so the whole frame fits the stage.
 *              Recomputed on every layout, so resizing the window keeps the
 *              image fitted exactly as before.
 *   zoom       the user's magnification on top of the fit. 1 means "fitted".
 *   offset     the user's pan, in screen pixels from the centre.
 *
 * fitScale is applied by setting the canvas's CSS width/height; zoom and
 * offset are applied as a CSS transform. Keeping them separate means a window
 * resize recomputes the fit without disturbing the user's zoom.
 *
 * Panning is clamped so the image can never be dragged off screen — at fit
 * there is nothing to pan and the image stays centred, which is how Photoshop
 * and Lightroom behave in "fit on screen".
 * ────────────────────────────────────────────────────────────────────
 */

/** 1 is "fitted to the stage". Zooming out past the fit is not useful. */
const MIN_ZOOM = 1;
const MAX_ZOOM = 32;

/** Breathing room around a fitted image, in pixels. */
const FIT_PADDING = 48;

/** Wheel sensitivity. Larger is faster. */
const WHEEL_SPEED = 0.002;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export class Viewer {
  /**
   * @param {HTMLCanvasElement} canvas  the visible canvas
   * @param {HTMLElement} stage         its sizing container
   */
  constructor(canvas, stage) {
    this.canvas = canvas;
    this.stage = stage;
    this.ctx = canvas.getContext('2d');
    this.current = null;

    // The size the image is laid out AS, which is not the size of the bitmap
    // we happen to be showing. See show().
    this.basis = null;

    this.fitScale = 1;
    this.zoom = 1;
    this.offset = { x: 0, y: 0 };
    this.pannable = false;
    this.dragging = false;

    /** Called whenever the view changes, so the UI can show the zoom level. */
    this.onViewChange = null;

    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(stage);

    this.attachInteraction();
  }

  /**
   * Draw an ImageData and fit it to the stage.
   *
   * `basis` is the size the full-quality result would be. Passing it keeps the
   * on-screen size steady even if the bitmap handed over is a different
   * resolution. The current zoom and pan are deliberately preserved, so
   * adjusting a slider does not throw away the user's position.
   */
  show(imageData, { basis = null } = {}) {
    this.current = imageData;
    this.basis = basis || { width: imageData.width, height: imageData.height };

    this.canvas.width = imageData.width;
    this.canvas.height = imageData.height;
    this.ctx.putImageData(imageData, 0, 0);
    this.layout();
  }

  clear() {
    this.current = null;
    this.basis = null;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.resetView();
  }

  /** Back to fitted and centred. Called when a new image is loaded. */
  resetView() {
    this.zoom = 1;
    this.offset.x = 0;
    this.offset.y = 0;
    this.applyTransform();
  }

  /**
   * Recompute the fit. Only touches fitScale — the user's zoom and pan survive
   * a window resize.
   */
  layout() {
    if (!this.current || !this.basis) return;

    const availW = Math.max(1, this.stage.clientWidth - FIT_PADDING);
    const availH = Math.max(1, this.stage.clientHeight - FIT_PADDING);
    const { width, height } = this.basis;

    this.fitScale = Math.min(availW / width, availH / height, 1);
    this.canvas.style.width = `${Math.round(width * this.fitScale)}px`;
    this.canvas.style.height = `${Math.round(height * this.fitScale)}px`;

    this.applyTransform();
  }

  /**
   * Multiply the zoom, keeping the point under `anchor` pinned in place.
   * `anchor` is in pixels relative to the centre of the stage.
   */
  zoomBy(factor, anchor = { x: 0, y: 0 }) {
    const next = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    if (next === this.zoom) return;

    // The anchor sits at offset + p * zoom on screen. Solve for the offset
    // that leaves it there once the zoom changes.
    const ratio = next / this.zoom;
    this.offset.x = anchor.x - (anchor.x - this.offset.x) * ratio;
    this.offset.y = anchor.y - (anchor.y - this.offset.y) * ratio;
    this.zoom = next;

    this.applyTransform();
  }

  /** Push zoom, pan and clamping to the DOM. */
  applyTransform() {
    if (!this.basis) return;

    const scaledW = this.basis.width * this.fitScale * this.zoom;
    const scaledH = this.basis.height * this.fitScale * this.zoom;

    // Never let the image be dragged past the edge of the stage. When it fits,
    // both limits are zero and it simply stays centred.
    const maxX = Math.max(0, (scaledW - this.stage.clientWidth) / 2);
    const maxY = Math.max(0, (scaledH - this.stage.clientHeight) / 2);
    this.offset.x = clamp(this.offset.x, -maxX, maxX);
    this.offset.y = clamp(this.offset.y, -maxY, maxY);

    this.canvas.style.transform =
      `translate(${Math.round(this.offset.x)}px, ${Math.round(this.offset.y)}px) ` +
      `scale(${this.zoom})`;

    // Magnifying past 1:1 shows the real pixel grid rather than a smoothed
    // guess — the whole point of zooming in on a dithered or grainy frame.
    this.canvas.style.imageRendering = this.fitScale * this.zoom > 1.02 ? 'pixelated' : 'auto';

    this.pannable = maxX > 0.5 || maxY > 0.5;
    this.updateCursor();
    this.onViewChange?.(this);
  }

  updateCursor() {
    this.stage.style.cursor = !this.current || !this.pannable
      ? ''
      : this.dragging
        ? 'grabbing'
        : 'grab';
  }

  /* ---------------------------------------------------------------- *
   * Input
   * ---------------------------------------------------------------- */

  /** Pointer position relative to the centre of the stage. */
  pointerInStage(e) {
    const r = this.stage.getBoundingClientRect();
    return {
      x: e.clientX - (r.left + r.width / 2),
      y: e.clientY - (r.top + r.height / 2),
    };
  }

  attachInteraction() {
    const stage = this.stage;

    // --- wheel to zoom, anchored under the pointer ---
    stage.addEventListener(
      'wheel',
      (e) => {
        if (!this.current) return;
        e.preventDefault(); // stop the page scrolling instead

        // Normalise the three delta modes to pixels.
        const delta =
          e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 100 : e.deltaY;

        this.zoomBy(Math.exp(-delta * WHEEL_SPEED), this.pointerInStage(e));
      },
      { passive: false }
    );

    // --- left button drag to pan ---
    let last = null;

    stage.addEventListener('pointerdown', (e) => {
      if (!this.current || e.button !== 0 || !this.pannable) return;
      this.dragging = true;
      last = { x: e.clientX, y: e.clientY };
      stage.setPointerCapture(e.pointerId);
      this.updateCursor();
      e.preventDefault();
    });

    stage.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.offset.x += e.clientX - last.x;
      this.offset.y += e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      this.applyTransform();
    });

    const endDrag = (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      if (stage.hasPointerCapture?.(e.pointerId)) stage.releasePointerCapture(e.pointerId);
      this.updateCursor();
    };

    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);

    // --- double click to return to fit ---
    stage.addEventListener('dblclick', () => {
      if (this.current) this.resetView();
    });
  }
}

/**
 * Downscale a source bitmap into ImageData no larger than `maxEdge`.
 *
 * Everything the engine does is expressed in relative units, so the preview is
 * a faithful miniature of the export rather than a different-looking image.
 * Returns { imageData, scale }.
 */
export function toImageData(source, maxEdge) {
  const sw = source.naturalWidth || source.width;
  const sh = source.naturalHeight || source.height;
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));

  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);

  return { imageData: ctx.getImageData(0, 0, w, h), scale };
}
