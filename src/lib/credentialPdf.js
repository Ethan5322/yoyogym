// Professional one-page PDF credential for staff & trainers — photo, role,
// ID number, verification code and a scan-to-verify QR. Mirrors the premium
// membership document style. Uses jsPDF (already a dependency) + qrcode.
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

function hexToRgb(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '');
  if (!m) return [230, 57, 70];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function loadDataUrl(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || 600;
        c.height = img.naturalHeight || 800;
        c.getContext('2d').drawImage(img, 0, 0);
        resolve(c.toDataURL('image/jpeg', 0.9));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function downloadCredentialPdf({
  gymName = 'Yoyo GYM',
  accent = '#E63946',
  roleLabel = 'STAFF',
  subtitle = 'STAFF CREDENTIAL',
  name = '',
  number = '',
  verificationCode = '',
  badgeText = '',
  photoUrl = '',
  qrUrl = '',
  issued = new Date(),
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const M = 18;
  const [r, g, b] = hexToRgb(accent);
  const gold = [200, 146, 42];

  // Header band
  doc.setFillColor(10, 10, 10);
  doc.rect(0, 0, W, 56, 'F');
  doc.setFillColor(r, g, b);
  doc.rect(0, 56, W, 1.6, 'F');
  doc.setTextColor(r, g, b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.text(gymName.toUpperCase(), M, 30);
  doc.setTextColor(170, 170, 170);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(subtitle.toUpperCase(), M, 41);

  // Photo (passport 3:4) with gold frame
  const px = M, py = 70, pw = 45, ph = 60;
  const photo = await loadDataUrl(photoUrl);
  doc.setFillColor(26, 26, 26);
  doc.rect(px, py, pw, ph, 'F');
  if (photo) doc.addImage(photo, 'JPEG', px, py, pw, ph);
  doc.setDrawColor(gold[0], gold[1], gold[2]);
  doc.setLineWidth(0.6);
  doc.rect(px, py, pw, ph);

  // Details column
  const dx = px + pw + 12;
  let dy = py + 4;
  doc.setTextColor(120, 120, 120);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(roleLabel.toUpperCase(), dx, dy);
  dy += 9;
  doc.setTextColor(20, 20, 20);
  doc.setFontSize(20);
  doc.text(name.toUpperCase(), dx, dy);
  dy += 10;

  if (badgeText) {
    doc.setFillColor(r, g, b);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    const tw = doc.getTextWidth(badgeText.toUpperCase()) + 8;
    doc.rect(dx, dy - 5, tw, 7, 'F');
    doc.text(badgeText.toUpperCase(), dx + 4, dy);
    dy += 12;
  }

  const row = (label, value) => {
    doc.setTextColor(120, 120, 120);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(label.toUpperCase(), dx, dy);
    doc.setTextColor(20, 20, 20);
    doc.setFont('courier', 'bold');
    doc.setFontSize(13);
    doc.text(String(value || '—'), dx, dy + 6);
    dy += 14;
  };
  row(`${roleLabel} No.`, number);
  if (verificationCode) row('Verification Code', verificationCode);

  // QR (scan to verify)
  const qr = await QRCode.toDataURL(qrUrl || number || name, { margin: 1, width: 320, errorCorrectionLevel: 'H' });
  const qz = 42;
  const qx = W - M - qz;
  doc.addImage(qr, 'PNG', qx, py, qz, qz);
  doc.setTextColor(120, 120, 120);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('SCAN TO VERIFY', qx, py + qz + 5);

  // Divider + issue/signature
  const yLine = 150;
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(M, yLine, W - M, yLine);
  doc.setTextColor(90, 90, 90);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    `Issued: ${new Date(issued).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    M,
    yLine + 10
  );
  doc.text('Authorised signature: ____________________________', M, yLine + 24);

  doc.setTextColor(150, 150, 150);
  doc.setFontSize(8);
  doc.text(
    `This card certifies the holder as ${roleLabel.toLowerCase()} of ${gymName}. Present it for access and identification.`,
    M,
    285
  );

  doc.save(`${roleLabel.toLowerCase()}-credential-${(number || name || 'id').replace(/\s+/g, '-')}.pdf`);
}
