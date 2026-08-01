# Warfare Optical Engine

A browser-based photo filter for a high-contrast monochrome look: crushed
blacks, blown highlights, film grain over digital noise, lens distortion and a
white print border.

**[Open the app](https://hxxfx.github.io/warfareopticalengine/)**

The app opens on a sample image with the tone controls already set, so you can
start moving sliders straight away. Drop in your own photo, or use **Open**, to
replace it.

## Features

- **Tone** — contrast, light areas, dark areas and saturation, each acting on
  its own part of the range
- **Structure** — rebuild the image from 15 pixel shapes, from solid blocks and
  scanlines to print halftones
- **Dither** — ordered and Floyd–Steinberg 1-bit modes for a thermal-receipt look
- **Texture** — film grain and digital sensor noise as separate, independent
  effects
- **Lens** — barrel / pincushion distortion and vignette
- **Print** — white photographic border with an optional inner keyline
- **Auto Adjust** — applies the house look, varied slightly every press, so no
  two results are the same
- Scroll to zoom and drag to pan for close inspection; export full resolution as
  PNG or JPG

Images are decoded, processed and saved entirely in the browser. Nothing is
uploaded.

## Running locally

No build step and no dependencies. Serve the folder over HTTP:

```bash
python -m http.server 5177
```

Then open <http://localhost:5177>. A static server is required because ES
modules will not load over `file://`.
