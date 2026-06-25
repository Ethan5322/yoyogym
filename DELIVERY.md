# Delivery Guide — Premium AI Gym System

Single-tenant: one Supabase project + one Vercel deployment **per gym**.

---

## 1. Deploy to production (Vercel)

1. Push the repo to GitHub.
2. In Vercel: **New Project → import the repo**. Framework preset: **Vite**. Build is already defined in `vercel.json` (`npm run build` → `dist`).
3. Add **Environment Variables** (Production + Preview) — copy from `.env.example`:
   - Required now: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SCHEMA=gym`, `JWT_SECRET`, `BCRYPT_ROUNDS=12`
   - Payments: `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`
   - Email/alerts: `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `OWNER_EMAIL`, `CALLMEBOT_*`
   - Cron: `CRON_SECRET`
4. **Deploy.**
5. Post-deploy, run once locally against prod env (or via SQL/seed):
   - `npm run seed:owner` — create the owner login
   - `npm run seed:catalog` — default plans/add-ons (or configure in Admin → Catalog)
6. **Paystack dashboard** → Webhooks → set `https://YOUR-DOMAIN/api/payments/webhook`.
7. **Verify**: open `https://YOUR-DOMAIN/api/health` → `{ status: "ok", schema: "gym" }`.

### Cron schedule
`vercel.json` defines 3 scheduled jobs:
- `/api/cron/daily` — **06:00 daily** orchestrator: runs retry-suspend, billing
  reminders, billing, expiry, class-reminders, reengagement in sequence (each
  isolated so one failure doesn't stop the rest).
- `/api/cron/daily-summary` — **20:00 daily** owner summary (spec Part 5 #10).
- `/api/cron/weekly-schedule` — **Mon 07:00** weekly class schedule to active members (spec 3.4).

Every job is also exposed as its own endpoint and can be triggered manually /
by an external scheduler with header `Authorization: Bearer <CRON_SECRET>`.

**Hobby vs Pro:** the spec also calls for an *hourly* failed-payment check. The
daily orchestrator covers it once per day (fine for most gyms). For true hourly
granularity, upgrade to Vercel **Pro** and add `{ "path": "/api/cron/retry-suspend",
"schedule": "0 * * * *" }`, or point a free external scheduler (e.g. cron-job.org)
at that endpoint.

---

## 2. QR codes
Admin → **QR Codes**: download/print the two codes (New Member → `/register`,
Existing Member → `/member`). Both carry `?src=qr` for scan analytics.

---

## 3. End-to-end test checklist

### Registration (public)
- [ ] Splash → "Join as New Member" loads the chatbot with a time-of-day greeting
- [ ] Personal info validates (bad email, under-16 DOB, SA ID Luhn)
- [ ] Back-edit works; refresh mid-flow resumes (localStorage)
- [ ] PAR-Q: any YES → medical-clearance message + flag; all NO → cleared
- [ ] Goals (multi), experience/frequency/time, optional injuries (skip)
- [ ] Membership: tiers show prices **from DB**, Most Popular badge, contract durations
- [ ] Add-ons: running total + "No thanks"
- [ ] Medical aid → provider; Summary breakdown correct
- [ ] Agreement: both checkboxes + signature required
- [ ] Success screen: membership number + verification code shown
- [ ] **Download Membership PDF** produces 2-page card + confirmation with QR
- [ ] Pay Securely → Paystack → `/payment/callback` → membership becomes **active**
- [ ] Welcome email + owner WhatsApp/Telegram/email received (if configured)

### Member portal (`/member`)
- [ ] Login by membership number + phone
- [ ] Status (plan, expiry, sessions, outstanding), Check In, Classes (book + waitlist), History
- [ ] Request data deletion (POPIA)

### Admin (`/admin`)
- [ ] Login (bcrypt), 5 failed → lockout
- [ ] Dashboard metrics + alert banners
- [ ] **Verify**: valid code → green + auto check-in; invalid → red, reason only
- [ ] Members search/filter, detail, suspend/reactivate, notes, **owner-only delete**
- [ ] Manual registration, Today, Classes CRUD, Trainers CRUD
- [ ] Payments (manual record + CSV), Analytics, Calendar, Communications (email blast)
- [ ] Catalog (plans/add-ons) edits flow into the chatbot
- [ ] Settings (owner-only): profile, notifications, discounts, legal text
- [ ] RBAC: reception limited to Verify/Today/Register; manager blocked from Settings

### Crons (trigger manually with `Authorization: Bearer <CRON_SECRET>`)
- [ ] `/api/cron/billing`, `/api/cron/retry-suspend`, `/api/cron/expiry`,
      `/api/cron/class-reminders`, `/api/cron/daily-summary`, `/api/cron/reengagement`,
      `/api/cron/weekly-schedule`
- [ ] `/api/cron/daily` orchestrator runs all morning jobs in one call

---

## 4. POPIA compliance (audit)
- ✅ Personal data accessed only via serverless functions (service-role); browser never touches DB
- ✅ RLS enabled on all tables; default deny
- ✅ POPIA consent timestamp captured at registration; privacy policy shown + editable
- ✅ Right to erasure: member self-request + owner hard-delete (cascades)
- ✅ Secrets in env vars only; none in frontend/bundle
- ✅ Supabase encrypts data at rest
- ⚠️ Consider column-encryption of `id_number` if your risk profile requires (breaks exact search)

## 5. Security (audit)
- ✅ Admin bcrypt + JWT (8h) + failed-login lockout; member JWT (12h)
- ✅ RBAC enforced server-side on every admin endpoint
- ✅ Paystack webhook: signature check **and** API re-verify
- ✅ Server recomputes all prices (never trusts client amounts)
- ✅ Rate limiting on register / admin-login / member-login (best-effort; use Upstash for shared limits)
- ✅ Security headers (HSTS, nosniff, frame options, referrer/permissions policy)
- ✅ Input validation client + server; generic auth error messages

## 6. Known follow-ups (not blocking)
- AI chatbot upgrade: the registration flow is currently a polished rule-based
  conversation. Set `ANTHROPIC_API_KEY` and wire `src/chatbot/messages.js`
  (AI-upgrade seam already in place) to enable live Claude responses.
- Server-side PDF attachment on the welcome email (members can download from success screen)
- Optional: embed Oswald/Bebas fonts in the PDF (currently standard PDF fonts)
- Member WhatsApp (CallMeBot supports owner alerts only; members receive email)

### Done in this pass
- ✅ Weekly Monday class-schedule email (`/api/cron/weekly-schedule`)
- ✅ Daily owner summary moved to its own 20:00 schedule (spec Part 5 #10)
- ✅ All member email templates upgraded to the detailed, branded style
- ✅ Version-controlled DB schema committed (`db/schema.sql`)
