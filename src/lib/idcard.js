// Corporate membership ID card generator. Renders a two-sided, business-card-
// framed ID (obsidian + red racing stripe + gold frame + diamond corners):
//
//   FRONT — passport photo, holder name, role, ID number, tier badge, validity,
//           and the personal QR.
//   BACK  — the holder's identifying details (date of birth, gender, ID number,
//           contact, emergency contact…) plus a Code 128 barcode of the
//           verification code, so reception can scan the card at the door.
//
// The same renderer serves members, staff and trainers — the caller supplies
// the role labels and the identification `fields` to print.
import QRCode from 'qrcode';
import { downloadCanvas } from './download.js';
import { drawBarcode } from './barcode.js';

const TIER_COLOR = {
  basic: '#8A8580',
  standard: '#3B82F6',
  premium: '#C8922A',
  vip: '#D4D4D8',
};

const W = 1012;
const H = 638; // credit/business-card ratio (~1.586)
const GAP = 36;
const GOLD = '#C8922A';
const INK = '#0A0A0A';
const PAPER = '#F0EDE8';
const MUTED = '#8A8580';

function loadImg(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// draw an image "cover" into a rectangle
function drawCover(ctx, img, x, y, w, h) {
  const ir = img.width / img.height;
  const r = w / h;
  let sw = img.width;
  let sh = img.height;
  if (ir > r) {
    sw = img.height * r;
  } else {
    sh = img.width / r;
  }
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

/** Trim `text` with an ellipsis until it fits `maxWidth` at the current font. */
function fit(ctx, text, maxWidth) {
  let t = String(text ?? '');
  if (ctx.measureText(t).width <= maxWidth) return t;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

/** The obsidian card body: background, racing stripe, frame and corner diamonds. */
function drawShell(ctx, oy, accent) {
  ctx.fillStyle = INK;
  ctx.fillRect(0, oy, W, H);

  // red diagonal racing band (right side), clipped to this card face
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, oy, W, H);
  ctx.clip();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(W * 0.66, oy);
  ctx.lineTo(W * 0.74, oy);
  ctx.lineTo(W * 0.5, oy + H);
  ctx.lineTo(W * 0.42, oy + H);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.moveTo(W * 0.76, oy);
  ctx.lineTo(W * 0.8, oy);
  ctx.lineTo(W * 0.56, oy + H);
  ctx.lineTo(W * 0.52, oy + H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // borders: red outer + gold inset frame
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.strokeRect(8, oy + 8, W - 16, H - 16);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.strokeRect(24, oy + 24, W - 48, H - 48);

  // diamond corners (gold)
  ctx.fillStyle = GOLD;
  ctx.font = '22px serif';
  ctx.fillText('◆', 30, oy + 50);
  ctx.fillText('◆', W - 50, oy + 50);
  ctx.fillText('◆', 30, oy + H - 32);
  ctx.fillText('◆', W - 50, oy + H - 32);
}

async function drawFront(ctx, oy, o) {
  drawShell(ctx, oy, o.accent);

  // header
  ctx.fillStyle = o.accent;
  ctx.font = '600 56px "Bebas Neue", Oswald, sans-serif';
  ctx.fillText(fit(ctx, o.gymName.toUpperCase(), W - 120), 56, oy + 92);
  ctx.fillStyle = MUTED;
  ctx.font = '600 16px Oswald, sans-serif';
  ctx.fillText(o.subtitle.toUpperCase(), 58, oy + 116);

  // photo (passport 3:4) with gold frame
  const px = 56;
  const py = oy + 150;
  const pw = 260;
  const ph = 347;
  const photo = await loadImg(o.photoUrl);
  ctx.fillStyle = '#1A1A1A';
  ctx.fillRect(px, py, pw, ph);
  if (photo) {
    drawCover(ctx, photo, px, py, pw, ph);
  } else {
    ctx.fillStyle = MUTED;
    ctx.font = '500 16px Oswald, sans-serif';
    ctx.fillText('NO PHOTO', px + 82, py + ph / 2);
  }
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.strokeRect(px, py, pw, ph);

  // details column — width stops short of the QR block on the right
  const dx = px + pw + 44;
  const dw = W - dx - 240;
  ctx.fillStyle = MUTED;
  ctx.font = '600 16px Oswald, sans-serif';
  ctx.fillText(o.roleLabel.toUpperCase(), dx, py + 8);
  ctx.fillStyle = PAPER;
  ctx.font = '600 46px "Bebas Neue", Oswald, sans-serif';
  ctx.fillText(fit(ctx, o.name.toUpperCase(), dw), dx, py + 56);

  ctx.fillStyle = MUTED;
  ctx.font = '600 14px Oswald, sans-serif';
  ctx.fillText(o.idLabel.toUpperCase(), dx, py + 96);
  ctx.fillStyle = o.accent;
  ctx.font = '500 30px "DM Mono", monospace';
  ctx.fillText(o.membershipNumber, dx, py + 128);

  // Badge: explicit text (job title / specialization) overrides the tier badge.
  const label = (o.badgeText || o.tier || '').toUpperCase();
  if (label) {
    ctx.font = '700 18px Oswald, sans-serif';
    const tw = ctx.measureText(label).width + 28;
    ctx.fillStyle = o.badgeColor || TIER_COLOR[o.tier] || GOLD;
    ctx.fillRect(dx, py + 150, tw, 34);
    ctx.fillStyle = INK;
    ctx.fillText(label, dx + 14, py + 174);
  }

  ctx.fillStyle = MUTED;
  ctx.font = '600 14px Oswald, sans-serif';
  ctx.fillText(o.validLabel.toUpperCase(), dx, py + 224);
  ctx.fillStyle = PAPER;
  ctx.font = '500 22px "DM Mono", monospace';
  ctx.fillText(o.validUntil || 'ONGOING', dx, py + 252);

  // QR (bottom-right, white quiet zone)
  if (o.qrUrl) {
    const qrData = await QRCode.toDataURL(o.qrUrl, { margin: 1, width: 320, errorCorrectionLevel: 'H' });
    const qimg = await loadImg(qrData);
    const qz = 150;
    const qx = W - qz - 56;
    const qy = oy + H - qz - 70;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(qx - 10, qy - 10, qz + 20, qz + 20);
    if (qimg) ctx.drawImage(qimg, qx, qy, qz, qz);
    ctx.fillStyle = MUTED;
    ctx.font = '500 13px Oswald, sans-serif';
    ctx.fillText('SCAN TO VERIFY', qx + 18, qy + qz + 28);
  }
}

function drawBack(ctx, oy, o) {
  drawShell(ctx, oy, o.accent);

  // header
  ctx.fillStyle = PAPER;
  ctx.font = '600 32px "Bebas Neue", Oswald, sans-serif';
  ctx.fillText('HOLDER IDENTIFICATION', 56, oy + 84);
  ctx.fillStyle = MUTED;
  ctx.font = '600 14px Oswald, sans-serif';
  ctx.fillText(`${o.gymName.toUpperCase()} • ${o.roleLabel.toUpperCase()}`, 58, oy + 108);

  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(56, oy + 126);
  ctx.lineTo(W - 56, oy + 126);
  ctx.stroke();

  // Identification fields — two columns, printed in the order supplied.
  const fields = (o.fields || []).filter((f) => f && f.value);
  const colX = [56, 540];
  const colW = 400;
  const rowH = 60;
  fields.slice(0, 8).forEach((f, i) => {
    const x = colX[i % 2];
    const y = oy + 168 + Math.floor(i / 2) * rowH;
    ctx.fillStyle = MUTED;
    ctx.font = '600 13px Oswald, sans-serif';
    ctx.fillText(String(f.label).toUpperCase(), x, y);
    ctx.fillStyle = PAPER;
    ctx.font = '500 20px "DM Mono", monospace';
    ctx.fillText(fit(ctx, f.value, colW), x, y + 26);
  });

  // Verification barcode strip (Code 128 of the verification code), bottom-left.
  const bx = 56;
  const bw = 560;
  const bh = 84;
  const by = oy + H - 150;
  if (o.verificationCode) {
    ctx.fillStyle = MUTED;
    ctx.font = '600 13px Oswald, sans-serif';
    ctx.fillText('VERIFICATION CODE — SCAN AT RECEPTION', bx, by - 20);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(bx - 12, by - 12, bw + 24, bh + 52);
    try {
      drawBarcode(ctx, o.verificationCode, { x: bx, y: by, width: bw, height: bh });
      ctx.fillStyle = INK;
      ctx.font = '500 24px "DM Mono", monospace';
      const tw = ctx.measureText(o.verificationCode).width;
      ctx.fillText(o.verificationCode, bx + (bw - tw) / 2, by + bh + 28);
    } catch {
      // A code outside the Code 128 B alphabet: print it plainly rather than
      // shipping a barcode no scanner can read.
      ctx.fillStyle = INK;
      ctx.font = '500 30px "DM Mono", monospace';
      ctx.fillText(o.verificationCode, bx + 16, by + bh / 2 + 10);
    }
  }

  // Right column beside the barcode: issue date + property notice (word-wrapped).
  const rx = 656;
  if (o.issuedOn) {
    ctx.fillStyle = MUTED;
    ctx.font = '600 13px Oswald, sans-serif';
    ctx.fillText('ISSUED', rx, by - 4);
    ctx.fillStyle = PAPER;
    ctx.font = '500 20px "DM Mono", monospace';
    ctx.fillText(o.issuedOn, rx, by + 22);
  }
  ctx.fillStyle = MUTED;
  ctx.font = '500 12px Oswald, sans-serif';
  const notice = o.footerNote || `This card remains the property of ${o.gymName}. If found, please return it to reception.`;
  wrapText(ctx, notice, rx, by + 56, W - rx - 48, 16);
}

/** Draw word-wrapped text, breaking on spaces to fit `maxWidth`. */
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(/\s+/);
  let line = '';
  let yy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = w;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}

// Business-card physical size (ISO CR80-ish), used for the print-ready PDF.
const CARD_W_MM = 85.6;
const CARD_H_MM = 54;

function normalise(o) {
  return {
    gymName: 'YOYO GYM',
    accent: '#E63946',
    name: '',
    membershipNumber: '',
    tier: '',
    validUntil: '',
    photoUrl: '',
    qrUrl: '',
    roleLabel: 'MEMBER',
    subtitle: 'OFFICIAL MEMBERSHIP ID',
    idLabel: 'MEMBERSHIP NO.',
    badgeText: '',
    badgeColor: '',
    validLabel: 'VALID UNTIL',
    verificationCode: '',
    fields: [],
    issuedOn: '',
    footerNote: '',
    ...o,
  };
}

async function ready() {
  try {
    await (document.fonts?.ready || Promise.resolve());
  } catch {
    /* ignore */
  }
}

/** Render one card face ('front' | 'back') to its own high-resolution canvas.
 *  `scale` multiplies the pixel density — 3x gives a crisp, print-ready image. */
async function renderFace(o, which, scale = 3) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  if (which === 'front') await drawFront(ctx, 0, o);
  else drawBack(ctx, 0, o);
  return canvas;
}

const fileBase = (o) => `yoyo-id-${(o.membershipNumber || o.name || 'member').replace(/\s+/g, '-')}`;

/** Download the ID card as a high-resolution PNG (front above back). */
export async function downloadIdCard(input) {
  const o = normalise(input);
  await ready();

  const scale = 3; // 3× ≈ 3036×3894 px — sharp when printed at card size
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round((H * 2 + GAP) * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  // The gap between the two faces reads as a cut line when the card is printed.
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, W, H * 2 + GAP);

  await drawFront(ctx, 0, o);
  drawBack(ctx, H + GAP, o);

  await downloadCanvas(canvas, `${fileBase(o)}.png`);
}

/** Download the ID card as a print-ready PDF: page 1 front, page 2 back,
 *  each sized to a physical business card. */
export async function downloadIdCardPdf(input) {
  const o = normalise(input);
  await ready();

  const [{ jsPDF }, front, back] = await Promise.all([
    import('jspdf'),
    renderFace(o, 'front', 3),
    renderFace(o, 'back', 3),
  ]);

  const doc = new jsPDF({ unit: 'mm', format: [CARD_W_MM, CARD_H_MM], orientation: 'landscape' });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  doc.addImage(front.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pw, ph, undefined, 'FAST');
  doc.addPage([CARD_W_MM, CARD_H_MM], 'landscape');
  doc.addImage(back.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pw, ph, undefined, 'FAST');
  doc.save(`${fileBase(o)}.pdf`);
}
