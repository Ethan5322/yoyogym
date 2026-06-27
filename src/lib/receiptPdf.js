// Branded payment receipt PDF (A4) — corporate proof-of-payment a member can
// keep or claim from medical aid. Uses jsPDF (already a dependency).
import { jsPDF } from 'jspdf';

function hexToRgb(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '');
  if (!m) return [230, 57, 70];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const zar = (n) => 'R ' + Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 });
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');

export function downloadReceiptPdf({ gymName = 'Yoyo GYM', accent = '#E63946', payment, member = {} }) {
  const [r, g, b] = hexToRgb(accent);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 48;

  // Header band
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, W, 90, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text(gymName.toUpperCase(), M, 50);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('OFFICIAL PAYMENT RECEIPT', M, 70);

  // Receipt meta
  const refNo = (payment.id || '').toString().slice(0, 8).toUpperCase() || '—';
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(10);
  let y = 130;
  doc.setFont('helvetica', 'bold');
  doc.text('Receipt No.', M, y);
  doc.text('Date', W - M - 140, y);
  doc.setFont('helvetica', 'normal');
  doc.text(refNo, M + 70, y);
  doc.text(fmt(payment.created_at), W - M - 70, y);

  y += 30;
  doc.setFont('helvetica', 'bold');
  doc.text('Billed to', M, y);
  doc.setFont('helvetica', 'normal');
  y += 16;
  doc.text(member.full_name || member.member_name || '—', M, y);
  if (member.membership_number) { y += 14; doc.text(`Member: ${member.membership_number}`, M, y); }

  // Line items table
  y += 40;
  doc.setFillColor(245, 245, 245);
  doc.rect(M, y - 14, W - M * 2, 24, 'F');
  doc.setFont('helvetica', 'bold');
  doc.text('Description', M + 8, y + 2);
  doc.text('Amount', W - M - 8, y + 2, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  y += 30;
  const desc = payment.description || (payment.category || 'Payment').replace(/_/g, ' ');
  doc.text(desc, M + 8, y);
  doc.text(zar(payment.amount), W - M - 8, y, { align: 'right' });

  y += 12;
  doc.setDrawColor(220, 220, 220);
  doc.line(M, y, W - M, y);

  // Total
  y += 26;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('TOTAL PAID', M + 8, y);
  doc.setTextColor(r, g, b);
  doc.text(zar(payment.amount), W - M - 8, y, { align: 'right' });

  // Status + method
  y += 28;
  doc.setTextColor(90, 90, 90);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Status: ${payment.status || 'received'}   ·   Method: ${payment.method || '—'}`, M + 8, y);

  // Footer
  doc.setFontSize(9);
  doc.setTextColor(150, 150, 150);
  doc.text('This is a computer-generated receipt and is valid without a signature.', M, doc.internal.pageSize.getHeight() - 50);
  doc.text(`Generated ${new Date().toLocaleString('en-ZA')}`, M, doc.internal.pageSize.getHeight() - 36);

  doc.save(`receipt-${refNo}.pdf`);
}
