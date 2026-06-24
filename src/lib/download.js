// Robust cross-browser file download. Uses a Blob + object URL + an anchor that
// is attached to the DOM (required by Firefox) and falls back to opening the
// file in a new tab when the download attribute isn't honoured (e.g. some
// mobile browsers). Avoids the "click does nothing / refused to download"
// problem caused by huge data: URLs or detached anchors.
export function downloadBlob(blob, filename) {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 2000);
    return true;
  } catch {
    return false;
  }
}

/** Download a canvas as a PNG (uses toBlob, which is far more reliable than a
 *  multi-MB toDataURL anchor). */
export function downloadCanvas(canvas, filename) {
  return new Promise((resolve) => {
    if (canvas.toBlob) {
      canvas.toBlob((blob) => {
        if (blob) downloadBlob(blob, filename);
        resolve(!!blob);
      }, 'image/png');
    } else {
      // very old fallback
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      resolve(true);
    }
  });
}
