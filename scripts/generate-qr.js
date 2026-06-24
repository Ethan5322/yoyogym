// Generates printable Yoyo GYM QR codes (PNG, high-res) and a branded PDF.
// Run: node scripts/generate-qr.js
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import { mkdirSync, writeFileSync } from 'node:fs';

const SITE = 'https://yoyogym.vercel.app/';
const GYM = 'YOYO GYM';
const ACCENT = [230, 57, 70];

const codes = [
  { key: 'company', label: 'Company QR — Join or Log In', url: `${SITE}?src=qr`, file: 'yoyo-gym-company-qr' },
  { key: 'admin', label: 'Admin QR — Staff Access', url: `${SITE}admin/login`, file: 'yoyo-gym-admin-qr' },
  { key: 'newmember', label: 'New Member — Register', url: `${SITE}register?src=qr`, file: 'yoyo-gym-newmember-qr' },
  { key: 'existing', label: 'Members — Check In & Book', url: `${SITE}member?src=qr`, file: 'yoyo-gym-existingmember-qr' },
];

mkdirSync('qr', { recursive: true });

const dataUrls = {};
for (const c of codes) {
  // high-resolution PNG for print
  await QRCode.toFile(`qr/${c.file}.png`, c.url, { width: 1200, margin: 2, errorCorrectionLevel: 'H' });
  dataUrls[c.key] = await QRCode.toDataURL(c.url, { width: 600, margin: 1, errorCorrectionLevel: 'H' });
  console.log(`✔ qr/${c.file}.png  ->  ${c.url}`);
}

// ---- branded printable PDF (A4) ----
const doc = new jsPDF({ unit: 'pt', format: 'a4' });
const W = doc.internal.pageSize.getWidth();
const H = doc.internal.pageSize.getHeight();

function page(label, url, dataUrl) {
  doc.setFillColor(10, 10, 10);
  doc.rect(0, 0, W, H, 'F');
  doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(40);
  doc.text(GYM, W / 2, 110, { align: 'center' });
  doc.setTextColor(245, 240, 232);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(16);
  doc.text(label, W / 2, 145, { align: 'center' });

  const size = 320;
  const x = W / 2 - size / 2;
  const y = 200;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x - 18, y - 18, size + 36, size + 36, 16, 16, 'F');
  doc.addImage(dataUrl, 'PNG', x, y, size, size);

  doc.setTextColor(154, 149, 144);
  doc.setFontSize(12);
  doc.text(url, W / 2, y + size + 50, { align: 'center' });
  doc.setTextColor(245, 240, 232);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Point your phone camera here', W / 2, y + size + 90, { align: 'center' });

  doc.setTextColor(120, 120, 120);
  doc.setFontSize(10);
  doc.text('Train harder. Live stronger.', W / 2, H - 50, { align: 'center' });
}

codes.forEach((c, i) => {
  if (i > 0) doc.addPage();
  page(c.label, c.url, dataUrls[c.key]);
});

const pdf = doc.output('arraybuffer');
writeFileSync('qr/yoyo-gym-qr.pdf', Buffer.from(pdf));
console.log('✔ qr/yoyo-gym-qr.pdf (' + codes.length + ' pages)');
