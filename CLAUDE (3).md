# PREMIUM AI GYM MEMBERSHIP & BOOKING AUTOMATION SYSTEM
# MuleSoo Digital Solutions — Build Specification
# South Africa Market — Compliant with CPA & Health Regulations

---

## SYSTEM OVERVIEW

A complete end-to-end AI-powered gym membership and session 
booking automation system. Members and walk-in clients scan 
a QR code, are guided by a professional AI assistant through 
registration, health screening, membership or session 
selection, payment, and verification. The gym owner manages 
everything through a sophisticated admin dashboard with zero 
manual paperwork required.

Built for: Independent gyms, boutique fitness studios, 
personal training facilities, and fitness centers across 
South Africa and Africa.

---

## PART 1 — SOUTH AFRICA GYM MARKET CONTEXT
(Research-based — these are the real steps SA gyms follow)

WHAT A NEW GYM MEMBER CURRENTLY GOES THROUGH MANUALLY:
1. Walks in or calls the gym
2. Fills in a paper registration form (personal details)
3. Completes a Physical Activity Readiness Questionnaire (PAR-Q) 
   — mandatory health screening by SA law
4. Signs an indemnity/waiver form
5. Chooses membership type and contract duration
6. Selects training focus and schedule preferences
7. Chooses add-ons (personal trainer, classes, locker, etc.)
8. Signs the membership contract
9. Pays joining fee + first month fee
10. Gets issued an access card or fingerprint registered
11. Receives a paper membership confirmation

THIS SYSTEM AUTOMATES ALL 11 STEPS via QR code + AI chatbot.

---

## PART 2 — PUBLIC CLIENT-FACING SYSTEM

### 2.1 QR CODE ENTRY
- Unique branded QR code per gym
- Can be placed on: entrance door, reception desk, 
  flyers, social media, business cards, windows
- QR code is trackable — logs every scan with 
  timestamp, device, and approximate location
- Scan analytics visible in admin dashboard
- Two QR codes generated:
  A) NEW MEMBER QR — opens membership registration flow
  B) EXISTING MEMBER QR — opens session check-in or 
     class booking flow

### 2.2 SPLASH / LANDING SCREEN
Client sees immediately after scan:
- Gym logo and name (fully branded)
- Professional gym tagline
- Two clear buttons:
  "JOIN AS A NEW MEMBER" (primary, large)
  "I AM ALREADY A MEMBER" (secondary)
- Language option (English + Zulu/Afrikaans if needed)
- Design: dark premium athletic aesthetic — powerful, 
  motivating, professional

---

### 2.3 NEW MEMBER REGISTRATION FLOW
AI chatbot guides step by step, one question at a time.
Warm, motivating, encouraging tone throughout.

STEP 1 — WELCOME & MOTIVATION
- AI greets warmly by time of day
- Short motivating message: "You are making a great 
  decision for your health and fitness"
- Explains the process takes 5-7 minutes
- Confirms this is a secure, private registration

STEP 2 — PERSONAL INFORMATION
- Full name (validated: minimum 2 words)
- Date of birth (validated: must be 16+ to register, 
  under 18 requires guardian consent flag)
- Gender (Male / Female / Prefer not to say)
- South African ID number OR passport number 
  (for identity verification — required by SA gyms)
- Phone number with international code (+27 for SA)
- Email address (validated format)
- Physical address (street, suburb, city, postal code)
- Emergency contact name and phone number
  (standard SA gym requirement)

STEP 3 — PHYSICAL ACTIVITY READINESS QUESTIONNAIRE (PAR-Q)
MANDATORY — required by South African health and fitness 
industry standards. Client must answer YES or NO to each:

1. Has your doctor ever said you have a heart condition 
   and that you should only do physical activity 
   recommended by a doctor?
2. Do you feel pain in your chest when you do 
   physical activity?
3. In the past month, have you had chest pain when 
   you were NOT doing physical activity?
4. Do you lose your balance because of dizziness, 
   or do you ever lose consciousness?
5. Do you have a bone or joint problem that could 
   be made worse by a change in your physical activity?
6. Is your doctor currently prescribing drugs for 
   your blood pressure or heart condition?
7. Do you know of any other reason why you should 
   not do physical activity?

IF ANY ANSWER IS YES:
- AI explains the member should consult their doctor 
  before joining
- System flags this member as MEDICAL CLEARANCE REQUIRED
- Allows them to continue but adds a note in their 
  profile visible to admin
- A medical clearance upload option is provided

IF ALL ANSWERS ARE NO:
- AI confirms they are cleared to proceed
- Continues to next step

STEP 4 — FITNESS GOALS & EXPERIENCE
(Personalizes their membership and trainer assignment)

Primary fitness goal — client selects one or more:
- Weight Loss / Fat Burning
- Muscle Building / Strength
- Improve Fitness / Cardio
- Stress Relief / Mental Health
- Sports Performance
- Rehabilitation / Injury Recovery
- General Health & Wellness
- Body Toning & Definition

Fitness experience level:
- Complete Beginner (never trained before)
- Beginner (trained occasionally)
- Intermediate (training 1-2 years)
- Advanced (training 3+ years)
- Athlete / Professional

How often do you plan to train per week:
- 1-2 times per week
- 3-4 times per week
- 5-6 times per week
- Every day

Preferred training time:
- Early Morning (5AM - 8AM)
- Morning (8AM - 12PM)
- Afternoon (12PM - 5PM)
- Evening (5PM - 9PM)
- Flexible / No preference

Any injuries or physical limitations:
(Open text field — optional but recommended)

STEP 5 — MEMBERSHIP TYPE SELECTION
Client chooses visit type first:

A) FULL MEMBERSHIP (Monthly recurring)
B) ONE-TIME / DAY PASS (single visit)
C) SESSION PACK (buy multiple sessions upfront)
D) TRIAL MEMBERSHIP (first 7 days special rate)

IF FULL MEMBERSHIP SELECTED — choose plan:

BASIC MEMBERSHIP
- Access to gym floor and equipment only
- No classes included
- Single club access
- No peak hour restrictions
- Price: configurable by gym owner (e.g. R299/month)

STANDARD MEMBERSHIP
- Full gym floor access
- 4 group classes per month included
- Single club access
- Price: configurable (e.g. R499/month)

PREMIUM MEMBERSHIP
- Full gym floor access
- Unlimited group classes
- 1 personal training session per month
- Locker access
- Price: configurable (e.g. R799/month)

VIP / ELITE MEMBERSHIP
- Full gym floor access
- Unlimited group classes
- 4 personal training sessions per month
- Priority locker
- Nutritional consultation (1 per month)
- Guest pass (bring 1 friend free per month)
- Price: configurable (e.g. R1,499/month)

CONTRACT DURATION (for full memberships):
- Month-to-Month (no commitment, higher monthly rate)
- 3 Month Contract
- 6 Month Contract (discounted rate)
- 12 Month Contract (best rate, CPA compliant — 
  member must see full contract terms including 
  cancellation policy before signing)

IF SESSION PACK SELECTED — choose pack:
- 5 Sessions Pack
- 10 Sessions Pack
- 20 Sessions Pack
- Each pack shows price per session and total price

IF DAY PASS SELECTED:
- Single visit fee shown
- No contract required

STEP 6 — ADD-ON SERVICES
Client can select additional services:
(each with clear price)

PERSONAL TRAINING:
- Personal Trainer Assessment (once-off)
- Personal Training Sessions (per session or pack)
- Online Coaching Program (monthly)

FITNESS CLASSES (if not included in membership):
- Yoga
- Pilates
- HIIT / Circuit Training
- Spin / Cycling
- Boxing / Kickboxing
- Zumba / Dance Fitness
- Crossfit Style Training
- Stretching & Mobility

ADDITIONAL SERVICES:
- Locker Rental (monthly)
- Towel Service (monthly)
- Protein Shake / Supplement Bar access
- Body Composition Assessment (BMI, body fat %)
- Nutrition Consultation
- Gym Bag Storage

STEP 7 — MEDICAL AID / DISCOVERY VITALITY INTEGRATION
South African specific — very important for sales:
- Does the member have medical aid? (YES / NO)
- If YES: select their medical aid provider:
  Discovery Vitality, Momentum Multiply, Bonitas, 
  Gems, Bankmed, Sanlam, Liberty, PPS, Universal 360, 
  Other, None
- AI notes: some medical aids offer gym fee discounts 
  or cashbacks — member should check with their provider
- Admin is notified to follow up on medical aid benefit 
  setup for eligible members

STEP 8 — MEMBERSHIP SUMMARY & PRICING BREAKDOWN
AI displays complete summary:
- Selected membership type and plan
- Contract duration
- Monthly fee
- Joining/activation fee (once-off)
- Add-ons selected and their costs
- Total due today (joining fee + first month)
- Total monthly recurring amount going forward
- Total contract value (for fixed contracts)

Client confirms or goes back to change selections.

STEP 9 — INDEMNITY & MEMBERSHIP CONTRACT
(South African legal requirement)

INDEMNITY WAIVER — client must read and accept:
"I acknowledge that physical exercise carries inherent 
risks including injury or illness. I confirm that I 
am physically capable of participating in a gym 
environment. I indemnify [GYM NAME] and its staff 
against any injury, illness, loss, or damage arising 
from my use of the facilities, to the extent permitted 
by South African law."

MEMBERSHIP CONTRACT — client must read and accept:
- Monthly debit order authorization
- Cancellation policy (20 business days written notice 
  required — CPA compliant)
- Early cancellation fee policy
- Gym rules and code of conduct
- Privacy policy (POPIA compliant — Protection of 
  Personal Information Act)
- Guest policy
- Medical emergency policy

Client must:
- Check "I have read and agree to the indemnity waiver"
- Check "I have read and agree to the membership contract"
- Type their full name as a digital signature
- All acceptances recorded with timestamp

STEP 10 — DEBIT ORDER / PAYMENT AUTHORIZATION
For monthly membership:
- Client enters banking details OR
- Client selects Paystack debit/card payment
- First payment (joining fee + first month) processed 
  immediately via Paystack
- System records payment method for recurring billing

For once-off / session packs:
- Full payment via Paystack immediately

STEP 11 — MEMBERSHIP CONFIRMATION
After successful payment:
- Unique MEMBERSHIP NUMBER generated 
  (format: GYM-YYYY-XXXXXX)
- Unique VERIFICATION CODE generated 
  (for access verification at the gym)
- Membership start date confirmed
- PDF membership card + confirmation document generated
- Member sees success screen with their membership 
  number and verification code displayed prominently
- WhatsApp notification sent to gym owner instantly

---

### 2.4 EXISTING MEMBER FLOW
When existing member scans QR code:
- They enter their membership number OR phone number
- System verifies their active membership
- They can:
  A) Check in for today's gym session (logs attendance)
  B) Book a group fitness class
  C) Book a personal training session
  D) View their session history and attendance
  E) View their membership status and expiry
  F) Pay outstanding balance if any
  G) Upgrade or add services to their membership

CLASS BOOKING FLOW:
- View class schedule for the week
- Select class, date, and time slot
- Confirm booking (class capacity is enforced)
- Receive class booking confirmation
- Reminder sent 1 hour before class via WhatsApp

---

### 2.5 MEMBERSHIP CARD PDF DOCUMENT
Generated immediately after successful registration.
Premium design — member keeps this as their proof 
of membership.

PAGE 1 — MEMBERSHIP CARD (credit card style layout):
- GYM LOGO prominently displayed
- "MEMBER" label in premium typography
- Member full name
- Membership number (large, scannable)
- Membership tier (BASIC / STANDARD / PREMIUM / VIP)
- Valid From / Valid Until dates
- Verification code (QR code of their member number)
- Gym contact details and address
- Design: dark premium athletic — black, accent color 
  (configurable per gym — red, gold, blue etc.)

PAGE 2 — FULL REGISTRATION CONFIRMATION:
- Registration date and time
- Complete personal information summary
- PAR-Q responses summary
- Fitness goals and experience level recorded
- Selected membership plan and price breakdown
- Add-on services selected
- Contract duration and terms summary
- Next payment date and amount
- Gym rules summary
- Emergency contact information
- Medical aid details (if provided)
- Verification code prominently displayed with 
  instruction: "Show this code at reception for 
  first-time access"
- Gym owner signature space
- Branded footer with gym contact info

DESIGN STANDARDS FOR PDF:
- Dark premium athletic aesthetic
- Gym brand colors throughout
- No plain white pages — dark background with 
  light text or white background with strong 
  dark/color accents
- Premium typography (serif for headers, clean 
  sans-serif for body)
- All text fully readable, no overlapping, 
  no truncation
- Properly embedded fonts for cross-device rendering
- Prints cleanly on A4

---

### 2.6 AUTOMATED NOTIFICATIONS (MEMBER SIDE)

EMAIL NOTIFICATIONS (via Brevo):
1. Welcome email with membership PDF attached 
   (immediately after registration)
2. First payment receipt
3. Monthly payment receipt (every billing cycle)
4. Class booking confirmation
5. Class reminder (1 hour before class)
6. Membership renewal reminder (7 days before expiry)
7. Session pack running low (2 sessions remaining)
8. Cancellation confirmation (if member cancels)

WHATSAPP NOTIFICATIONS (via CallMeBot):
1. Welcome message with membership number
2. Payment confirmations
3. Class reminders (1 hour before)
4. Membership expiry warnings

---

## PART 3 — AUTOMATED BUSINESS LOGIC

### 3.1 PAYMENT & BILLING AUTOMATION

JOINING FEE + FIRST MONTH:
- Collected immediately at registration via Paystack
- Receipt sent automatically

MONTHLY RECURRING:
- System tracks billing dates per member
- Reminder sent to member 3 days before billing date
- Payment collected automatically via Paystack
- If payment fails: retry after 3 days
- If second attempt fails: access flagged as SUSPENDED, 
  member notified, owner notified

SESSION PACK TRACKING:
- System tracks remaining sessions per member
- When 2 sessions remain: auto-reminder sent
- When 0 sessions remain: access flagged, 
  member prompted to purchase another pack

### 3.2 MEMBERSHIP LIFECYCLE MANAGEMENT

NEW → ACTIVE:
- After payment + verification code generated

ACTIVE → EXPIRING:
- 7 days before contract end date
- Auto-reminder sent to renew
- Owner notified of upcoming expiry

EXPIRING → RENEWED:
- If member renews, new end date set automatically
- New contract generated if duration changes

EXPIRING → LAPSED:
- If not renewed, access flagged as EXPIRED
- Owner notified of churned member
- Auto re-engagement email sent to member after 7 days

SUSPENDED:
- Failed payment or policy violation
- Access blocked at verification level
- Owner notified

### 3.3 CLASS CAPACITY MANAGEMENT
- Each class has configurable maximum capacity
- When class is full: shows as FULLY BOOKED
- Waitlist available (member placed on waitlist, 
  auto-notified if spot opens)
- If member cancels with less than 2 hours notice: 
  flagged as late cancellation

### 3.4 CRON JOB SCHEDULE
- Every hour: check for failed payments, 
  expired memberships
- Every day 6:00 AM: send class reminders for 
  day's bookings
- Every day 8:00 AM: process membership renewals
- Every day 9:00 AM: send expiry reminders
- Every week Monday: send weekly class schedule 
  to all active members

---

## PART 4 — ADMIN DASHBOARD

### 4.1 ACCESS & SECURITY
- URL: /admin (separate from member-facing site)
- Username + password login (bcrypt hashed)
- Session expires after 8 hours
- Failed login attempts logged
- Role-based access: 
  OWNER (full access)
  MANAGER (full access except settings)
  RECEPTION STAFF (verify, check-in, class booking)
  TRAINER (view own clients only)

### 4.2 DASHBOARD HOME
At-a-glance overview when admin logs in:
- Today's member check-ins (live counter)
- New registrations today / this week / this month
- Active members total count
- Lapsed members count (potential win-backs)
- Revenue today / this week / this month
- Upcoming classes today with capacity status
- Recent activity feed (last 10 events)
- Alert banners:
  - Failed payments requiring attention
  - Members with PAR-Q medical flags
  - Memberships expiring in 7 days
  - Classes at 90%+ capacity
  - New registrations since last login

### 4.3 MEMBER VERIFICATION (MAIN DAILY USE)
Purpose: Verify member access at gym entrance
- Large input field for verification code or 
  membership number
- Supports barcode/QR scanner input
- VALID ACTIVE MEMBER shows:
  - Green banner: MEMBER ACCESS GRANTED
  - Member photo (if uploaded)
  - Full name and membership number
  - Membership tier and status
  - Valid until date
  - Payment status (up to date / overdue)
  - PAR-Q flag (if medical clearance required)
  - Session count remaining (for packs)
  - Check-in logged automatically with timestamp
- INVALID / EXPIRED / SUSPENDED shows:
  - Red banner: ACCESS DENIED
  - Reason (expired / suspended / not found)
  - NO sensitive personal details shown
  - Option to direct member to reception

### 4.4 MEMBER MANAGEMENT
- Complete member database searchable by:
  Name, membership number, phone, email, ID number
- Filter by: membership tier, status, contract type, 
  medical aid, PAR-Q flag, registration date
- Each member profile includes:
  - Personal information (full registration data)
  - PAR-Q health screening results
  - Fitness goals and experience level
  - Membership history (all plans they have had)
  - Payment history (all transactions)
  - Attendance history (every check-in logged)
  - Class booking history
  - Add-on services active
  - Notes field (staff can add notes per member)
  - Emergency contact information
  - Medical aid details
  - Document uploads (medical clearance if flagged)
- Quick actions per member:
  - Send message (WhatsApp or email)
  - Renew membership
  - Upgrade/downgrade plan
  - Suspend / reactivate access
  - Generate new verification code
  - Mark as checked in (manual check-in)
  - Add note to profile

### 4.5 NEW MEMBER REGISTRATION (MANUAL)
For walk-in clients registering at reception:
- Same complete flow as the chatbot — all fields
- All PAR-Q questions completed by staff with member
- Staff selects membership tier and add-ons
- Payment processed via Paystack or marked as 
  cash/EFT paid
- Membership PDF generated and printed or emailed
- Member flagged as MANUALLY REGISTERED

### 4.6 TODAY'S OVERVIEW
- All members checked in today (live, updates in real-time)
- Check-in timeline (who came in at what time)
- Current members inside the gym (checked in, 
  not yet checked out)
- Today's class schedule with:
  - Class name, time, trainer, capacity
  - Booked vs available slots
  - Members booked for each class
- Quick check-in button (for reception use)

### 4.7 CLASS MANAGEMENT
- View, create, edit, delete classes
- Each class has:
  - Class name
  - Trainer/instructor name
  - Day and time (recurring or one-off)
  - Duration
  - Maximum capacity
  - Minimum capacity (cancel if below this)
  - Members required to book in advance (YES/NO)
  - Which membership tiers can attend this class
- View bookings per class
- Send notification to all booked members
- Cancel a class and notify all booked members automatically
- Class attendance tracking

### 4.8 TRAINER MANAGEMENT
- Add, edit, remove trainers
- Each trainer profile:
  - Full name, contact details, specialization
  - Certifications and qualifications
  - Assigned clients (personal training)
  - Class schedule
  - Availability settings
- View trainer's full client list
- Trainer can log workout notes per client session
- Trainer performance: clients trained per month, 
  session completion rate

### 4.9 PAYMENT & FINANCIAL MANAGEMENT
- All payments: received, pending, failed, refunded
- Filter by: member name, date range, payment type, 
  membership tier
- Revenue breakdown:
  - New joining fees
  - Monthly membership fees
  - Session pack purchases
  - Personal training fees
  - Class add-on fees
  - Day pass / one-time fees
- Monthly revenue chart (line graph)
- Revenue by membership tier (bar chart)
- Failed payment tracking with retry status
- Manual payment recording (for cash/EFT payments)
- Refund recording
- Export financial data to CSV for accounting

### 4.10 ATTENDANCE & ANALYTICS
- Total check-ins by day / week / month (chart)
- Peak hours heatmap (which hours are busiest)
- Most popular classes
- Member retention rate
- Churn rate (members who lapsed each month)
- New registrations vs lapsed members chart
- Revenue trend over time
- Medical aid member breakdown
- Membership tier distribution pie chart
- QR code scan analytics (how many scanned, 
  how many converted to registrations)
- Export all reports to PDF or CSV

### 4.11 CALENDAR & SCHEDULE
- Full calendar view of all classes, events, and 
  member bookings
- Color coded by type:
  - Blue: regular classes
  - Green: personal training sessions
  - Orange: special events
  - Gray: blocked/closed days
- Admin can:
  - Add special events or gym promotions
  - Block days (public holidays, maintenance)
  - Set recurring classes
  - View any date for full schedule

### 4.12 NOTIFICATIONS & COMMUNICATIONS
- Bulk message sender: send WhatsApp or email 
  to filtered member groups
  Examples: 
  "All Premium members"
  "Members whose membership expires this month"
  "Members who haven't visited in 30 days"
- Automated message templates (customizable)
- Communication history per member
- Schedule future communications
- Promotional campaign manager

### 4.13 SETTINGS & CONFIGURATION
(Everything configurable — no developer needed)

GYM PROFILE:
- Gym name, logo, brand colors
- Address, contact details, website
- Operating hours
- Social media links
- Welcome message on splash screen

MEMBERSHIP PLANS:
- Add, edit, remove plans
- Set prices, descriptions, included benefits
- Enable/disable plans
- Mark plan as featured/most popular

JOINING FEES:
- Set joining/activation fee per plan
- Set promotional joining fee (e.g. R0 joining special)

ADD-ON SERVICES:
- Add, edit, remove add-on options
- Set prices per add-on

DAY PASS & TRIAL SETTINGS:
- Day pass price
- Trial membership duration and price

PAYMENT SETTINGS:
- Paystack API keys (live and test)
- Billing day of month for monthly memberships
- Failed payment retry settings

NOTIFICATIONS:
- Owner WhatsApp number
- Owner Telegram username  
- Owner email
- Customize each notification template
- Toggle each notification type on/off

GYM RULES:
- Edit gym rules shown to members during registration

TERMS AND CONDITIONS:
- Edit full membership contract terms
- Edit indemnity waiver text
- POPIA privacy policy text
- Version history tracked

PAR-Q SETTINGS:
- Enable/disable PAR-Q (enabled by default, recommended)
- Add custom PAR-Q questions if needed

ACCESS CONTROL:
- Set access hours per membership tier
- Configure peak hour restrictions if needed

---

## PART 5 — OWNER NOTIFICATION SYSTEM

OWNER RECEIVES INSTANT NOTIFICATION FOR:
1. New member registered — name, plan, joining fee paid
2. Payment received — member name, amount, plan
3. Payment failed — member name, amount, retry scheduled
4. Member check-in — name, membership tier, time
   (optional — can be turned off for high-volume gyms)
5. New class booking — class name, member name
6. Class cancellation by member — class, member name
7. Membership expiring in 7 days — member name, plan
8. Membership lapsed — member name, churn alert
9. PAR-Q medical flag — new member needs medical 
   clearance review
10. Daily summary (sent 8 PM): total check-ins, 
    revenue, new members, classes held

NOTIFICATION CHANNELS:
- WhatsApp (CallMeBot) — instant
- Telegram (CallMeBot) — backup
- Email (Brevo) — detailed version
- In-app dashboard alert

---

## PART 6 — TECHNICAL ARCHITECTURE

### 6.1 TECH STACK
- Frontend: React + Vite + Tailwind CSS
- Backend: Node.js serverless functions (Vercel)
- Database: Supabase (PostgreSQL)
- AI: Anthropic Claude API (claude-sonnet-4-6)
- Payments: Paystack (primary for SA)
- Email: Brevo (300 free/day)
- WhatsApp: CallMeBot
- Telegram: CallMeBot
- PDF generation: jsPDF (membership card + confirmation)
- QR Code generation: qrcode.js
- Deployment: Vercel
- Version control: GitHub

### 6.2 DATABASE TABLES
- members (complete member profiles)
- memberships (active and historical membership plans)
- plans (configurable membership tiers)
- payments (all transactions)
- checkins (attendance log — every check-in)
- classes (class schedule and details)
- class_bookings (which members booked which classes)
- trainers (trainer profiles)
- training_sessions (PT session records)
- parq_responses (health screening per member)
- addon_services (available add-ons)
- member_addons (which addons each member has)
- notifications_log (all notifications sent)
- admin_users (admin roles and authentication)
- settings (all gym configuration)
- qr_scan_analytics (QR scan tracking)

### 6.3 SECURITY REQUIREMENTS
- POPIA compliant (Protection of Personal Information Act)
- All personal data encrypted at rest in Supabase
- Supabase Row Level Security on all tables
- Admin passwords hashed with bcrypt
- Paystack webhook signature verification
- Session tokens with automatic expiry
- Input validation and sanitization on all fields
- Rate limiting on registration and payment endpoints
- No sensitive data in frontend code or console logs

### 6.4 PERFORMANCE REQUIREMENTS
- Page load under 2 seconds on mobile (4G)
- QR scan to loaded chatbot under 1.5 seconds
- Member verification response under 500ms
- All fonts preloaded — no flash of unstyled text
- Optimized for Android phones (dominant SA market)

---

## PART 7 — DESIGN SPECIFICATION

### 7.1 CHATBOT INTERFACE DESIGN
THEME: DARK PREMIUM ATHLETIC

Colors:
- Background: #0A0A0A (deep black)
- Surface: #141414
- Elevated surface: #1C1C1C
- Primary accent: configurable per gym 
  (default: electric red #E63946 or gold #C8922A)
- Body text: #F5F0E8 (warm white)
- Secondary text: #9A9590
- Success: #2ECC71
- Error: #E74C3C

Typography:
- Headers: Bebas Neue or Oswald (athletic, powerful)
- Body: Inter or DM Sans (clean, readable)
- All fonts loaded via Google Fonts

AI Message Bubbles:
- Dark surface (#1A1A1A)
- Subtle accent border (1px, 15% opacity)
- Fade-in + slide-up entrance animation (200ms)
- Generous padding and line height (1.75)

User Message Bubbles:
- Accent color gradient
- Dark text on light/colored background
- Same entrance animation, right-aligned

Typing indicator:
- Three pulsing dots in accent color
- Staggered animation (dignified, not playful)

Option Buttons (for selections):
- Outlined style, accent color border and text
- On hover: subtle fill
- On selected: solid fill, dark text
- Never use generic pill shapes

### 7.2 PDF DESIGN
MEMBERSHIP CARD (Page 1):
- Landscape credit-card proportions
- Dark background with gym accent color accents
- Member name in premium typography
- QR code of membership number
- Membership tier badge (colored per tier)
- Holographic-effect stripe design element
- Gym logo prominent
- Feels like a premium physical card

CONFIRMATION DOCUMENT (Page 2+):
- Dark luxury header (gym brand colors)
- Gold or accent-colored section dividers with 
  diamond ornament: ————◆————
- Stitched/double border frame around each page
- All data in clean two-column grid
- PAR-Q summary in highlighted box
- Verification code in prominent bordered box, 
  large monospace font
- Fitness goals shown as visual badges
- Membership tier shown with color-coded badge
- Professional branded footer
- Every word readable, no overlapping text
- Properly embedded fonts

---

## PART 8 — BUILD ORDER

PHASE 1 — DATABASE & FOUNDATION
1. Set up all Supabase tables
2. Configure Vercel project and environment variables
3. Build React app with routing structure
4. Implement admin login and role-based access

PHASE 2 — REGISTRATION CHATBOT
5. Build AI chatbot conversation engine
6. Implement PAR-Q health screening step
7. Implement fitness goals and experience collection
8. Build membership plan selection with pricing
9. Build add-on services selection
10. Implement indemnity and contract acceptance
11. Connect to Supabase to save member data

PHASE 3 — PAYMENTS
12. Integrate Paystack for joining fee + first month
13. Build Paystack webhook for payment confirmation
14. Implement membership status updates
15. Build session pack purchase flow

PHASE 4 — PDF & VERIFICATION
16. Build membership card PDF (Page 1 — card design)
17. Build full confirmation PDF (Page 2 — document)
18. Generate unique membership number and 
    verification code per registration

PHASE 5 — NOTIFICATIONS
19. Integrate Brevo for all member emails
20. Build all email templates (welcome, receipts, 
    reminders, class confirmations)
21. Integrate CallMeBot WhatsApp for owner alerts
22. Integrate CallMeBot Telegram
23. Build all owner notification triggers

PHASE 6 — EXISTING MEMBER FLOW
24. Build member login (membership number + phone)
25. Build class booking flow
26. Build check-in flow
27. Build session history view
28. Build membership status view

PHASE 7 — ADMIN DASHBOARD
29. Dashboard home with live analytics
30. Member verification screen
31. Member management and search
32. Manual registration flow
33. Today's overview and check-ins
34. Class management
35. Trainer management
36. Payment and financial management
37. Attendance analytics and charts
38. Calendar and schedule management
39. Bulk communication tools
40. Settings and configuration panel

PHASE 8 — AUTOMATION
41. Monthly billing cron job
42. Failed payment retry and suspension cron
43. Membership expiry detection and reminder cron
44. Class reminder cron
45. Daily summary notification to owner cron
46. Re-engagement email for lapsed members

PHASE 9 — POLISH & DELIVERY
47. Complete UI redesign — dark premium athletic
48. Mobile optimization (375px first)
49. Performance optimization
50. POPIA compliance audit
51. Security audit
52. End-to-end testing of full registration flow
53. End-to-end testing of admin dashboard
54. QR code generation and print-ready file
55. Deploy to production on Vercel

---

## PART 9 — PRICING JUSTIFICATION

This system replaces / automates:
- Receptionist salary: R8,000-R15,000/month
- Paper registration forms and filing
- Manual payment follow-up
- Manual membership card printing
- Manual class booking management
- Manual attendance tracking
- Manual monthly invoicing and billing

ROI for gym owner:
- Saves 40+ hours/month of admin work
- Never misses a lead (24/7 registration)
- Automated payment collection reduces churn
- Professional member experience increases 
  perceived value of the gym
- Medical/legal compliance built in (PAR-Q, 
  POPIA, CPA, indemnity)

---

## NOTES FOR CLAUDE CODE

- Always read this entire CLAUDE.md before starting
- Confirm Supabase table structure before any query
- Build and test each phase before moving to next
- Never hardcode API keys — environment variables only
- Every screen must work perfectly on mobile (375px)
- POPIA compliance is mandatory — handle personal data 
  with care, include privacy policy, data deletion option
- PAR-Q is a legal requirement in SA fitness industry — 
  must be implemented correctly
- Medical aid integration is a major SA gym selling point 
  — make it prominent in the UI
- Build clean, documented, maintainable code — this 
  system will be resold to multiple gym clients
