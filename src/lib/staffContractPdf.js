// Professional Staff Employment Agreement PDF — staff details + standard gym
// staff terms & conditions + signature blocks. Auto-paginated, branded.
// SA-aware (BCEA / POPIA) generic template — gyms should have it reviewed by
// their own labour advisor before use; amounts/notice can be edited in the doc.
import { jsPDF } from 'jspdf';

function hexToRgb(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '');
  if (!m) return [230, 57, 70];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }) : '________________');

// Researched, professional gym-staff clauses (generic SA employment template).
const CLAUSES = [
  ['1. Appointment & Position',
    'The Employer appoints the Employee in the position and job title stated above. The Employee accepts the appointment and agrees to perform all duties reasonably associated with the role and any other lawful duties assigned by management.'],
  ['2. Commencement & Duration',
    'Employment commences on the start date stated above. Where an end date is stated, this is a fixed-term agreement ending on that date; where no end date is stated, employment is permanent and continues until terminated in terms of this agreement. The first three (3) months constitute a probation period during which suitability for the role is assessed.'],
  ['3. Place & Hours of Work',
    'The Employee works at the gym premises (and any branch reasonably required). Ordinary hours of work, including shifts, weekends and public holidays as rostered, are in line with the Basic Conditions of Employment Act (BCEA). The Employee will be punctual and available for rostered shifts.'],
  ['4. Remuneration',
    'The Employee will be paid the agreed remuneration of R____________ per ____________, payable monthly in arrears by the agreed pay date, less statutory deductions (PAYE, UIF) and any agreed deductions. Overtime, where applicable, is paid in accordance with the BCEA.'],
  ['5. Duties & Standard of Conduct',
    'The Employee will: serve members courteously and professionally; maintain a high standard of personal hygiene and wear the prescribed uniform/attire; keep equipment and facilities clean and safe; promote the gym\'s services honestly; and not conduct unauthorised personal training or private business on the premises.'],
  ['6. Confidentiality & Data Protection (POPIA)',
    'The Employee will keep all member, financial and business information strictly confidential, will access and process member personal information only as required to perform their duties, and will comply with the Protection of Personal Information Act (POPIA). This obligation continues after termination of employment.'],
  ['7. Health, Safety & Incidents',
    'The Employee will follow all health and safety procedures, use equipment correctly, assist members safely, and immediately report any injury, hazard, or security incident to management and record it in the incident log.'],
  ['8. Gym Property & Equipment',
    'All equipment, keys, access cards, uniforms, devices and documents remain the property of the Employer and must be returned in good order on termination. The Employee will take reasonable care of all gym property.'],
  ['9. Leave',
    'The Employee is entitled to annual leave, sick leave and family responsibility leave in accordance with the BCEA. Leave must be applied for and approved in advance, except in genuine emergencies.'],
  ['10. Code of Conduct & Discipline',
    'The Employee will comply with the gym rules and code of conduct. Misconduct will be dealt with under a fair disciplinary procedure. Serious misconduct (e.g. theft, dishonesty, gross negligence, breach of confidentiality, intoxication, or abuse of members) may result in summary dismissal following a fair process.'],
  ['11. Confidential Member Relationships (Non-Solicitation)',
    'During employment and for a reasonable period after termination, the Employee will not solicit or entice away the gym\'s members or clients for a competing service, nor misuse member contact information obtained during employment.'],
  ['12. Termination & Notice',
    'Either party may terminate this agreement on written notice in accordance with the BCEA: one (1) week if employed for six months or less; two (2) weeks if employed for more than six months but not more than one year; and four (4) weeks if employed for more than one year. Nothing limits the Employer\'s right to dismiss for fair reason following a fair procedure.'],
  ['13. Whole Agreement',
    'This document, together with the gym rules and any written policies, constitutes the agreement between the parties. Any variation must be agreed in writing. This template should be reviewed against current labour law and the parties\' specific circumstances.'],
];

export async function downloadStaffContract({
  gymName = 'Yoyo GYM',
  accent = '#E63946',
  employee = {},
  issued = new Date(),
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297, M = 18, CW = W - M * 2;
  const [r, g, b] = hexToRgb(accent);
  let y = 0;

  const ensure = (h) => { if (y + h > H - 20) { doc.addPage(); y = M; } };

  // ---- Title block ----
  doc.setFillColor(10, 10, 10);
  doc.rect(0, 0, W, 40, 'F');
  doc.setFillColor(r, g, b);
  doc.rect(0, 40, W, 1.4, 'F');
  doc.setTextColor(r, g, b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(gymName.toUpperCase(), M, 22);
  doc.setTextColor(170, 170, 170);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('STAFF EMPLOYMENT AGREEMENT', M, 32);
  y = 52;

  // ---- Parties / details table ----
  doc.setTextColor(20, 20, 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('PARTIES & EMPLOYMENT DETAILS', M, y);
  y += 6;

  const rows = [
    ['Employer', gymName],
    ['Employee', employee.name || '________________'],
    ['Job title', employee.job_title || '________________'],
    ['Staff number', employee.staff_number || '________________'],
    ['Phone', employee.phone || '—'],
    ['Email', employee.email || '—'],
    ['Contract start', fmtDate(employee.contract_start)],
    ['Contract end', employee.contract_end ? fmtDate(employee.contract_end) : 'Ongoing / permanent'],
  ];
  doc.setFontSize(10);
  for (const [k, v] of rows) {
    ensure(8);
    doc.setFillColor(248, 246, 246);
    doc.rect(M, y - 4.5, CW, 7.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(90, 90, 90);
    doc.text(k, M + 2, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(20, 20, 20);
    doc.text(String(v), M + 50, y);
    y += 8;
  }
  y += 4;

  // ---- Terms & conditions ----
  ensure(10);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text('TERMS & CONDITIONS OF EMPLOYMENT', M, y);
  y += 7;

  for (const [title, body] of CLAUSES) {
    ensure(10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(r, g, b);
    doc.text(title, M, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(40, 40, 40);
    for (const ln of doc.splitTextToSize(body, CW)) {
      ensure(5);
      doc.text(ln, M, y);
      y += 4.6;
    }
    y += 3;
  }

  // ---- Acceptance & signatures ----
  ensure(46);
  y += 2;
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(M, y, W - M, y);
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text('ACCEPTANCE', M, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(60, 60, 60);
  for (const ln of doc.splitTextToSize('The Employee confirms they have read, understood and agree to this agreement and the gym rules. Signed at the gym on the date below.', CW)) {
    doc.text(ln, M, y); y += 4.6;
  }
  y += 10;

  const colW = (CW - 10) / 2;
  const sig = (x, label) => {
    doc.setDrawColor(120, 120, 120);
    doc.line(x, y, x + colW, y);
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text(label, x, y + 5);
    doc.text('Date: ______________________', x, y + 12);
  };
  sig(M, 'Employee signature');
  sig(M + colW + 10, 'For the Employer (name & signature)');

  // ---- Footer ----
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(225, 225, 225);
    doc.setLineWidth(0.2);
    doc.line(M, H - 12, W - M, H - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(150, 150, 150);
    doc.text(`${gymName} — Staff Employment Agreement · Issued ${fmtDate(issued)} · Template, not legal advice`, M, H - 8);
    doc.text(`Page ${p} of ${pages}`, W - M, H - 8, { align: 'right' });
  }

  doc.save(`staff-contract-${(employee.staff_number || employee.name || 'staff').replace(/\s+/g, '-')}.pdf`);
}
