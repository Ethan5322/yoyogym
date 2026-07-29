// Corporate membership ID card generator. Renders a SINGLE-SIDED, ATM-card-
// sized ID (obsidian + red racing stripe + gold frame + diamond corners) that
// carries everything on the front:
//
//   passport photo · holder name · role · ID number · tier badge · validity ·
//   scan-to-verify QR · the holder's identifying details (DOB, ID number,
//   contact, emergency contact…) · a Code 128 barcode of the verification code
//
// Downloads as a high-resolution PNG or a print-ready PDF at exact CR80 size
// (85.6 × 54 mm — the same as a bank/ATM card). The same renderer serves
// members, staff and trainers — the caller supplies the role labels and the
// identification `fields` to print.
import QRCode from 'qrcode';
import { downloadCanvas, downloadPdf } from './download.js';
import { drawBarcode } from './barcode.js';

const TIER_COLOR = {
  basic: '#8A8580',
  standard: '#3B82F6',
  premium: '#C8922A',
  vip: '#D4D4D8',
};

// Canvas design space. 1012×638 matches the CR80 ratio (85.6/54 ≈ 1.586).
const W = 1012;
const H = 638;
// MuleSoo agency-credit lockup: the transparent logo + wordmark (Sora) + contact
// (DM Sans), rendered once by MuleSoo's brand pipeline and served from /public.
// The card is dark, so the light-ink variant. Aspect is fixed — size by it, never
// stretch the mark.
const MULESOO_CREDIT_SRC = '/brand/mulesoo-credit-on-dark.png';
const MULESOO_CREDIT_ASPECT = 4.25;

const GOLD = '#C8922A';
const INK = '#0A0A0A';
const PAPER = '#F0EDE8';
const MUTED = '#8A8580';

// CR80 / ATM card physical size, used by the PDF so it prints 1:1.
const CARD_W_MM = 85.6;
const CARD_H_MM = 54;

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

// Card geometry (shared by the shell and the content layout so zones align).
const HEADER_H = 120; // header band height
const FOOTER_Y = 540; // top of the barcode / verification footer zone

/** The obsidian card body: background, contained racing accent, frame, header
 *  rule and corner diamonds. The accent is CLIPPED to the header so it never
 *  crosses the photo, the details grid or the machine-readable barcode. */
function drawShell(ctx, accent) {
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);

  // Racing accent, confined to the header band (a top-right flourish, not a
  // full-height slash across the card's content).
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, HEADER_H);
  ctx.clip();
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(W * 0.62, -20);
  ctx.lineTo(W * 0.72, -20);
  ctx.lineTo(W * 0.5, HEADER_H + 20);
  ctx.lineTo(W * 0.4, HEADER_H + 20);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.moveTo(W * 0.75, -20);
  ctx.lineTo(W * 0.8, -20);
  ctx.lineTo(W * 0.58, HEADER_H + 20);
  ctx.lineTo(W * 0.53, HEADER_H + 20);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // borders: red outer + gold inset frame
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, W - 16, H - 16);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, W - 48, H - 48);

  // gold hairline under the header, separating it from the identity zone
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(40, HEADER_H);
  ctx.lineTo(W - 40, HEADER_H);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // diamond corners (gold)
  ctx.fillStyle = GOLD;
  ctx.font = '22px serif';
  ctx.fillText('◆', 30, 50);
  ctx.fillText('◆', W - 50, 50);
  ctx.fillText('◆', 30, H - 32);
  ctx.fillText('◆', W - 50, H - 32);
}

/** Draw the complete single-face card into `ctx` (all details on the front). */
async function drawCard(ctx, o) {
  drawShell(ctx, o.accent);

  // ── Header ────────────────────────────────────────────────────────────────
  ctx.fillStyle = o.accent;
  ctx.font = '600 46px "Bebas Neue", Oswald, sans-serif';
  ctx.fillText(fit(ctx, o.gymName.toUpperCase(), 620), 56, 88);
  ctx.fillStyle = MUTED;
  ctx.font = '600 14px Oswald, sans-serif';
  ctx.fillText(o.subtitle.toUpperCase(), 58, 112);

  // ── QR (top-right, white quiet zone) ─────────────────────────────────────
  if (o.qrUrl) {
    const qz = 136;
    const qx = W - qz - 60;
    const qy = 132;
    const qrData = await QRCode.toDataURL(o.qrUrl, { margin: 1, width: 320, errorCorrectionLevel: 'H' });
    const qimg = await loadImg(qrData);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(qx - 8, qy - 8, qz + 16, qz + 16);
    if (qimg) ctx.drawImage(qimg, qx, qy, qz, qz);
    ctx.fillStyle = MUTED;
    ctx.font = '500 12px Oswald, sans-serif';
    ctx.fillText('SCAN TO VERIFY', qx + 14, qy + qz + 26);
  }

  // ── Photo (passport 3:4) with gold frame ─────────────────────────────────
  // 210×280 on the 1012-px canvas prints at ≈17.8×23.7 mm on the CR80 card —
  // the recommended corporate/ID-badge photo size (SA smart-ID class).
  const px = 56;
  const py = 130;
  const pw = 210;
  const ph = 258;
  const photo = await loadImg(o.photoUrl);
  ctx.fillStyle = '#1A1A1A';
  ctx.fillRect(px, py, pw, ph);
  if (photo) {
    drawCover(ctx, photo, px, py, pw, ph);
  } else {
    ctx.fillStyle = MUTED;
    ctx.font = '500 15px Oswald, sans-serif';
    ctx.fillText('NO PHOTO', px + 56, py + ph / 2);
  }
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.strokeRect(px, py, pw, ph);

  // ── Primary details beside the photo ─────────────────────────────────────
  const dx = px + pw + 36;
  const dw = W - dx - 220; // stops short of the QR block
  ctx.fillStyle = MUTED;
  ctx.font = '600 14px Oswald, sans-serif';
  ctx.fillText(o.roleLabel.toUpperCase(), dx, 154);
  ctx.fillStyle = PAPER;
  ctx.font = '600 40px "Bebas Neue", Oswald, sans-serif';
  ctx.fillText(fit(ctx, o.name.toUpperCase(), dw), dx, 194);

  ctx.fillStyle = MUTED;
  ctx.font = '600 12px Oswald, sans-serif';
  ctx.fillText(o.idLabel.toUpperCase(), dx, 226);
  ctx.fillStyle = o.accent;
  ctx.font = '500 27px "DM Mono", monospace';
  ctx.fillText(o.membershipNumber, dx, 254);

  // Badge: explicit text (job title / specialization) overrides the tier badge.
  const label = (o.badgeText || o.tier || '').toUpperCase();
  if (label) {
    ctx.font = '700 16px Oswald, sans-serif';
    const tw = ctx.measureText(label).width + 24;
    ctx.fillStyle = o.badgeColor || TIER_COLOR[o.tier] || GOLD;
    ctx.fillRect(dx, 272, tw, 30);
    ctx.fillStyle = INK;
    ctx.fillText(label, dx + 12, 293);
  }

  ctx.fillStyle = MUTED;
  ctx.font = '600 12px Oswald, sans-serif';
  ctx.fillText(o.validLabel.toUpperCase(), dx, 330);
  ctx.fillStyle = PAPER;
  ctx.font = '500 20px "DM Mono", monospace';
  ctx.fillText(o.validUntil || 'ONGOING', dx, 356);

  // Issue date sits alongside the valid-until, right of the photo.
  if (o.issuedOn) {
    ctx.fillStyle = MUTED;
    ctx.font = '600 12px Oswald, sans-serif';
    ctx.fillText('ISSUED', dx + 250, 330);
    ctx.fillStyle = PAPER;
    ctx.font = '500 20px "DM Mono", monospace';
    ctx.fillText(o.issuedOn, dx + 250, 356);
  }

  // ── Holder identification: divider + compact grid ────────────────────────
  const fields = (o.fields || []).filter((f) => f && f.value);
  if (fields.length) {
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(56, 398);
    ctx.lineTo(W - 56, 398);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const colX = [56, 372, 688];
    const colW = 280;
    // Tight label→value pairing with a compact row pitch (was airy).
    fields.slice(0, 6).forEach((f, i) => {
      const x = colX[i % 3];
      const y = 424 + Math.floor(i / 3) * 40;
      ctx.fillStyle = MUTED;
      ctx.font = '600 11px Oswald, sans-serif';
      ctx.fillText(String(f.label).toUpperCase(), x, y);
      ctx.fillStyle = PAPER;
      ctx.font = '500 17px "DM Mono", monospace';
      ctx.fillText(fit(ctx, f.value, colW), x, y + 20);
    });
  }

  // ── Footer: verification barcode (left) + agency credit (right) ──────────
  const footY = 522;

  // Verification code: label ON TOP of the barcode (right after the details),
  // with the human-readable code beneath the bars — not off to the side.
  if (o.verificationCode) {
    ctx.fillStyle = MUTED;
    ctx.font = '600 11px Oswald, sans-serif';
    ctx.fillText('VERIFICATION CODE', 56, footY);

    const bx = 64;
    const bw = 360;
    const bh = 40;
    const by = footY + 12;
    // White quiet zone wraps the bars + the code text, and is inset from the
    // card frame (a clear margin all round — the barcode never touches it).
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(bx - 8, by - 6, bw + 16, bh + 34);
    try {
      drawBarcode(ctx, o.verificationCode, { x: bx, y: by, width: bw, height: bh, quietZone: 8 });
    } catch {
      /* code outside Code 128 B — the text below still identifies it */
    }
    ctx.fillStyle = INK;
    ctx.font = '600 16px "DM Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(o.verificationCode, bx + bw / 2, by + bh + 20);
    ctx.textAlign = 'left';
  }

  // Agency credit — every card is designed & built by MuleSoo Digital Services.
  //
  // This used to be four lines of Oswald/DM Mono: Yoyo GYM's own typefaces, with
  // no MuleSoo logo at all. It is now the official lockup — the transparent
  // MuleSoo mark, the wordmark in Sora, and the contact line in DM Sans — so the
  // agency signature is in MuleSoo's brand while the card itself stays Yoyo's.
  //
  // It occupies the band to the RIGHT of the barcode (x ≥ 470); the barcode ends
  // at x = 424, so the two can never collide.
  const cx = 470;
  const creditW = Math.min(470, W - cx - 30);
  const creditH = creditW / MULESOO_CREDIT_ASPECT;
  const creditY = Math.min(footY - 6, H - creditH - 14);

  const credit = await loadImg(MULESOO_CREDIT_SRC);
  if (credit) {
    ctx.drawImage(credit, cx, creditY, creditW, creditH);
  } else {
    // Attribution must survive even if the asset fails to load.
    ctx.fillStyle = MUTED;
    ctx.font = '600 10px Oswald, sans-serif';
    ctx.fillText('DESIGNED & BUILT BY', cx, footY);
    ctx.fillStyle = GOLD;
    ctx.font = '700 16px Oswald, sans-serif';
    ctx.fillText(o.builtBy.toUpperCase(), cx, footY + 23);
    ctx.fillStyle = PAPER;
    ctx.font = '500 13px "DM Mono", monospace';
    ctx.fillText(`${o.builtByUrl}  |  ${o.builtByEmail}`, cx, footY + 45);
  }
}

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
    // Agency credit printed on every card.
    builtBy: 'MuleSoo Digital Services',
    builtByUrl: 'mulesoo.com',
    builtByEmail: 'hello@mulesoo.com',
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

/** Render the card to a high-resolution canvas (`scale`× pixel density). */
export async function renderCard(o, scale = 3) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  await drawCard(ctx, o);
  return canvas;
}

const fileBase = (o) => `yoyo-id-${(o.membershipNumber || o.name || 'member').replace(/\s+/g, '-')}`;

/** Download the single-face ID card as a high-resolution PNG. */
export async function downloadIdCard(input) {
  const o = normalise(input);
  await ready();
  const canvas = await renderCard(o, 3); // 3× ≈ 3036×1914 px — crisp at card size
  await downloadCanvas(canvas, `${fileBase(o)}.png`);
}

/** Download the ID card as a print-ready single-page PDF at exact ATM-card
 *  (CR80) size: 85.6 × 54 mm. */
export async function downloadIdCardPdf(input) {
  const o = normalise(input);
  await ready();

  const [{ jsPDF }, canvas] = await Promise.all([import('jspdf'), renderCard(o, 3)]);

  const doc = new jsPDF({ unit: 'mm', format: [CARD_W_MM, CARD_H_MM], orientation: 'landscape' });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pw, ph, undefined, 'FAST');
  return downloadPdf(doc, `${fileBase(o)}.pdf`);
}
