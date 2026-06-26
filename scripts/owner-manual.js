// Generates the white-label "Gym Management System — Owner's Manual" PDF that
// you give to each gym owner after purchase. Non-technical, step-by-step.
// Reusable: edit CONTENT and re-run  node scripts/owner-manual.js
// Output: ./Gym-System-Owner-Manual.pdf (also synced via OneDrive).
import { jsPDF } from 'jspdf';
import { writeFileSync } from 'node:fs';

const ACCENT = [230, 57, 70];
const DARK = [22, 22, 22];
const GRAY = [120, 120, 120];
const LIGHT = [245, 245, 245];
const GREEN = [0, 150, 70];

const doc = new jsPDF({ unit: 'mm', format: 'a4' });
const PW = 210, PH = 297, M = 18, CW = PW - M * 2;
const BOTTOM = PH - 20;
let y = M;

const setColor = (c) => doc.setTextColor(c[0], c[1], c[2]);
const setFill = (c) => doc.setFillColor(c[0], c[1], c[2]);
const ensure = (h) => { if (y + h > BOTTOM) { doc.addPage(); y = M; } };
const gap = (h = 4) => { y += h; };
const pageBreak = () => { doc.addPage(); y = M; };

function h1(text) {
  ensure(18); gap(1);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(17); setColor(DARK);
  for (const ln of doc.splitTextToSize(text, CW)) { doc.text(ln, M, y); y += 8; }
  setFill(ACCENT); doc.rect(M, y - 3, 26, 1.3, 'F'); y += 6;
}
function h2(text) {
  ensure(12); gap(2);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); setColor(ACCENT);
  for (const ln of doc.splitTextToSize(text, CW)) { doc.text(ln, M, y); y += 6; }
  gap(1);
}
function para(text) {
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); setColor(DARK);
  for (const ln of doc.splitTextToSize(text, CW)) { ensure(6); doc.text(ln, M, y); y += 5.4; }
  gap(1.5);
}
function bullet(text, num) {
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
  const marker = num != null ? `${num}.` : '•';
  const indent = num != null ? 8 : 6;
  const lines = doc.splitTextToSize(text, CW - indent);
  ensure(6);
  setColor(ACCENT); doc.setFont('helvetica', 'bold'); doc.text(marker, M + 1, y);
  doc.setFont('helvetica', 'normal'); setColor(DARK);
  lines.forEach((ln, i) => { if (i) ensure(6); doc.text(ln, M + indent, y); if (i < lines.length - 1) y += 5.4; });
  y += 5.4;
}
function callout(title, text, tone) {
  const col = tone === 'green' ? GREEN : ACCENT;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  const tLines = doc.splitTextToSize(text, CW - 10);
  const boxH = 8 + tLines.length * 5;
  ensure(boxH + 3);
  setFill(LIGHT); doc.rect(M, y, CW, boxH, 'F');
  setFill(col); doc.rect(M, y, 1.5, boxH, 'F');
  let ty = y + 6;
  doc.setFont('helvetica', 'bold'); setColor(col); doc.text(title, M + 5, ty); ty += 5;
  doc.setFont('helvetica', 'normal'); setColor(DARK);
  tLines.forEach((ln) => { doc.text(ln, M + 5, ty); ty += 5; });
  y += boxH + 4;
}
function twoCol(rows, col1w = 52) {
  doc.setFontSize(9.5);
  for (const [k, v] of rows) {
    const vLines = doc.splitTextToSize(v, CW - col1w - 4);
    const rowH = Math.max(7, vLines.length * 5 + 2);
    ensure(rowH);
    setFill([252, 250, 250]); doc.rect(M, y - 4.5, CW, rowH, 'F');
    doc.setFont('helvetica', 'bold'); setColor(DARK); doc.text(k, M + 2, y);
    doc.setFont('helvetica', 'normal'); setColor([60, 60, 60]);
    vLines.forEach((ln, i) => doc.text(ln, M + col1w, y + i * 5));
    y += rowH;
  }
  gap(3);
}
function section(n, title) {
  ensure(16);
  setFill(ACCENT); doc.roundedRect(M, y - 1, 9, 9, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(255, 255, 255);
  doc.text(String(n), M + 4.5, y + 5.2, { align: 'center' });
  doc.setFontSize(15); setColor(DARK);
  doc.text(title, M + 13, y + 5.5);
  y += 11;
  setFill(ACCENT); doc.rect(M, y - 2, 26, 1.1, 'F'); y += 5;
}

// ===================== COVER =====================
setFill(DARK); doc.rect(0, 0, PW, PH, 'F');
setFill(ACCENT); doc.rect(0, 104, PW, 2, 'F');
doc.setFont('helvetica', 'bold'); doc.setFontSize(30); doc.setTextColor(245, 240, 232);
doc.text('Owner\'s Manual', M, 128);
doc.setFont('helvetica', 'normal'); doc.setFontSize(14); doc.setTextColor(190, 190, 190);
doc.text('Your Gym Management System', M, 146);
doc.setFontSize(11); setColor(GRAY);
doc.text('A simple, step-by-step guide to running your gym', M, 158);
doc.text('— no technical experience needed.', M, 165);
doc.setFontSize(9.5); doc.setTextColor(150, 150, 150);
doc.text('Gym: ____________________________', M, 235);
doc.text('Your admin website: ____________________________ /admin', M, 244);
doc.text('Powered by MuleSoo Digital Solutions', M, 262);

// ===================== CONTENTS =====================
pageBreak();
h1('What\'s inside');
const toc = [
  '1.  Welcome — what your system does for you',
  '2.  Logging in (your admin website)',
  '3.  Your dashboard at a glance',
  '4.  Checking members in at the door',
  '5.  Face & QR scan access',
  '6.  Finding & managing members',
  '7.  Registering a walk-in member',
  '8.  Today\'s overview — who\'s in the gym',
  '9.  Classes — create & manage',
  '10. Class bookings & waitlists',
  '11. Trainers',
  '12. Payments & money',
  '13. Analytics & reports',
  '14. Calendar & events',
  '15. Messaging your members',
  '16. Your plans & prices (Catalog)',
  '17. Settings — your brand & rules',
  '18. QR codes — print & display',
  '19. Visitors & day passes',
  '20. Incident log',
  '21. What your members experience',
  '22. Staff accounts & roles',
  '23. Alerts you\'ll receive',
  '24. Tips, FAQ & support',
];
doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); setColor(DARK);
for (const t of toc) { ensure(6.6); doc.text(t, M, y); y += 6.6; }

// ===================== 1 WELCOME =====================
pageBreak();
section(1, 'Welcome');
para('Congratulations on your new gym management system! It replaces paperwork, manual payment chasing, and spreadsheets with one simple online tool that works 24/7.');
h2('What it does for you');
bullet('Signs up new members from a QR code — including health screening, plan choice and payment.');
bullet('Verifies members at your door in seconds and logs every visit.');
bullet('Collects monthly payments automatically and sends receipts.');
bullet('Manages classes, bookings, trainers and your whole member database.');
bullet('Sends you instant alerts for new members, payments and more.');
callout('You don\'t need to be techy', 'Everything in this manual is done by clicking and typing on your admin website. If you can use WhatsApp, you can use this.');

// ===================== 2 LOGIN =====================
pageBreak();
section(2, 'Logging in');
para('Your system has two parts: the MEMBER side (what your clients see) and the ADMIN side (your control panel). This manual is about the admin side.');
bullet('Open your admin website address in any browser, then add /admin/login to the end.', 1);
bullet('Enter the username and password we gave you at handover.', 2);
bullet('Click Sign in. You\'ll land on your Dashboard.', 3);
callout('Keep it safe', 'Never share your owner login. We can set up separate logins for your staff (see section 22). Your session signs out automatically after a while for security. You can change your password in Settings - Change Password (section 17); if you forget it, contact support to reset.');
para('Tip: bookmark the /admin page on your phone and reception computer for one-tap access.');

// ===================== 3 DASHBOARD =====================
pageBreak();
section(3, 'Your dashboard at a glance');
para('The Dashboard is your morning coffee screen — a quick health check of the gym.');
h2('What you\'ll see');
bullet('Today\'s check-ins, new members (today/week/month), active members, and revenue.');
bullet('Upcoming classes and their booking status.');
bullet('A recent activity feed of the latest events.');
h2('Alert banners — act on these');
bullet('Failed payments needing attention.');
bullet('Members flagged for medical clearance (PAR-Q).');
bullet('Memberships expiring in 7 days.');
bullet('Classes nearly full, and new sign-ups since you last logged in.');
callout('Your daily 2-minute routine', '1) Open the Dashboard and clear any alert banners (failed payments, expiring memberships, PAR-Q flags). 2) Glance at today\'s classes and check-ins. 3) Use the Scan or Verify screen through the day as members arrive. That\'s it — the system handles billing, reminders and receipts automatically.');
callout('Use the left menu', 'Every section in this manual is a link in the menu on the left (Verify, Members, Classes, Payments, etc.). On a phone, tap the ☰ menu icon.');

// ===================== 4 VERIFY =====================
pageBreak();
section(4, 'Checking members in at the door');
para('This is your most-used screen each day. Open "Verify" from the menu.');
bullet('Ask the member for their verification code or membership number (or scan their QR/ID).', 1);
bullet('Type or scan it into the big box and press Enter.', 2);
para('What you\'ll see:');
twoCol([
  ['GREEN — Access granted', 'Shows their photo, name, tier, valid-until date, payment status and any medical flag. The visit is logged automatically.'],
  ['RED — Access denied', 'Shows only the reason (expired, suspended, not found). No personal details are shown. Direct them to reception.'],
], 52);
callout('Why it\'s safe', 'Denied scans never reveal personal information — protecting your members\' privacy and your POPIA compliance.');

// ===================== 5 SCAN =====================
pageBreak();
section(5, 'Face & QR scan access');
para('Open "Scan" for fast, hands-free entry. There are THREE ways to identify a person, so you are never stuck at the door:');
bullet('FACE — point the camera at the member; the system takes several quick readings, averages them, and matches. This multi-reading approach is reliable even with changeable conditions (a just-washed/shiny face, dim light, or a slight angle).', 1);
bullet('QR — switch to QR mode and scan the member\'s or trainer\'s personal QR code.', 2);
bullet('CODE — if a face is not recognised, a box appears: simply type the person\'s verification code or membership number and it identifies them instantly (works for members and trainers).', 3);
para('On a match the screen shows access granted/denied and starts the visit timer; on check-out it logs how long they stayed. Denied scans never reveal personal details (POPIA).');
h2('Enrolling faces (do this once per person)');
bullet('Members capture their face during registration, or you can capture it at reception.');
bullet('Staff and trainers capture their face when you register them (Staff & Roles / Trainers).');
bullet('For your own admin face-login, use Settings → Admin Face Login.');
callout('Best recognition', 'Capture in good, even lighting with a steady, front-on face. After any system update, ask people to re-capture once for the strongest match. The camera asks for permission the first time on each device — tap Allow.');

// ===================== 6 MEMBERS =====================
pageBreak();
section(6, 'Finding & managing members');
para('Open "Members" to search your whole database by name, membership number, phone, email or ID. Filter by status, membership tier, contract length, or show only members with a medical (PAR-Q) flag.');
h2('Inside a member\'s profile');
bullet('Personal details, health screening (PAR-Q), goals and experience.');
bullet('Membership history, payment history, attendance and class bookings.');
bullet('Add-on services and a staff notes box.');
h2('Quick actions');
twoCol([
  ['Suspend / reactivate', 'Block or restore a member\'s access instantly.'],
  ['Renew / change plan', 'Update their membership or tier.'],
  ['Add a note', 'Record anything staff should know.'],
  ['New verification code', 'Re-issue an access code if needed.'],
  ['Manual check-in', 'Log a visit by hand.'],
], 50);
callout('Deleting a member', 'Only the owner can permanently delete a member (POPIA right to erasure). This removes all their data and cannot be undone.');

// ===================== 7 MANUAL REGISTER =====================
pageBreak();
section(7, 'Registering a walk-in member');
para('For someone signing up at reception, open "Register member" — it\'s the same flow your members use online, completed by your staff.');
bullet('Fill in their personal details and complete the PAR-Q health questions together.', 1);
bullet('Choose their membership plan and any add-ons.', 2);
bullet('Take payment by card (Paystack) or mark it as paid by cash/EFT.', 3);
bullet('Their membership card PDF is generated to print or email.', 4);
callout('Tip', 'Walk-ins are tagged "manually registered" so you can tell online vs in-person sign-ups apart in your reports.');

// ===================== 8 TODAY =====================
pageBreak();
section(8, 'Today\'s overview — who\'s in the gym');
para('Open "Today" to see live activity for the current day.');
bullet('Everyone who has checked in today, with their arrival time.');
bullet('Who is currently inside (checked in, not yet checked out).');
bullet('Today\'s class schedule with booked vs available spots.');
bullet('A quick check-in button for reception.');
callout('Great for safety', 'In an emergency, "currently inside" tells you exactly who is in the building.');

// ===================== 9 CLASSES =====================
pageBreak();
section(9, 'Classes — create & manage');
para('Open "Classes" to set up your timetable. For each class you set:');
bullet('Class name and the trainer who runs it.');
bullet('Day & time (weekly recurring or a one-off date) and duration.');
bullet('Maximum capacity (and a minimum, below which you may cancel).');
bullet('Whether booking is required, and which membership tiers may attend.');
h2('Managing a class');
bullet('Edit or delete any class at any time.');
bullet('See who is booked, and message all booked members.');
bullet('Cancel a class — booked members are notified automatically.');

// ===================== 10 BOOKINGS =====================
pageBreak();
section(10, 'Class bookings & waitlists');
para('Members book classes from their phone. The system handles the rest:');
bullet('Capacity is enforced automatically — no overbooking.');
bullet('When a class is full, the next member joins a WAITLIST and is told their position.');
bullet('If someone cancels, the system can move a waitlisted member into the spot and notify them.');
bullet('Late cancellations (under 2 hours) are flagged.');
callout('Reminders are automatic', 'Booked members get a class reminder, so you don\'t have to chase anyone.');

// ===================== 11 TRAINERS =====================
pageBreak();
section(11, 'Trainers');
para('Open "Trainers" to manage your team.');
bullet('Add each trainer with their contact details, specialisation and certifications.');
bullet('Capture the trainer\'s face and photo — they instantly get a Trainer ID card (PNG) + PDF with a trainer number, verification code and a scan-to-verify QR.');
bullet('Assign trainers to classes.');
bullet('Trainers can log workout notes against their clients\' personal-training sessions.');
callout('Trainer logins', 'A trainer can be given their own login (we set this up for you) that shows only their own clients — see section 22.');

// ===================== 12 PAYMENTS =====================
pageBreak();
section(12, 'Payments & money');
para('Open "Payments" to see every transaction: received, pending, failed and refunded. Filter by member, date, type or tier.');
h2('What you can do');
bullet('Record a cash or EFT payment by hand.');
bullet('See failed payments and their retry status.');
bullet('Export everything to a CSV file for your accountant.');
h2('Automatic billing');
bullet('Monthly fees are collected automatically on each member\'s billing date (if card payment is set up).');
bullet('A failed payment is retried; after repeated failures the member is suspended and you\'re alerted.');
callout('Your money, your account', 'Member payments go directly into your own Paystack account — never through anyone else.');

// ===================== 13 ANALYTICS =====================
pageBreak();
section(13, 'Analytics & reports');
para('Open "Analytics" for headline numbers (active members, new in 30 days, lapsed, churn rate) plus clear bar charts for:');
bullet('Check-ins over the last 30 days, and your busiest hours of the day.');
bullet('Most popular classes (by bookings, last 30 days).');
bullet('Revenue trend over the last 6 months.');
bullet('Membership tier distribution and member status mix.');
bullet('Medical-aid breakdown — how many members have medical aid, by provider.');
callout('Use it monthly', 'A quick look each month tells you what\'s working. For QR sign-up conversion, see the QR Codes page (section 18).');

// ===================== 14 CALENDAR =====================
pageBreak();
section(14, 'Calendar & events');
para('Open "Calendar" to see all classes and events in one view, colour-coded by type.');
bullet('Add special events or promotions.');
bullet('Block out days (public holidays, maintenance).');
bullet('Jump to any date to see the full schedule.');

// ===================== 15 COMMUNICATIONS =====================
pageBreak();
section(15, 'Messaging your members');
para('Open "Communications" to email groups of members at once — perfect for promotions and announcements.');
bullet('Choose who to send to (e.g. all members, a specific tier, or a status).', 1);
bullet('Write your subject and message.', 2);
bullet('Send — the system emails everyone and records it.', 3);
callout('Note', 'Bulk messages to members go by email. Instant WhatsApp/Telegram alerts are for you, the owner.');

// ===================== 16 CATALOG =====================
pageBreak();
section(16, 'Your plans & prices (Catalog)');
para('Open "Catalog" to control exactly what you sell. No developer needed.');
bullet('Add, edit, enable or disable membership plans.');
bullet('Set prices, joining fees, included classes and benefits.');
bullet('Mark a plan as "most popular" to highlight it.');
bullet('Manage add-on services (personal training, classes, lockers, etc.) and their prices.');
callout('Changes are instant', 'Whatever you set here is what new members see in the sign-up flow immediately.');

// ===================== 17 SETTINGS =====================
pageBreak();
section(17, 'Settings — your brand & rules');
para('Open "Settings" (owner only) to configure your gym. Edit each section and click Save.');
twoCol([
  ['Gym Profile', 'Name, tagline, accent colour, contact details, hours, welcome message.'],
  ['Owner Notifications', 'Where your instant alerts are sent (WhatsApp/Telegram/email).'],
  ['Contract Discounts', 'Discounts for longer commitments.'],
  ['Access & Compliance', 'Capacity, session length, peak hours, what each tier may do.'],
  ['Legal text', 'Gym rules, indemnity waiver, membership contract, POPIA policy.'],
  ['Change Password', 'Update the password for your own admin login (minimum 8 characters).'],
  ['Admin Face Login', 'Enrol your face to unlock the admin by scan.'],
], 48);
callout('Everything is pre-filled', 'Professional, compliant defaults are already there. Just review, tweak to match your gym, and Save.');

// ===================== 18 QR =====================
pageBreak();
section(18, 'QR codes — print & display');
para('Open "QR Codes" to download and print your codes. Each has a Download PNG button and a Print button:');
bullet('NEW MEMBER code — opens the sign-up flow. Put it on your door, flyers and social media.');
bullet('EXISTING MEMBER code — opens the member portal for check-in and bookings.');
bullet('A Company code (general landing page) and a secure Admin code are also provided.');
para('This page also shows your scan analytics: total scans, new-member scans, and your scan-to-registration conversion rate.');
callout('Display them well', 'Print large, clear copies at the entrance and reception. The easier they are to scan, the more sign-ups you get.');

// ===================== 19 VISITORS =====================
pageBreak();
section(19, 'Visitors & day passes');
para('Open "Visitors" to manage guests and day-pass holders.');
bullet('Issue a day pass with a name (and optional host) — a pass code is generated.', 1);
bullet('See today\'s visitors and mark them as checked in.', 2);
callout('Good for guests', 'Lets friends and trial visitors in without creating a full membership.');

// ===================== 20 INCIDENTS =====================
pageBreak();
section(20, 'Incident log');
para('Open "Incidents" to record anything that happens on site — an injury, a dispute, a security issue.');
bullet('Log an incident against a member or an unidentified person, with a note.');
bullet('You (the owner) get an instant alert, and the log is kept for your records.');
callout('Protect your business', 'A clear, time-stamped incident record is valuable for insurance and any disputes.');

// ===================== 21 MEMBER EXPERIENCE =====================
pageBreak();
section(21, 'What your members experience');
para('It helps to know what your clients see, so you can guide them:');
bullet('They scan your NEW MEMBER QR and are guided through sign-up: details, health check, plan, payment.', 1);
bullet('They instantly receive a membership number, a verification code, a welcome email and a membership card PDF.', 2);
bullet('They scan the EXISTING MEMBER QR (or use the member portal) to check in, book or cancel classes, view their history and membership card, and pay any balance owed securely online.', 3);
callout('Self-service = less work for you', 'Most member admin happens on their phone, freeing your staff for real service.');

// ===================== 22 ROLES =====================
pageBreak();
section(22, 'Staff accounts & roles');
para('Give each staff member their own login with the right level of access. Roles:');
twoCol([
  ['Owner', 'Full access, including Settings. (That\'s you.)'],
  ['Manager', 'Everything except Settings.'],
  ['Reception', 'Verify, scan, today, register walk-ins, visitors, incidents.'],
  ['Trainer', 'Sees only their own clients.'],
], 40);
callout('Self-service', 'As the owner, register staff yourself in Staff & Roles: enter their details (incl. job title and contract start/end dates), capture a face scan + photo, and they instantly get a login, face access, a Staff ID card, and a professional Staff Employment Agreement PDF — their details plus standard staff terms & conditions and signature lines, ready to print and sign. You can also change roles, enable/disable, and reset passwords.');
para('Note: the staff agreement is a professional template — have it checked against current labour law and fill in pay/notice specifics before signing.');
para('Tip: the Audit Log (owner/manager) records important staff actions — status changes, deletions, refunds, settings and staff edits — so you always know who did what.');

// ===================== 23 ALERTS =====================
pageBreak();
section(23, 'Alerts you\'ll receive');
para('The system keeps you informed automatically via WhatsApp/Telegram/email (set in Settings):');
bullet('New member registered.');
bullet('Payment received, and payment failed.');
bullet('Membership expiring or lapsed.');
bullet('Medical-clearance flag on a new member.');
bullet('Capacity getting high, incidents, and a daily summary each evening.');
callout('Tune them', 'You can turn alert types on or off in Settings so you only get what matters to you.');

// ===================== 24 FAQ =====================
pageBreak();
section(24, 'Tips, FAQ & support');
h2('Quick tips');
bullet('Check your Dashboard and alert banners each morning.');
bullet('Keep your plans/prices current in Catalog.');
bullet('Display your QR codes prominently — they drive sign-ups.');
h2('FAQ');
twoCol([
  ['A member can\'t check in', 'Search them in Members — check status (expired/suspended) and payment.'],
  ['Payment didn\'t go through', 'See Payments → failed; the system retries automatically.'],
  ['Change my password', 'Settings - Change Password. If forgotten, contact support to reset.'],
  ['Camera won\'t scan', 'Allow camera permission and ensure good lighting.'],
  ['Need to change a price', 'Catalog → edit the plan → Save (instant).'],
], 50);
callout('We\'re here to help', 'Support contact: ____________________________   ·   Powered by MuleSoo Digital Solutions', 'green');

// ===================== FOOTERS =====================
const pages = doc.getNumberOfPages();
for (let p = 2; p <= pages; p++) {
  doc.setPage(p);
  doc.setDrawColor(225, 225, 225); doc.setLineWidth(0.2);
  doc.line(M, PH - 14, PW - M, PH - 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); setColor(GRAY);
  doc.text('Gym Management System — Owner\'s Manual', M, PH - 9);
  doc.text(`Page ${p} of ${pages}`, PW - M, PH - 9, { align: 'right' });
}

const out = process.argv[2] || 'Gym-System-Owner-Manual.pdf';
writeFileSync(out, Buffer.from(doc.output('arraybuffer')));
console.log('✔ Wrote ' + out + ' (' + pages + ' pages)');
