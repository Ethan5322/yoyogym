// Professional membership PDF (spec 2.5 / Part 7.2).
//   Page 1  — Premium membership CARD (dark) with member QR + company QR
//   Page 2  — Registration confirmation (light, print-friendly)
//   Page 3+ — Full professional gym Terms & Conditions + signature block
// Branded, paginated, footer page numbers, no overlapping text.
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import {
  GOAL_LABELS,
  EXPERIENCE_LABELS,
  TIER_LABELS,
  VISIT_TYPE_LABELS,
  PARQ_QUESTIONS,
} from './labels.js';
import { gymTerms } from './terms.js';

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [230, 57, 70];
}
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
const zar = (n) => 'R' + Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 });

export async function generateMembershipPdf(data) {
  const { gym, member, membership, parq, addons } = data;
  const accent = hexToRgb(gym.accent);
  const gymName = (gym.name || 'Your Gym').toUpperCase();
  const companyUrl = data.companyUrl || gym.website || '';

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  const CW = W - M * 2;

  const ink = [33, 33, 33];
  const muted = [120, 120, 120];
  const dark = [12, 12, 12];
  const line = [220, 220, 220];

  const tColor = (c) => doc.setTextColor(c[0], c[1], c[2]);
  const fColor = (c) => doc.setFillColor(c[0], c[1], c[2]);

  const memberQr = await QRCode.toDataURL(member.membership_number, { margin: 0, width: 320, errorCorrectionLevel: 'H' });
  const companyQr = companyUrl
    ? await QRCode.toDataURL(companyUrl, { margin: 0, width: 320, errorCorrectionLevel: 'M' })
    : null;

  // =====================================================================
  // PAGE 1 — MEMBERSHIP CARD (dark premium)
  // =====================================================================
  fColor(dark);
  doc.rect(0, 0, W, H, 'F');

  tColor(accent);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.text(gymName, W / 2, 70, { align: 'center' });
  tColor(muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('OFFICIAL MEMBERSHIP CARD', W / 2, 90, { align: 'center', charSpace: 2 });

  // Card
  const cardX = M;
  const cardW = CW;
  const cardH = cardW / 1.586;
  const cardY = 120;
  doc.setFillColor(24, 24, 24);
  doc.roundedRect(cardX, cardY, cardW, cardH, 16, 16, 'F');
  doc.setDrawColor(accent[0], accent[1], accent[2]);
  doc.setLineWidth(1.5);
  doc.roundedRect(cardX, cardY, cardW, cardH, 16, 16, 'S');
  // holographic accent stripe
  fColor(accent);
  doc.rect(cardX + 20, cardY + 30, cardW - 40, 4, 'F');

  tColor(muted);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('MEMBER', cardX + 22, cardY + 58, { charSpace: 1 });

  // tier badge
  const tierLabel = TIER_LABELS[membership?.tier] || VISIT_TYPE_LABELS[membership?.visit_type] || 'MEMBER';
  doc.setFontSize(8);
  const badgeW = doc.getTextWidth(tierLabel) + 20;
  fColor(accent);
  doc.roundedRect(cardX + cardW - badgeW - 22, cardY + 46, badgeW, 18, 5, 5, 'F');
  tColor(dark);
  doc.text(tierLabel, cardX + cardW - badgeW - 22 + 10, cardY + 58);

  tColor([245, 240, 232]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(member.full_name, cardX + 22, cardY + 92);

  tColor(accent);
  doc.setFont('courier', 'bold');
  doc.setFontSize(16);
  doc.text(member.membership_number, cardX + 22, cardY + 118);

  tColor(muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Valid From:  ${fmtDate(membership?.start_date)}`, cardX + 22, cardY + cardH - 34);
  doc.text(`Valid Until: ${membership?.end_date ? fmtDate(membership.end_date) : 'Ongoing'}`, cardX + 22, cardY + cardH - 20);

  // member QR on card (white quiet zone so it scans)
  const qz = 78;
  const qx = cardX + cardW - qz - 18;
  const qy = cardY + cardH - qz - 16;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(qx - 6, qy - 6, qz + 12, qz + 12, 6, 6, 'F');
  doc.addImage(memberQr, 'PNG', qx, qy, qz, qz);

  // Verification code box
  let vy = cardY + cardH + 36;
  tColor(muted);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('VERIFICATION CODE', W / 2, vy, { align: 'center', charSpace: 2 });
  doc.setDrawColor(accent[0], accent[1], accent[2]);
  doc.setLineWidth(1);
  const bw = 240;
  doc.roundedRect(W / 2 - bw / 2, vy + 10, bw, 44, 8, 8, 'S');
  tColor(accent);
  doc.setFont('courier', 'bold');
  doc.setFontSize(26);
  doc.text(member.verification_code, W / 2, vy + 40, { align: 'center', charSpace: 2 });
  tColor(muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Show this code at reception for first-time access.', W / 2, vy + 68, { align: 'center' });

  // Company QR (scannable) — links to the gym portal / website
  if (companyQr) {
    const cqz = 96;
    const cqx = W / 2 - cqz / 2;
    const cqy = vy + 88;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(cqx - 8, cqy - 8, cqz + 16, cqz + 16, 8, 8, 'F');
    doc.addImage(companyQr, 'PNG', cqx, cqy, cqz, cqz);
    tColor(muted);
    doc.setFontSize(8);
    doc.text('Scan to check in & manage your membership online', W / 2, cqy + cqz + 18, { align: 'center' });
  }

  // footer
  tColor(muted);
  doc.setFontSize(8);
  const contact = [gym.address, gym.phone, gym.email].filter(Boolean).join('   |   ');
  if (contact) doc.text(contact, W / 2, H - 28, { align: 'center' });

  // =====================================================================
  // Light-page helpers (pages 2+)
  // =====================================================================
  const BAND = 70;
  let y = 0;

  function headerBand(title) {
    fColor(dark);
    doc.rect(0, 0, W, BAND, 'F');
    fColor(accent);
    doc.rect(0, BAND, W, 3, 'F');
    tColor(accent);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(gymName, M, 38);
    tColor([200, 200, 200]);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(title, M, 56);
    y = BAND + 34;
  }
  function ensure(space, title) {
    if (y + space > H - 50) {
      doc.addPage();
      headerBand(title);
    }
  }
  function sectionTitle(t) {
    ensure(40, t);
    tColor(accent);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(t.toUpperCase(), M, y);
    doc.setDrawColor(line[0], line[1], line[2]);
    doc.setLineWidth(0.5);
    doc.line(M, y + 6, W - M, y + 6);
    y += 22;
  }
  function row(label, value) {
    const val = String(value ?? '—');
    const lines = doc.splitTextToSize(val, CW - 160);
    ensure(14 * lines.length + 4, 'Registration Confirmation');
    tColor(muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(label, M, y);
    tColor(ink);
    doc.setFontSize(10);
    doc.text(lines, M + 160, y);
    y += 14 * lines.length + 2;
  }

  // =====================================================================
  // PAGE 2 — CONFIRMATION (light)
  // =====================================================================
  doc.addPage();
  headerBand('Registration Confirmation');
  tColor(muted);
  doc.setFontSize(9);
  doc.text(`Issued: ${fmtDate(member.created_at)}`, W - M, 56, { align: 'right' });

  sectionTitle('Member Details');
  row('Full Name', member.full_name);
  row('Membership No.', member.membership_number);
  row('Date of Birth', fmtDate(member.date_of_birth));
  row('Phone', member.phone);
  row('Email', member.email);
  row('Address', [member.address_street, member.address_suburb, member.address_city, member.address_postal_code].filter(Boolean).join(', ') || '—');
  row('Emergency Contact', `${member.emergency_name || '—'}  ${member.emergency_phone || ''}`);
  if (member.medical_aid_provider) row('Medical Aid', member.medical_aid_provider);

  sectionTitle('Membership & Pricing');
  row('Plan', membership?.plans?.name || VISIT_TYPE_LABELS[membership?.visit_type] || '—');
  if (membership?.contract_duration) row('Contract', membership.contract_duration.replace(/_/g, ' '));
  if (membership?.monthly_amount) row('Monthly Fee', zar(membership.monthly_amount));
  if (membership?.joining_fee) row('Joining Fee', zar(membership.joining_fee));
  if (membership?.contract_value) row('Contract Value', zar(membership.contract_value));
  if (membership?.next_billing_date) row('Next Payment', fmtDate(membership.next_billing_date));
  if (membership?.sessions_total) row('Sessions', `${membership.sessions_remaining}/${membership.sessions_total} remaining`);

  if (addons?.length) {
    sectionTitle('Add-On Services');
    addons.forEach((a) => row(a.name, zar(a.price)));
  }

  sectionTitle('Fitness Profile');
  row('Goals', (member.fitness_goals || []).map((g) => GOAL_LABELS[g] || g).join(', ') || '—');
  row('Experience', EXPERIENCE_LABELS[member.experience_level] || member.experience_level || '—');
  if (member.injuries_notes) row('Injuries / Notes', member.injuries_notes);

  // PAR-Q box
  sectionTitle('Health Screening (PAR-Q)');
  if (parq) {
    Object.entries(PARQ_QUESTIONS).forEach(([key, q]) => {
      ensure(15, 'Registration Confirmation');
      const yes = parq[key] === true;
      tColor(ink);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const ql = doc.splitTextToSize(q, CW - 50);
      doc.text(ql, M, y);
      tColor(yes ? accent : [40, 150, 80]);
      doc.setFont('helvetica', 'bold');
      doc.text(yes ? 'YES' : 'NO', W - M, y, { align: 'right' });
      y += 14 * ql.length + 1;
    });
    y += 4;
    ensure(20, 'Registration Confirmation');
    tColor(parq.clearance_required ? accent : [40, 150, 80]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    const note = parq.clearance_required
      ? 'MEDICAL CLEARANCE REQUIRED — a doctor’s clearance note is needed before the first session.'
      : 'Cleared to train — all PAR-Q responses were NO.';
    doc.text(doc.splitTextToSize(note, CW), M, y);
    y += 18;
  }

  // =====================================================================
  // PAGE 3+ — TERMS & CONDITIONS
  // =====================================================================
  doc.addPage();
  headerBand('Membership Terms & Conditions');
  const terms = gymTerms(gym.name || 'the Gym');
  terms.forEach((clause, i) => {
    ensure(40, 'Membership Terms & Conditions');
    tColor(accent);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(`${i + 1}. ${clause.h}`, M, y);
    y += 15;
    tColor(ink);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const body = doc.splitTextToSize(clause.b, CW);
    body.forEach((ln) => {
      ensure(13, 'Membership Terms & Conditions');
      doc.text(ln, M, y);
      y += 12.5;
    });
    y += 8;
  });

  // Acceptance & signature block
  ensure(120, 'Membership Terms & Conditions');
  y += 6;
  doc.setDrawColor(line[0], line[1], line[2]);
  doc.line(M, y, W - M, y);
  y += 22;
  tColor(ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('ACCEPTANCE', M, y);
  y += 16;
  tColor(muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const accText = `The member named below has read, understood and agreed to the indemnity waiver, ` +
    `the membership contract, the gym rules, and the POPIA privacy policy, and has accepted these terms electronically during registration.`;
  doc.text(doc.splitTextToSize(accText, CW), M, y);
  y += 40;

  const colW = (CW - 30) / 2;
  doc.setDrawColor(80, 80, 80);
  doc.line(M, y, M + colW, y);
  doc.line(M + colW + 30, y, W - M, y);
  tColor(ink);
  doc.setFontSize(9);
  doc.text(`${membership?.digital_signature || member.full_name}  (digital signature)`, M, y + 13);
  doc.text('Authorised on behalf of the Gym', M + colW + 30, y + 13);
  tColor(muted);
  doc.setFontSize(8);
  doc.text(`Member — dated ${fmtDate(membership?.contract_accepted_at || member.created_at)}`, M, y + 26);

  // =====================================================================
  // Footers with page numbers (skip page 1 card)
  // =====================================================================
  const pages = doc.getNumberOfPages();
  for (let i = 2; i <= pages; i++) {
    doc.setPage(i);
    tColor(muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const foot = [gym.name, gym.phone, gym.email].filter(Boolean).join('  |  ');
    doc.text(foot, M, H - 24);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 24, { align: 'right' });
  }

  doc.save(`${member.membership_number}.pdf`);
}
