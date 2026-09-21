---
aliases: ["API Documentation", "Endpoint Inventory"]
tags: [api, reference, existing-system]
stage: "Stage 2"
status: complete
updated: 2026-09-21
---

# 16 — API Documentation

Complete endpoint inventory, **[C]** read from the routers and their handlers. Updated 2026-09-21
after the member-payment removal: **5 routers**, not 6.

## Routing model

Only **5 files** are Serverless Functions; all logic lives in `server/` outside `api/`, to stay
inside the Vercel function budget. Each router is a fixed key map — an unknown key returns 404,
and every router wraps its handler in `captureError`. **[C]**

```text
api/[...path].js          → public       (7 routes)
api/auth/[...path].js     → admin auth   (4)
api/admin/[...path].js    → admin        (37)
api/member/[...path].js   → member       (17)
api/cron/[...path].js     → cron         (8)
```

> **Changed 2026-09-21.** `api/payments/[...path].js` was **removed** with the member-payment
> removal ([[21 - Member Payment Removal Design]]), freeing a Serverless Function slot — **5 routers
> now, not 6**. `/api/member/pay` is gone. Members pay the gym directly; staff record it in
> Admin → Payments and **that capture activates the member**.

## Public — no authentication

| Route | Method | Purpose |
|---|---|---|
| `/api/health` | GET | Runtime + Supabase connectivity check |
| `/api/catalog` | GET | Enabled plans, add-ons, contract discounts (for the chatbot) |
| `/api/content` | GET | Public legal/branding text from `settings` |
| `/api/register` | POST | **New member registration** — rate limit 6/min |
| `/api/scan` | POST | Log a QR scan; never blocks the page |
| `/api/document` | POST | **Membership PDF data** — auth = membership number + verification code |
| `/api/public-profile` | GET | `?type=member&key=…` or `?type=trainer&id=…` |

## Admin auth — `/api/auth/*`

`login` (POST, rate limit 10/min, 5-attempt lockout) · `me` (GET) · `face-login` (POST) ·
`change-password` (POST).

## Admin — `/api/admin/*` (37 routes)

Roles: **O** owner · **M** manager · **R** reception · **T** trainer.

| Route | Roles | Purpose |
|---|---|---|
| `dashboard` | OM | At-a-glance metrics |
| `verify` | OMR | Access decision by code or number; auto check-in |
| `resolve-member` | OMR | Resolve scanned value → member **or trainer** |
| `access-card` | OMR | Full access card for a scanned person (**member/trainer only**) |
| `access-action` | OMR | checkin / checkout / flag / approve_visit / deny_visit |
| `attendance-live` | OMR | Live floor + today's board (~30s poll) |
| `face-descriptors` | OMR | Enrolled galleries for the turnstile (cached client-side) |
| `today` | OMR | Check-ins, who's inside, today's classes |
| `visitor` | OMR | Day passes |
| `incident` | OMR | Security incidents + owner alert |
| `members` | OM | List: `q`, `status`, `tier`, `parq`, paginated |
| `member` | OM | GET full profile · PATCH status/notes · DELETE |
| `member-action` | OM(+R for checkin) | checkin · regenerate_code · renew · change_plan |
| `members-import` | OM | CSV bulk import |
| `classes` · `class-bookings` | OM | Class CRUD; bookings, promote, attended/no-show |
| `trainers` | OM | Trainer CRUD |
| `clients` | OMT | PT client list — **trainers see only their own** |
| `training-session` | OMT | Log PT session + workout notes |
| `payments` | OM | List + breakdown; record manual cash/EFT |
| `finance` | OM | AR aging buckets + dunning email |
| `analytics` · `attendance-report` · `qr-stats` | OM | Reporting |
| `plans` · `addons` | OM | Catalog CRUD |
| `events` | OM | Calendar + blocked days |
| `broadcast` | OM | Bulk email by filter |
| `notifications` | OM | Send history from `notifications_log` |
| `announcements` | OM | Gym news |
| `inbox` | OM | GET list + unread · PATCH mark read · POST reply |
| `message` | **OMRT** | Any staff writes to management |
| `audit` | OM | Audit trail: `q`, `action`, `from`, `to`, `limit` |
| `enroll-face` | (signed-in admin) | Enrol own face |
| `profile` | (signed-in admin) | Own credential; lazily issues staff number + code |
| `settings` | **O** | GET all · PUT one `{key,value,category}` |
| `staff` | **O** | Staff CRUD |

## Member — `/api/member/*` (17 routes)

`login` · `face-login` · `status` · `checkin` · `classes` · `book-class` · `cancel-booking` ·
`history` · `profile` · `progress` · `refer` · `message` · `messages` · `announcements` ·
`request-plan-change` · `request-deletion` · `enroll-face`. *(`pay` removed 2026-09-21.)*

All except `login` / `face-login` require a member JWT (`audience: 'member'`).

## Payments — REMOVED 2026-09-21

`/api/payments/*` no longer exists. `initialize`, `purchase-pack`, `verify` and `webhook` were
deleted along with their router. Payment **recording** lives on at
`POST /api/admin/payments` (manual cash/EFT capture, owner/manager), which now also **activates the
member and their membership**. `server/lib/paystack.js` is retained for platform subscription
billing (D-021).

## Cron — `/api/cron/*`

Scheduled in `vercel.json`: `daily` (06:00) · `daily-summary` (20:00) · `weekly-schedule` (Mon 07:00).
Callable but **not separately scheduled**: `billing` (reminders only now) · `expiry` ·
**`suspend-overdue`** (renamed from `retry-suspend` 2026-09-21; opt-in per gym, off by default) ·
`reengagement` · `class-reminders` · `attendance-alerts` — each exports `run()` and is invoked by
the `daily` orchestrator. Authorised by `CRON_SECRET` when triggered externally. **[P]**

## Known documentation defect

`server/handlers/public/document.js` header says `/api/members/document`; the router registers
`document` → **`/api/document`**. The comment is wrong; the route works. Do not "fix" the route.

## Related

[[00 - Project Purpose]] · [[01 - Existing Yoyo Gym Audit]] · [[13 - Authentication and Roles]] ·
[[12 - Database Architecture]] · [[03 - Protected Existing Functions]] · [[17 - Open Questions]] ·
[[18 - Decision Log]]
