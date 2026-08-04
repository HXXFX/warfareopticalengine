# Warfare Optical Engine

A photo filter for a high-contrast monochrome look — crushed blacks, blown
highlights, film grain over digital noise, lens distortion and a white print
border. It runs in your browser; there is nothing to install.

### Open the app → [hxxfx.github.io/warfareopticalengine](https://hxxfx.github.io/warfareopticalengine/)

It opens on a sample image with the look already applied, so you can start
adjusting immediately.

---

## Loading a photo

Any of these work:

- **Drag and drop** a file onto the image
- Click **Open** in the toolbar
- **Paste** from the clipboard

Accepted formats: JPG, PNG, WebP, GIF, BMP and AVIF.

## The controls

The panel is numbered because it reads top to bottom as the order you would
normally work in.

**01 · Tone** — get the exposure right first

| | |
|---|---|
| Contrast | Overall separation between light and dark |
| Light Areas | Moves only the brighter half. Push up to blow out a sky |
| Dark Areas | Moves only the darker half. Pull down to crush the blacks |
| Saturation | 100 keeps the original colour, 0 is fully monochrome |

**02 · Structure** — how the image is rebuilt

| | |
|---|---|
| Resolution | 100 is full detail. Lower it to rebuild the photo from coarse cells |
| Pixel Shape | 15 shapes to build the image from — blocks, circles, crosses, scanlines, print halftones |
| Dither | Reduces the image to pure black and white. With a low Resolution this gives the thermal-receipt look |

**03 · Texture**

| | |
|---|---|
| Grain | Clumped film grain, strongest through the midtones |
| Noise | Flat digital sensor speckle, always neutral grey |
| Texture Seed | Changes the grain and noise pattern without changing the amount |

**04 · Lens**

| | |
|---|---|
| Lens Angle | Bends the frame — negative for a long lens, positive for a wide-angle bulge |
| Vignette | Darkens the corners |

**05 · Print**

| | |
|---|---|
| White Border | Adds a white band around the photo. It never crops the picture |
| Inner Keyline | The thin dark rule between the photo and the paper |

## Toolbar

| | |
|---|---|
| **Auto Adjust** | Applies the signature look. Every press gives a slightly different variation, so press it a few times |
| **Hold to Compare** | Press and hold — or hold <kbd>Space</kbd> — to see the original |
| **Reset** | Returns every control to neutral |
| **Download** | Saves the result at full resolution as PNG or JPG |

## Viewing

- **Scroll** to zoom, centred on your pointer
- **Drag** to pan once you are zoomed in
- **Double-click the image** to fit it back to the window

Zoomed in past 100% the image shows hard pixel edges instead of blurring, so you
can inspect the actual grain and dither cells.

## Tips

- **Double-click any slider** to reset just that one
- Auto Adjust is a good starting point rather than a finishing move — press it,
  then refine by hand
- The line under the image shows the source size, the cell grid and how long the
  last render took

## Privacy

Your photos never leave your device. Images are opened, processed and saved
entirely inside your browser — nothing is uploaded to any server, and nothing is
stored between visits.

---

## Licence

Source code is released under the [MIT Licence](LICENSE) — free to use, modify
and distribute, including commercially, provided the copyright notice is kept.

Copyright © 2026 HXXFX.

**The sample image is not covered by that licence.** `assets/sample.jpg` is a
frame from Call of Duty gameplay footage
([source video](https://youtu.be/j_F2jgnQVcE)), included purely to demonstrate
the filter. All rights to that footage remain with their respective owners. If
you reuse this project, replace the sample image with one of your own.
