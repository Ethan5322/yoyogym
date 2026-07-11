// Corporate ID photo pipeline — shared by the live biometric capture and
// gallery uploads, so every card photo obeys the same standard.
//
// Output: 600×800 px portrait (3:4 — the exact aspect of the photo window on
// the CR80 card, ≈18×24 mm when the card prints at true ATM-card size, and
// ~300 DPI at passport print size).
//
// Framing follows the ICAO/corporate portrait convention rather than a naive
// centre crop:
//   · head (chin→crown) fills ~55% of the photo height
//   · eye line sits ~43% from the top
//   · face centred horizontally on the midpoint of the eyes
//
// The face and eye landmarks are detected in the browser (face-api — nothing
// leaves the device). When no face is found we fall back to a centred crop so
// the flow never dead-ends, and report it so the UI can suggest a retake.

export const ID_PHOTO_W = 600;
export const ID_PHOTO_H = 800;
const RATIO = ID_PHOTO_W / ID_PHOTO_H; // 3:4 portrait

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/**
 * Corporate portrait frame around a detected face.
 * `box` is the detector's face box (spans roughly chin→brow, ~80% of the full
 * head, so head ≈ box.height / 0.8). `eyes` ({ x, y } midpoint of both eyes)
 * refines placement when landmarks are available.
 */
export function corporateFrame(iw, ih, box, eyes) {
  const headH = box.height / 0.8;
  let h = headH / 0.55; // head fills ~55% of the frame
  let w = h * RATIO;
  const fit = Math.min(iw / w, ih / h, 1); // never larger than the source
  w *= fit;
  h *= fit;
  const cx = eyes ? eyes.x : box.x + box.width / 2;
  const eyeLineY = eyes ? eyes.y : box.y + box.height * 0.4;
  const x = clamp(cx - w / 2, 0, iw - w);
  const y = clamp(eyeLineY - h * 0.43, 0, ih - h);
  return { x, y, w, h };
}

function centerFrame(iw, ih) {
  let w = iw;
  let h = w / RATIO;
  if (h > ih) {
    h = ih;
    w = h * RATIO;
  }
  return { x: (iw - w) / 2, y: (ih - h) / 2, w, h };
}

/** Render a source region to the standard 600×800 JPEG data URL. */
export function renderIdPhoto(source, frame) {
  const out = document.createElement('canvas');
  out.width = ID_PHOTO_W;
  out.height = ID_PHOTO_H;
  out
    .getContext('2d')
    .drawImage(source, frame.x, frame.y, frame.w, frame.h, 0, 0, ID_PHOTO_W, ID_PHOTO_H);
  return out.toDataURL('image/jpeg', 0.9);
}

function loadFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image. Please try a JPG or PNG.'));
    };
    img.src = url;
  });
}

// Phone photos can be 4000px+; detection on a capped working canvas is far
// faster and loses nothing at the 600×800 output size.
function toWorkCanvas(img) {
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Auto-crop a gallery image to the corporate 600×800 ID photo.
 * Returns { dataUrl, faceDetected } — faceDetected tells the UI whether the
 * crop was framed on the detected face/eyes or just centred.
 */
export async function autoCropIdPhoto(file) {
  if (!file || !/^image\//.test(file.type))
    throw new Error('Please choose an image file (JPG or PNG).');
  if (file.size > 15 * 1024 * 1024)
    throw new Error('That image is too large — please pick one under 15 MB.');

  const img = await loadFile(file);
  const work = toWorkCanvas(img);

  let frame = null;
  let faceDetected = false;
  try {
    const { getFaceApi } = await import('./face/faceapi.js');
    const faceapi = await getFaceApi();
    const det = await faceapi
      .detectSingleFace(work, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 }))
      .withFaceLandmarks();
    if (det?.detection?.box?.width) {
      const box = det.detection.box;
      const pts = [...det.landmarks.getLeftEye(), ...det.landmarks.getRightEye()];
      const eyes = pts.length
        ? {
            x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
            y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
          }
        : null;
      frame = corporateFrame(work.width, work.height, box, eyes);
      faceDetected = true;
    }
  } catch {
    /* models unavailable/offline — the centred crop below still works */
  }
  if (!frame) frame = centerFrame(work.width, work.height);

  return { dataUrl: renderIdPhoto(work, frame), faceDetected };
}
