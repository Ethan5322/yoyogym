// Robust cross-browser file delivery.
//
// WHY THIS IS NOT jsPDF's doc.save()
// jsPDF picks its `<a download>` branch whenever the attribute merely EXISTS on
// HTMLAnchorElement, then clicks an anchor that was never attached to the
// document, from inside a setTimeout — i.e. outside the user-gesture window.
// In a desktop browser that works. In the in-app browsers our members actually
// open the link from (WhatsApp, Instagram, Facebook) and in Android WebView the
// attribute exists but is ignored, the click lands nowhere, and NOTHING HAPPENS
// — no file, no error, no way for the UI to tell the member anything. That is
// the "PDF download failed" report.
//
// So delivery is centralised here and walks a ladder of strategies, ending in
// one that cannot silently no-op: opening the file so the member can save it
// from the viewer. If every rung fails we THROW, because a caller that cannot
// tell the difference between success and silence will show a spinner forever.

/** The object URL stays alive long enough for a slow phone to finish reading it
 *  (2 s was short enough to cancel an in-flight download on mobile data) AND
 *  long enough for the caller's "download didn't start? open it here" link to
 *  still resolve when the member gets round to tapping it. */
const URL_TTL_MS = 5 * 60 * 1000;

function anchorDownloadSupported() {
  return typeof HTMLAnchorElement !== 'undefined' && 'download' in HTMLAnchorElement.prototype;
}

/**
 * Save `blob` as `filename`.
 *
 * @returns {{ method: string, url: string|null }} how it was delivered — `url`
 *   is set when the file was handed to a viewer rather than saved outright, so
 *   the caller can offer it as a tappable link.
 * @throws {Error} when no delivery strategy worked.
 */
export function downloadBlob(blob, filename) {
  // Legacy Edge/IE: the only API that actually saves without an anchor.
  if (typeof navigator !== 'undefined' && navigator.msSaveOrOpenBlob) {
    try {
      navigator.msSaveOrOpenBlob(blob, filename);
      return { method: 'msSaveOrOpenBlob', url: null };
    } catch {
      /* fall through */
    }
  }

  let url = null;
  try {
    url = URL.createObjectURL(blob);
  } catch (err) {
    throw new Error('Could not prepare the file for download.');
  }
  const revoke = () => setTimeout(() => URL.revokeObjectURL(url), URL_TTL_MS);

  // Preferred path: a real anchor, attached to the document (Firefox refuses to
  // act on a detached one) and clicked synchronously inside the caller's user
  // gesture (Safari and the in-app browsers drop deferred clicks).
  if (anchorDownloadSupported()) {
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      revoke();
      return { method: 'anchor', url };
    } catch {
      /* fall through to opening it */
    }
  }

  // Fallback: hand the file to a viewer. The member sees the PDF and can save
  // or share it from there — far better than nothing happening.
  try {
    const win = window.open(url, '_blank', 'noopener');
    if (win) {
      revoke();
      return { method: 'window', url };
    }
  } catch {
    /* popup blocked — try navigating instead */
  }

  try {
    window.location.href = url;
    revoke();
    return { method: 'location', url };
  } catch {
    /* nothing left */
  }

  URL.revokeObjectURL(url);
  throw new Error('Your browser blocked the download. Try opening this page in Chrome or Safari.');
}

/** Save a jsPDF document. Always use this instead of `doc.save()`. */
export function downloadPdf(doc, filename) {
  return downloadBlob(doc.output('blob'), filename);
}

/** Download a canvas as a PNG (uses toBlob, which is far more reliable than a
 *  multi-MB toDataURL anchor). Rejects rather than resolving false, so a
 *  tainted canvas or a blocked download reaches the caller's error handler. */
export function downloadCanvas(canvas, filename) {
  return new Promise((resolve, reject) => {
    if (!canvas.toBlob) {
      // Very old browsers: a data URL is the only option available.
      try {
        resolve(downloadBlob(dataUrlToBlob(canvas.toDataURL('image/png')), filename));
      } catch (err) {
        reject(err);
      }
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Could not render the image. If it contains a photo from another site, re-upload the photo and try again.'));
        return;
      }
      try {
        resolve(downloadBlob(blob, filename));
      } catch (err) {
        reject(err);
      }
    }, 'image/png');
  });
}

function dataUrlToBlob(dataUrl) {
  const [head, body] = dataUrl.split(',');
  const mime = /:(.*?);/.exec(head)?.[1] || 'application/octet-stream';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
