// Corporate membership ID card generator. Renders a business-card-framed ID
// (obsidian + red racing stripe + gold frame + diamond corners) with the
// member's passport photo, details, and personal QR — downloadable as a PNG
// the member can keep on their phone or print as a gym ID.
import QRCode from 'qrcode';
import { downloadCanvas } from './download.js';

const TIER_COLOR = {
  basic: '#8A8580',
  standard: '#3B82F6',
  premium: '#C8922A',
  vip: '#D4D4D8',
};

function loadImg(src) {
  return new Promise((resolve, reject) => {
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

export async function downloadIdCard({
  gymName = 'YOYO GYM',
  accent = '#E63946',
  name = '',
  membershipNumber = '',
  tier = '',
  validUntil = '',
  photoUrl = '',
  qrUrl = '',
}) {
  try {
    await (document.fonts?.ready || Promise.resolve());
  } catch {
    /* ignore */
  }

  const W = 1012;
  const H = 638; // credit/business-card ratio (~1.586)
  const gold = '#C8922A';
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // background
  ctx.fillStyle = '#0A0A0A';
  ctx.fillRect(0, 0, W, H);

  // red diagonal racing band (right side)
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(W * 0.66, 0);
  ctx.lineTo(W * 0.74, 0);
  ctx.lineTo(W * 0.5, H);
  ctx.lineTo(W * 0.42, H);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.moveTo(W * 0.76, 0);
  ctx.lineTo(W * 0.8, 0);
  ctx.lineTo(W * 0.56, H);
  ctx.lineTo(W * 0.52, H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // borders: red outer + gold inset frame
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, W - 16, H - 16);
  ctx.strokeStyle = gold;
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, W - 48, H - 48);

  // diamond corners (gold)
  ctx.fillStyle = gold;
  ctx.font = '22px serif';
  ctx.fillText('◆', 30, 50);
  ctx.fillText('◆', W - 50, 50);
  ctx.fillText('◆', 30, H - 32);
  ctx.fillText('◆', W - 50, H - 32);

  // header
  ctx.fillStyle = accent;
  ctx.font = '600 56px "Bebas Neue", Oswald, sans-serif';
  ctx.fillText(gymName.toUpperCase(), 56, 92);
  ctx.fillStyle = '#8A8580';
  ctx.font = '600 16px Oswald, sans-serif';
  ctx.fillText('OFFICIAL MEMBERSHIP ID', 58, 116);

  // photo (passport 3:4) with gold frame
  const px = 56;
  const py = 150;
  const pw = 260;
  const ph = 347;
  const photo = await loadImg(photoUrl);
  ctx.fillStyle = '#1A1A1A';
  ctx.fillRect(px, py, pw, ph);
  if (photo) drawCover(ctx, photo, px, py, pw, ph);
  ctx.strokeStyle = gold;
  ctx.lineWidth = 2;
  ctx.strokeRect(px, py, pw, ph);

  // details
  const dx = px + pw + 44;
  ctx.fillStyle = '#8A8580';
  ctx.font = '600 16px Oswald, sans-serif';
  ctx.fillText('MEMBER', dx, py + 8);
  ctx.fillStyle = '#F0EDE8';
  ctx.font = '600 46px "Bebas Neue", Oswald, sans-serif';
  ctx.fillText(name.toUpperCase(), dx, py + 56);

  ctx.fillStyle = '#8A8580';
  ctx.font = '600 14px Oswald, sans-serif';
  ctx.fillText('MEMBERSHIP NO.', dx, py + 96);
  ctx.fillStyle = accent;
  ctx.font = '500 30px "DM Mono", monospace';
  ctx.fillText(membershipNumber, dx, py + 128);

  if (tier) {
    const label = tier.toUpperCase();
    ctx.font = '700 18px Oswald, sans-serif';
    const tw = ctx.measureText(label).width + 28;
    ctx.fillStyle = TIER_COLOR[tier] || gold;
    ctx.fillRect(dx, py + 150, tw, 34);
    ctx.fillStyle = '#0A0A0A';
    ctx.fillText(label, dx + 14, py + 174);
  }

  ctx.fillStyle = '#8A8580';
  ctx.font = '600 14px Oswald, sans-serif';
  ctx.fillText('VALID UNTIL', dx, py + 224);
  ctx.fillStyle = '#F0EDE8';
  ctx.font = '500 22px "DM Mono", monospace';
  ctx.fillText(validUntil || 'ONGOING', dx, py + 252);

  // QR (bottom-right, white quiet zone)
  if (qrUrl) {
    const qrData = await QRCode.toDataURL(qrUrl, { margin: 1, width: 320, errorCorrectionLevel: 'H' });
    const qimg = await loadImg(qrData);
    const qz = 150;
    const qx = W - qz - 56;
    const qy = H - qz - 70;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(qx - 10, qy - 10, qz + 20, qz + 20);
    if (qimg) ctx.drawImage(qimg, qx, qy, qz, qz);
    ctx.fillStyle = '#8A8580';
    ctx.font = '500 13px Oswald, sans-serif';
    ctx.fillText('SCAN TO VERIFY', qx + 18, qy + qz + 28);
  }

  await downloadCanvas(canvas, `yoyo-id-${(membershipNumber || name || 'member').replace(/\s+/g, '-')}.png`);
}
