/**
 * fileio.js — getting images in and out of the browser.
 *
 * Everything here is local. No image is ever uploaded anywhere; the file is
 * decoded in the page, processed on the CPU and handed back as a download.
 */

const ACCEPTED = /^image\/(png|jpeg|webp|gif|bmp|avif)$/;

/** Decode a File into an HTMLImageElement. */
export function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file given.'));
    if (!ACCEPTED.test(file.type)) {
      return reject(new Error(`Unsupported file type: ${file.type || 'unknown'}`));
    }

    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ image: img, name: file.name });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode that image.'));
    };
    img.src = url;
  });
}

/** Hidden <input type="file"> -> onFile. Attach this exactly once. */
export function attachFileInput(fileInput, onFile) {
  fileInput.addEventListener('change', () => {
    if (fileInput.files?.[0]) onFile(fileInput.files[0]);
    fileInput.value = ''; // allow re-picking the same file
  });
}

/** Clipboard images -> onFile. Attach this exactly once. */
export function attachPaste(onFile) {
  window.addEventListener('paste', (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (item) onFile(item.getAsFile());
  });
}

/**
 * Make an element accept dropped image files.
 * Safe to attach to several elements — drop events stop propagating, so a
 * drop zone nested inside a larger target only fires once.
 */
export function attachDropZone(dropZone, onFile) {
  const stop = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  ['dragenter', 'dragover'].forEach((type) =>
    dropZone.addEventListener(type, (e) => {
      stop(e);
      dropZone.classList.add('is-dragover');
    })
  );

  ['dragleave', 'drop'].forEach((type) =>
    dropZone.addEventListener(type, (e) => {
      stop(e);
      if (type === 'dragleave' && dropZone.contains(e.relatedTarget)) return;
      dropZone.classList.remove('is-dragover');
    })
  );

  dropZone.addEventListener('drop', (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file) onFile(file);
  });
}

/** Turn ImageData into a Blob of the requested type. */
export function imageDataToBlob(imageData, type = 'image/png', quality = 0.95) {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.getContext('2d').putImageData(imageData, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Encoding failed.'))),
      type,
      quality
    );
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before killing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** "beach.jpg" -> "beach_warfare.png" */
export function outputName(sourceName, extension) {
  const base = (sourceName || 'image').replace(/\.[^.]+$/, '');
  return `${base}_warfare.${extension}`;
}
