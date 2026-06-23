// Generates the 2-page membership PDF (spec 2.5 / Part 7.2):
//   Page 1 — premium membership card (credit-card style) + QR code
//   Page 2 — full registration confirmation document
// Dark premium athletic aesthetic. Prints cleanly on A4.
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import {
  GOAL_LABELS,
  EXPERIENCE_LABELS,
  TIER_LABELS,
  VISIT_TYPE_LABELS,
  PARQ_QUESTIONS,
} from './labels.js';

const COL = {
  bg: [10, 10, 10],
  surface: [20, 20, 20],
  elevated: [28, 28, 28],
  body: [245, 240, 232],
  muted: [154, 149, 144],
  line: [60, 60, 60],
};

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [230, 57, 70];
}
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const zar = (n) => 'R' + Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 });

export async function generateMembershipPdf(data) {
  const { gym, member, membership, parq, addons } = data;
  const accent = hexToRgb(gym.accent);

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;

  const fill = (c) => doc.setFillColor(c[0], c[1], c[2]);
  const text = (c) => doc.setTextColor(c[0], c[1], c[2]);

  const qrDataUrl = await QRCode.toDataURL(member.membership_number, {
    margin: 1,
    color: { dark: '#000000', light: '#FFFFFF' },
  });

  // ============================ PAGE 1 — CARD ============================
  fill(COL.bg);
  doc.rect(0, 0, W, H, 'F');

  // gym name header
  text(accent);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text((gym.name || 'YOUR GYM').toUpperCase(), W / 2, M + 10, { align: 'center' });
  text(COL.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('OFFICIAL MEMBERSHIP CARD', W / 2, M + 28, { align: 'center' });

  // ---- the card (credit-card proportions ~1.586:1) ----
  const cardW = W - M * 2;
  const cardH = cardW / 1.586;
  const cardX = M;
  const cardY = M + 55;

  fill(COL.elevated);
  doc.roundedRect(cardX, cardY, cardW, cardH, 14, 14, 'F');
  doc.setDrawColor(accent[0], accent[1], accent[2]);
  doc.setLineWidth(1.5);
  doc.roundedRect(cardX, cardY, cardW, cardH, 14, 14, 'S');

  // accent stripe (holographic-feel element)
  fill(accent);
  doc.rect(cardX + 14, cardY + 26, cardW - 28, 4, 'F');

  // MEMBER label + tier badge
  text(COL.muted);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('MEMBER', cardX + 18, cardY + 50);

  const tierLabel = TIER_LABELS[membership?.tier] || VISIT_TYPE_LABELS[membership?.visit_type] || 'MEMBER';
  const badgeW = doc.getTextWidth(tierLabel) + 18;
  fill(accent);
  doc.roundedRect(cardX + cardW - badgeW - 18, cardY + 40, badgeW, 16, 4, 4, 'F');
  text(COL.bg);
  doc.setFontSize(8);
  doc.text(tierLabel, cardX + cardW - badgeW - 18 + 9, cardY + 51);

  // member name
  text(COL.body);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(member.full_name, cardX + 18, cardY + 78);

  // membership number (large)
  text(accent);
  doc.setFontSize(15);
  doc.setFont('courier', 'bold');
  doc.text(member.membership_number, cardX + 18, cardY + 104);

  // validity
  text(COL.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Valid From: ${fmtDate(membership?.start_date)}`, cardX + 18, cardY + cardH - 30);
  doc.text(
    `Valid Until: ${membership?.end_date ? fmtDate(membership.end_date) : 'Ongoing'}`,
    cardX + 18,
    cardY + cardH - 16
  );

  // QR code (bottom-right of card)
  const qrSize = 70;
  doc.addImage(qrDataUrl, 'PNG', cardX + cardW - qrSize - 16, cardY + cardH - qrSize - 14, qrSize, qrSize);

  // verification code box under the card
  const vy = cardY + cardH + 28;
  text(COL.muted);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('VERIFICATION CODE', W / 2, vy, { align: 'center' });
  doc.setDrawColor(accent[0], accent[1], accent[2]);
  doc.setLineWidth(1);
  const boxW = 220;
  doc.roundedRect(W / 2 - boxW / 2, vy + 8, boxW, 38, 6, 6, 'S');
  text(accent);
  doc.setFont('courier', 'bold');
  doc.setFontSize(24);
  doc.text(member.verification_code, W / 2, vy + 34, { align: 'center' });
  text(COL.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Show this code at reception for first-time access.', W / 2, vy + 60, { align: 'center' });

  // footer
  text(COL.muted);
  doc.setFontSize(8);
  const footer = [gym.address, gym.phone, gym.email].filter(Boolean).join('  ·  ');
  if (footer) doc.text(footer, W / 2, H - 30, { align: 'center' });

  // ====================== PAGE 2 — CONFIRMATION ======================
  doc.addPage();
  fill(COL.bg);
  doc.rect(0, 0, W, H, 'F');

  // header band
  fill(COL.surface);
  doc.rect(0, 0, W, 70, 'F');
  fill(accent);
  doc.rect(0, 70, W, 3, 'F');
  text(accent);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text((gym.name || 'YOUR GYM').toUpperCase(), M, 40);
  text(COL.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Registration Confirmation', M, 56);
  doc.text(`Registered: ${fmtDate(member.created_at)}`, W - M, 56, { align: 'right' });

  let y = 100;
  const sectionTitle = (title) => {
    text(accent);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`———◆ ${title.toUpperCase()}`, M, y);
    y += 18;
  };
  const row = (label, value) => {
    text(COL.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(label, M, y);
    text(COL.body);
    doc.setFontSize(10);
    doc.text(String(value ?? '—'), M + 160, y, { maxWidth: W - M - (M + 160) });
    y += 16;
  };
  const gap = () => (y += 8);

  // Personal
  sectionTitle('Personal Information');
  row('Full Name', member.full_name);
  row('Date of Birth', fmtDate(member.date_of_birth));
  row('Phone', member.phone);
  row('Email', member.email);
  const addr = [member.address_street, member.address_suburb, member.address_city, member.address_postal_code]
    .filter(Boolean)
    .join(', ');
  row('Address', addr || '—');
  row('Emergency Contact', `${member.emergency_name || '—'}  ${member.emergency_phone || ''}`);
  if (member.medical_aid_provider) row('Medical Aid', member.medical_aid_provider);
  gap();

  // Membership
  sectionTitle('Membership');
  row('Plan', membership?.plans?.name || VISIT_TYPE_LABELS[membership?.visit_type] || '—');
  if (membership?.contract_duration) row('Contract', membership.contract_duration.replace(/_/g, ' '));
  if (membership?.monthly_amount) row('Monthly Fee', zar(membership.monthly_amount));
  if (membership?.joining_fee) row('Joining Fee', zar(membership.joining_fee));
  if (membership?.next_billing_date) row('Next Payment', fmtDate(membership.next_billing_date));
  if (membership?.sessions_total) row('Sessions', `${membership.sessions_remaining}/${membership.sessions_total} remaining`);
  gap();

  // Fitness
  sectionTitle('Fitness Profile');
  const goals = (member.fitness_goals || []).map((g) => GOAL_LABELS[g] || g).join(', ');
  row('Goals', goals || '—');
  row('Experience', EXPERIENCE_LABELS[member.experience_level] || member.experience_level || '—');
  if (member.injuries_notes) row('Injuries / Notes', member.injuries_notes);
  gap();

  // Add-ons
  if (addons && addons.length) {
    sectionTitle('Add-On Services');
    addons.forEach((a) => row(a.name, zar(a.price)));
    gap();
  }

  // PAR-Q box
  sectionTitle('Health Screening (PAR-Q)');
  fill(COL.elevated);
  const boxTop = y - 6;
  const boxH = 8 * 13 + 22;
  doc.roundedRect(M, boxTop, W - M * 2, boxH, 6, 6, 'F');
  y += 8;
  if (parq) {
    Object.entries(PARQ_QUESTIONS).forEach(([key, q]) => {
      const yes = parq[key] === true;
      text(COL.muted);
      doc.setFontSize(8.5);
      doc.text(q, M + 12, y);
      text(yes ? accent : [120, 200, 140]);
      doc.setFont('helvetica', 'bold');
      doc.text(yes ? 'YES' : 'NO', W - M - 24, y, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      y += 13;
    });
    text(parq.clearance_required ? accent : COL.muted);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(
      parq.clearance_required
        ? '⚠ MEDICAL CLEARANCE REQUIRED — doctor’s note needed before first session.'
        : 'Cleared to train — all responses NO.',
      M + 12,
      y + 4
    );
  }
  y = boxTop + boxH + 20;

  // signature / footer
  doc.setDrawColor(COL.line[0], COL.line[1], COL.line[2]);
  doc.line(M, y, M + 180, y);
  doc.line(W - M - 180, y, W - M, y);
  text(COL.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Member signature: ${membership?.digital_signature || member.full_name}`, M, y + 12);
  doc.text('Authorised by (Gym)', W - M - 180, y + 12);

  text(COL.muted);
  doc.setFontSize(8);
  const f2 = [gym.name, gym.phone, gym.email].filter(Boolean).join('  ·  ');
  doc.text(f2, W / 2, H - 24, { align: 'center' });

  doc.save(`${member.membership_number}.pdf`);
}
